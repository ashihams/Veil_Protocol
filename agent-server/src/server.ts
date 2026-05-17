import { createServer as httpCreateServer, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
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

/** Default browser origins (Vercel preview + local Vite). Override with CORS_ORIGINS. */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://veil-protocol-frontend-vite-react-z.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

/**
 * `CORS_ORIGINS=*` → allow any origin (no credentials).
 * Else comma-separated origins, or unset → DEFAULT_ALLOWED_ORIGINS.
 */
function loadCorsAllowedOrigins(): Set<string> | null {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (raw === "*") return null;
  if (raw)
    return new Set(
      raw
        .split(",")
        .map((s) => s.trim().replace(/\/$/, ""))
        .filter(Boolean),
    );
  return new Set(DEFAULT_ALLOWED_ORIGINS.map((o) => o.replace(/\/$/, "")));
}

function buildCorsHeaders(
  origin: string | undefined,
  allowed: Set<string> | null,
): Record<string, string> {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Payment-Signature",
    "Access-Control-Expose-Headers": "X-Payment-Required, X-Payment-Response",
    "Access-Control-Max-Age": "86400",
  };

  if (allowed === null) {
    return { ...base, "Access-Control-Allow-Origin": "*" };
  }

  const o = origin?.replace(/\/$/, "");
  if (o && allowed.has(o)) {
    return {
      ...base,
      "Access-Control-Allow-Origin": o,
      "Access-Control-Allow-Credentials": "true",
      Vary: "Origin",
    };
  }

  if (!origin) {
    return { ...base, "Access-Control-Allow-Origin": "*" };
  }

  return base;
}

function isTaskPath(req: IncomingMessage): boolean {
  const u = req.url ?? "/";
  try {
    const p = new URL(u, "http://localhost").pathname;
    return p === "/task" || p === "/task/";
  } catch {
    return u === "/task" || u.startsWith("/task?") || u.startsWith("/task/");
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(
  req: IncomingMessage,
  res: ServerResponse,
  allowed: Set<string> | null,
  status: number,
  body: unknown,
  headers?: Record<string, string>,
): void {
  const origin = req.headers.origin as string | undefined;
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    ...buildCorsHeaders(origin, allowed),
    ...headers,
  });
  res.end(json);
}

export function createServer(opts: ServerOptions): Server {
  const pool = new AgentPool();
  const allowed = loadCorsAllowedOrigins();

  const server = httpCreateServer(async (req, res) => {
    const origin = req.headers.origin as string | undefined;
    const cors = buildCorsHeaders(origin, allowed);

    if (req.method === "OPTIONS" && isTaskPath(req)) {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (req.method !== "POST" || !isTaskPath(req)) {
      send(req, res, allowed, 404, { error: "not_found" });
      return;
    }

    let task: TaskRequest;
    try {
      const body = await readBody(req);
      task = JSON.parse(body) as TaskRequest;
    } catch {
      send(req, res, allowed, 400, { error: "invalid_json" });
      return;
    }

    if (task.op !== "add" || typeof task.a !== "number" || typeof task.b !== "number") {
      send(req, res, allowed, 400, { error: "invalid_task" });
      return;
    }

    const paymentHeader = req.headers["x-payment-signature"] as string | undefined;

    if (!paymentHeader) {
      const requestId = generateRequestId();
      const required = buildPaymentRequired(requestId, task, opts.payTo);
      send(req, res, allowed, 402, required, {
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
      send(req, res, allowed, 402, { ...required, error: reason ?? "payment_invalid" }, {
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
      send(req, res, allowed, 503, { error: msg });
      return;
    }

    const settlement = buildSettlementResponse(auth);
    send(req, res, allowed, 200, { result, agentId }, {
      "X-Payment-Response": Buffer.from(JSON.stringify(settlement)).toString("base64"),
    });
  });

  return server;
}

export function start(opts: ServerOptions): Server {
  const server = createServer(opts);
  server.listen(opts.port, () => {
    const mode =
      process.env.CORS_ORIGINS?.trim() === "*"
        ? "CORS *"
        : `CORS origins: ${process.env.CORS_ORIGINS?.trim() || "default (Vercel + localhost)"}`;
    console.log(`Veil Protocol · listening http://localhost:${opts.port} (${mode})`);
    console.log(`POST /task  — requires X-Payment-Signature header after 402 challenge`);
  });
  return server;
}
