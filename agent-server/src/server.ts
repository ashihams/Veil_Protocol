import { createServer as httpCreateServer, type Server } from "node:http";
import {
  generateRequestId,
  buildPaymentRequired,
  verifyAndExtract,
  buildSettlementResponse,
} from "./payment-service.js";
import { AgentPool } from "./agent-pool.js";
import type { TaskRequest } from "./types.js";

export interface ServerOptions {
  port: number;
  /** Shared HMAC secret for payment proof verification */
  sharedSecret: Uint8Array;
  /** Server wallet address (mock) */
  payTo: string;
}

/** Browser demos (Vite on another origin) need CORS + exposed payment headers. */
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Payment-Signature",
  "Access-Control-Expose-Headers": "X-Payment-Required, X-Payment-Response",
};

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(
  res: import("node:http").ServerResponse,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    ...CORS_HEADERS,
    ...headers,
  });
  res.end(json);
}

export function createServer(opts: ServerOptions): Server {
  const pool = new AgentPool();

  const server = httpCreateServer(async (req, res) => {
    if (req.url === "/task" && req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    if (req.method !== "POST" || req.url !== "/task") {
      send(res, 404, { error: "not_found" });
      return;
    }

    let task: TaskRequest;
    try {
      const body = await readBody(req);
      task = JSON.parse(body) as TaskRequest;
    } catch {
      send(res, 400, { error: "invalid_json" });
      return;
    }

    if (task.op !== "add" || typeof task.a !== "number" || typeof task.b !== "number") {
      send(res, 400, { error: "invalid_task" });
      return;
    }

    const paymentHeader = req.headers["x-payment-signature"] as string | undefined;

    if (!paymentHeader) {
      const requestId = generateRequestId();
      const required = buildPaymentRequired(requestId, task, opts.payTo);
      send(res, 402, required, {
        "X-Payment-Required": Buffer.from(JSON.stringify(required)).toString("base64"),
      });
      return;
    }

    const { valid, auth, reason } = verifyAndExtract(
      paymentHeader,
      opts.sharedSecret,
      opts.payTo,
    );

    if (!valid || !auth) {
      const requestId = generateRequestId();
      const required = buildPaymentRequired(requestId, task, opts.payTo);
      send(res, 402, { ...required, error: reason ?? "payment_invalid" }, {
        "X-Payment-Required": Buffer.from(JSON.stringify(required)).toString("base64"),
      });
      return;
    }

    let result: number;
    let agentId: string;
    try {
      ({ result, agentId } = await pool.dispatch(task.op, task.a, task.b));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "dispatch_error";
      send(res, 503, { error: msg });
      return;
    }

    const settlement = buildSettlementResponse(auth);
    send(res, 200, { result, agentId }, {
      "X-Payment-Response": Buffer.from(JSON.stringify(settlement)).toString("base64"),
    });
  });

  return server;
}

export function start(opts: ServerOptions): Server {
  const server = createServer(opts);
  server.listen(opts.port, () => {
    console.log(`Phantom Protocol · listening http://localhost:${opts.port}`);
    console.log(`POST /task  — requires X-Payment-Signature header after 402 challenge`);
  });
  return server;
}
