import crypto from "node:crypto";
import type { Agent } from "../Models/Agent";

function canonicalJson(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => {
    const v = obj[k];
    return `${JSON.stringify(k)}:${v === undefined ? "null" : JSON.stringify(v)}`;
  });
  return `{${pairs.join(",")}}`;
}

export function hashAgent(agent: Agent): string {
  const toolNames = agent.tools.map((t) => t.name).sort();
  const canonical = {
    name: agent.name,
    role: agent.role,
    objective: agent.objective,
    background: agent.background,
    llm: {
      provider: agent.llm?.provider ?? null,
      model: agent.llm?.model?.id ?? null,
    },
    tools: toolNames,
  };
  const json = canonicalJson(canonical);
  return crypto.createHash("sha256").update(json, "utf-8").digest("hex");
}
