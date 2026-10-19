import { describe, it, expect } from "vitest";
import { hashAgent } from "../../../Memory/AgentHasher";
import type { Agent } from "../../../Models/Agent";

function makeAgent(overrides?: Partial<Agent>): Agent {
  return {
    id: "test-agent",
    name: "Test Agent",
    role: "Test Role",
    objective: "Test objective",
    background: "Test background",
    capabilities: "some capabilities",
    apiKey: "test-key",
    llm: { provider: "OpenAI" as const, model: { name: "GPT-4", id: "gpt-4" } },
    tools: [],
    ...overrides,
  };
}

describe("AgentHasher", () => {
  it("should produce the same hash for identical agents", () => {
    const a = makeAgent();
    const b = makeAgent();
    expect(hashAgent(a)).toBe(hashAgent(b));
  });

  it("should produce different hashes for agents with different names", () => {
    const a = makeAgent({ name: "Agent A" });
    const b = makeAgent({ name: "Agent B" });
    expect(hashAgent(a)).not.toBe(hashAgent(b));
  });

  it("should produce the same hash regardless of tool ordering", () => {
    const a = makeAgent({
      tools: [
        { type: "function", name: "z_tool", description: "", parameters: {} },
        { type: "function", name: "a_tool", description: "", parameters: {} },
      ],
    });
    const b = makeAgent({
      tools: [
        { type: "function", name: "a_tool", description: "", parameters: {} },
        { type: "function", name: "z_tool", description: "", parameters: {} },
      ],
    });
    expect(hashAgent(a)).toBe(hashAgent(b));
  });

  it("should produce different hashes for different llm models", () => {
    const a = makeAgent({
      llm: { provider: "OpenAI" as const, model: { name: "GPT-4", id: "gpt-4" } },
    });
    const b = makeAgent({
      llm: { provider: "OpenAI" as const, model: { name: "GPT-4-Turbo", id: "gpt-4-turbo" } },
    });
    expect(hashAgent(a)).not.toBe(hashAgent(b));
  });

  it("should produce the same hash regardless of id and apiKey", () => {
    const a = makeAgent({ id: "id-a", apiKey: "key-a" });
    const b = makeAgent({ id: "id-b", apiKey: "key-b" });
    expect(hashAgent(a)).toBe(hashAgent(b));
  });
});
