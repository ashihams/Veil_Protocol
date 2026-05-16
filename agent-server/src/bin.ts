import { start } from "../src/server.js";

// Default dev secret — override via AGENT_SERVER_SECRET env var
const secretStr = process.env.AGENT_SERVER_SECRET ?? "midnight-demo-secret";
const sharedSecret = new TextEncoder().encode(secretStr);
const payTo = process.env.AGENT_SERVER_PAY_TO ?? "0x0000000000000000000000000000000000000001";
const port = Number(process.env.PORT ?? 3402);

start({ port, sharedSecret, payTo });
