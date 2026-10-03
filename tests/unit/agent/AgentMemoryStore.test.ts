import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { FileAgentMemoryStore } from "../../../Memory/AgentMemoryStore";
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

describe("FileAgentMemoryStore", () => {
  let tmpDir: string;
  let store: FileAgentMemoryStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-memory-test-"));
    store = new FileAgentMemoryStore(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create a record on first recordOutcome", () => {
    const agent = makeAgent();
    store.recordOutcome(agent, true);
    const all = store.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.name).toBe("Test Agent");
    expect(all[0]?.successes).toBe(1);
    expect(all[0]?.failures).toBe(0);
  });

  it("should increment success counter on success", () => {
    const agent = makeAgent();
    store.recordOutcome(agent, true);
    store.recordOutcome(agent, true);
    const record = store.getAgent(store.getAll()[0]!.agentId);
    expect(record?.successes).toBe(2);
    expect(record?.failures).toBe(0);
  });

  it("should increment failure counter on failure", () => {
    const agent = makeAgent();
    store.recordOutcome(agent, false);
    store.recordOutcome(agent, false);
    store.recordOutcome(agent, true);
    const record = store.getAgent(store.getAll()[0]!.agentId);
    expect(record?.successes).toBe(1);
    expect(record?.failures).toBe(2);
  });

  it("should add capabilities", () => {
    const agent = makeAgent();
    store.recordOutcome(agent, true);
    const id = store.getAll()[0]!.agentId;
    store.addCapabilities(id, ["arabic", "translation"]);
    const record = store.getAgent(id);
    expect(record?.capabilities).toEqual(["arabic", "translation"]);
  });

  it("should deduplicate capabilities on add", () => {
    const agent = makeAgent();
    store.recordOutcome(agent, true);
    const id = store.getAll()[0]!.agentId;
    store.addCapabilities(id, ["arabic"]);
    store.addCapabilities(id, ["arabic"]);
    expect(store.getAgent(id)?.capabilities).toEqual(["arabic"]);
  });

  it("should remove capabilities", () => {
    const agent = makeAgent();
    store.recordOutcome(agent, true);
    const id = store.getAll()[0]!.agentId;
    store.addCapabilities(id, ["arabic", "translation", "coding"]);
    store.removeCapabilities(id, ["translation"]);
    expect(store.getAgent(id)?.capabilities).toEqual(["arabic", "coding"]);
  });

  it("should return undefined for unknown agent", () => {
    expect(store.getAgent("nonexistent")).toBeUndefined();
  });

  it("should query by capability", () => {
    const a1 = makeAgent({ name: "Agent A" });
    const a2 = makeAgent({ name: "Agent B" });
    store.recordOutcome(a1, true);
    store.recordOutcome(a2, true);
    const id1 = store.getAll().find((r) => r.name === "Agent A")!.agentId;
    store.addCapabilities(id1, ["arabic"]);
    const results = store.queryByCapability("arabic");
    expect(results).toHaveLength(1);
    expect(results[0]?.name).toBe("Agent A");
  });

  it("should handle multiple agents independently", () => {
    const a1 = makeAgent({ name: "Alpha" });
    const a2 = makeAgent({ name: "Beta" });
    store.recordOutcome(a1, true);
    store.recordOutcome(a2, false);
    store.recordOutcome(a1, false);
    const all = store.getAll();
    expect(all).toHaveLength(2);
    const alpha = all.find((r) => r.name === "Alpha")!;
    const beta = all.find((r) => r.name === "Beta")!;
    expect(alpha.successes).toBe(1);
    expect(alpha.failures).toBe(1);
    expect(beta.successes).toBe(0);
    expect(beta.failures).toBe(1);
  });

  it("should persist records to disk", () => {
    const agent = makeAgent();
    store.recordOutcome(agent, true);
    const id = store.getAll()[0]!.agentId;
    const store2 = new FileAgentMemoryStore(tmpDir);
    const record = store2.getAgent(id);
    expect(record?.successes).toBe(1);
  });
});
