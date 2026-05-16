import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { Server } from "node:http";
import { createServer } from "./server.js";
import { buildPaymentPayload } from "./payment-service.js";
import type { PaymentRequired, TaskResponse, SettlementResponse } from "./types.js";

const SHARED_SECRET = new TextEncoder().encode("test-secret-midnight");
const PAY_TO = "0x0000000000000000000000000000000000000001";

function getPort(server: Server): number {
  const addr = server.address();
  if (typeof addr === "object" && addr !== null) return addr.port;
  throw new Error("server not listening");
}

function post(
  port: number,
  body: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: Record<string, string>; body: unknown }> {
  return new Promise((resolve, reject) => {
    const json = JSON.stringify(body);
    const req = http.request(
      {
        hostname: "127.0.0.1", port, path: "/task", method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(json),
          "Connection": "close",
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              headers: res.headers as Record<string, string>,
              body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
            });
          } catch (e) { reject(e); }
        });
      },
    );
    req.on("error", reject);
    req.end(json);
  });
}

describe("agent-server x402 flow", () => {
  let server: Server;
  let port: number;

  beforeAll(() => new Promise<void>((resolve) => {
    server = createServer({ port: 0, sharedSecret: SHARED_SECRET, payTo: PAY_TO });
    server.listen(0, "127.0.0.1", () => { port = getPort(server); resolve(); });
  }));

  afterAll(() => new Promise<void>((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve());
  }));

  it("no payment header → 402 + X-Payment-Required header", async () => {
    const { status, headers } = await post(port, { op: "add", a: 2, b: 3 });
    expect(status).toBe(402);
    expect(headers["x-payment-required"]).toBeTruthy();
    const required = JSON.parse(
      Buffer.from(headers["x-payment-required"], "base64").toString("utf8"),
    ) as PaymentRequired;
    expect(required.x402Version).toBe(2);
    expect(required.accepts[0].scheme).toBe("midnight-hmac");
  });

  it("invalid payment signature → 402", async () => {
    const badPayload = Buffer.from(
      JSON.stringify({ x402Version: 2, resource: {}, accepted: {}, payload: { signature: "0xbad", authorization: {} } }),
    ).toString("base64");
    const { status } = await post(port, { op: "add", a: 2, b: 3 }, {
      "X-Payment-Signature": badPayload,
    });
    expect(status).toBe(402);
  });

  it("valid payment → 200 with result and X-Payment-Response", async () => {
    // Step 1: get challenge
    const challenge = await post(port, { op: "add", a: 2, b: 3 });
    expect(challenge.status).toBe(402);
    const required = JSON.parse(
      Buffer.from(challenge.headers["x-payment-required"], "base64").toString("utf8"),
    ) as PaymentRequired;

    // Step 2: build valid payment and retry
    const payloadObj = buildPaymentPayload(
      required,
      SHARED_SECRET,
      { op: "add", a: 2, b: 3 },
      required.error.includes("Payment") ? "req-1" : "req-1",
    );
    const payloadHeader = Buffer.from(JSON.stringify(payloadObj)).toString("base64");

    const result = await post(port, { op: "add", a: 2, b: 3 }, {
      "X-Payment-Signature": payloadHeader,
    });

    expect(result.status).toBe(200);
    expect((result.body as TaskResponse).result).toBe(5);
    expect((result.body as TaskResponse).agentId).toMatch(/add-agent-/);
    expect(result.headers["x-payment-response"]).toBeTruthy();
    const settlement = JSON.parse(
      Buffer.from(result.headers["x-payment-response"], "base64").toString("utf8"),
    ) as SettlementResponse;
    expect(settlement.success).toBe(true);
    expect(settlement.transaction).toBeTruthy();
  });

  it("concurrent requests use different agents", async () => {
    // All three requests in parallel — pool has 3 agents so all should succeed
    const requests = [
      { op: "add" as const, a: 1, b: 1 },
      { op: "add" as const, a: 2, b: 2 },
      { op: "add" as const, a: 3, b: 3 },
    ];

    // First get all challenges
    const challenges = await Promise.all(requests.map((task) => post(port, task)));
    const payloads = challenges.map((c, i) => {
      const required = JSON.parse(
        Buffer.from(c.headers["x-payment-required"], "base64").toString("utf8"),
      ) as PaymentRequired;
      return buildPaymentPayload(required, SHARED_SECRET, requests[i], `req-${i}`);
    });

    const results = await Promise.all(
      requests.map((task, i) =>
        post(port, task, {
          "X-Payment-Signature": Buffer.from(JSON.stringify(payloads[i])).toString("base64"),
        }),
      ),
    );

    expect(results.every((r) => r.status === 200)).toBe(true);
    const agentIds = results.map((r) => (r.body as TaskResponse).agentId);
    expect(new Set(agentIds).size).toBe(3);
  });
});
