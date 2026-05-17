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

/** Set `AGENT_DEBUG_ROUTES=0` to silence `method url` logs. */
const LOG_ROUTES = process.env.AGENT_DEBUG_ROUTES !== "0";

/** Default browser origins (Vercel preview + local Vite). Override with CORS_ORIGINS. */
const DEFAULT_ALLOWED_ORIGINS = [
  "https://veil-stealth-protocol.vercel.app",
  "https://veil-protocol-frontend-vite-react-z.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

/**
 * Unset or `CORS_ORIGINS=*` → `Access-Control-Allow-Origin: *` (any frontend; no credentials).
 * Else comma-separated origins → reflect matching Origin + credentials.
 */
function loadCorsAllowedOrigins(): Set<string> | null {
  const raw = process.env.CORS_ORIGINS?.trim();
  if (!raw || raw === "*") return null;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
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

/** Path only: `/task`, `/task?x=1`, `//task//` → `/task` */
export function getNormalizedPathname(req: IncomingMessage): string {
  let raw = req.url ?? "/";
  /** Collapse duplicate leading slashes so `//task` is not parsed as URL-with-authority. */
  raw = raw.replace(/^\/+/, "/");
  let path: string;
  try {
    path = new URL(raw, "http://127.0.0.1").pathname;
  } catch {
    const q = raw.indexOf("?");
    path = q >= 0 ? raw.slice(0, q) : raw;
  }
  const segs = path.split("/").filter(Boolean);
  if (segs.length === 0) return "/";
  return "/" + segs.join("/");
}

function methodIs(req: IncomingMessage, m: string): boolean {
  return (req.method ?? "").trim().toUpperCase() === m;
}

function isTaskPath(req: IncomingMessage): boolean {
  return getNormalizedPathname(req) === "/task";
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
    if (LOG_ROUTES) {
      console.log(req.method, req.url, JSON.stringify(getNormalizedPathname(req)));
    }

    const origin = req.headers.origin as string | undefined;
    const cors = buildCorsHeaders(origin, allowed);

    if (methodIs(req, "OPTIONS") && isTaskPath(req)) {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    if (!methodIs(req, "POST") || !isTaskPath(req)) {
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
  const host = process.env.LISTEN_HOST ?? "0.0.0.0";
  server.listen(opts.port, host, () => {
    const corsEnv = process.env.CORS_ORIGINS?.trim();
    const mode =
      !corsEnv || corsEnv === "*"
        ? "CORS * (open)"
        : `CORS origins: ${corsEnv}`;
    console.log(`Veil Protocol · listening http://${host}:${opts.port} (${mode})`);
    console.log(`POST /task  — requires X-Payment-Signature header after 402 challenge`);
  });
  return server;
}
