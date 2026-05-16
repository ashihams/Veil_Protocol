import type { TaskOp } from "./types.js";

interface Agent {
  id: string;
  status: "idle" | "busy";
}

async function executeTask(op: TaskOp, a: number, b: number): Promise<number> {
  switch (op) {
    case "add":
      return a + b;
  }
}

export class AgentPool {
  private agents: Agent[];

  constructor(size = 3) {
    this.agents = Array.from({ length: size }, (_, i) => ({
      id: `add-agent-${i + 1}`,
      status: "idle" as const,
    }));
  }

  /** Dispatch a task to the first idle agent. Throws if no agent is available. */
  async dispatch(op: TaskOp, a: number, b: number): Promise<{ result: number; agentId: string }> {
    const agent = this.agents.find((ag) => ag.status === "idle");
    if (!agent) throw new Error("no_agent_available");

    agent.status = "busy";
    try {
      const result = await executeTask(op, a, b);
      return { result, agentId: agent.id };
    } finally {
      agent.status = "idle";
    }
  }

  idleCount(): number {
    return this.agents.filter((ag) => ag.status === "idle").length;
  }
}
