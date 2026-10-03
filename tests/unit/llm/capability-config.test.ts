import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ModelCapability } from "../../../Models/ModelCapability";

vi.mock("fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(JSON.stringify([])),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue(JSON.stringify([])),
  writeFileSync: vi.fn(),
}));

import fs from "fs";
import {
  addCapability,
  editCapability,
  removeCapability,
  getCapabilities,
  queryCapabilities,
  Capabilities,
} from "../../../LLM/capability-config";

describe("LLM Capability Config Management", () => {
  const testModelId = `test-model-${Date.now()}`;

  beforeEach(() => {
    vi.mocked(fs.writeFileSync).mockClear();
  });

  afterEach(() => {
    const index = Capabilities.findIndex((c) => c.modelId === testModelId);
    if (index !== -1) {
      Capabilities.splice(index, 1);
    }
    vi.restoreAllMocks();
  });

  it("should add a capability", () => {
    const cap: ModelCapability = {
      modelId: testModelId,
      provider: "TestProvider",
      name: "Test Model",
      capabilities: ["code-generation"],
    };

    const before = Capabilities.length;
    addCapability(cap);
    expect(Capabilities.length).toBe(before + 1);
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalled();
  });

  it("should fail to add duplicate capability", () => {
    const cap: ModelCapability = {
      modelId: testModelId,
      provider: "TestProvider",
      name: "Test Model",
    };
    addCapability(cap);
    expect(() => addCapability(cap)).toThrow("already exists");
  });

  it("should edit a capability", () => {
    const cap: ModelCapability = {
      modelId: testModelId,
      provider: "TestProvider",
      name: "Test Model",
    };
    addCapability(cap);
    editCapability(testModelId, { name: "Updated Model" });
    const updated = Capabilities.find((c) => c.modelId === testModelId);
    expect(updated?.name).toBe("Updated Model");
  });

  it("should fail to edit non-existent capability", () => {
    expect(() => editCapability("nonexistent", { name: "Nope" })).toThrow("not found");
  });

  it("should remove a capability", () => {
    const cap: ModelCapability = {
      modelId: testModelId,
      provider: "TestProvider",
      name: "Test Model",
    };
    addCapability(cap);
    removeCapability(testModelId);
    const found = Capabilities.find((c) => c.modelId === testModelId);
    expect(found).toBeUndefined();
  });

  it("should fail to remove non-existent capability", () => {
    expect(() => removeCapability("nonexistent")).toThrow("not found");
  });

  it("should return a copy of all capabilities", () => {
    addCapability({
      modelId: testModelId,
      provider: "TestProvider",
      name: "Test Model",
    });
    const all = getCapabilities();
    expect(Array.isArray(all)).toBe(true);
    expect(all.find((c) => c.modelId === testModelId)).toBeDefined();
  });

  it("should query capabilities by tag", () => {
    addCapability({
      modelId: testModelId,
      provider: "TestProvider",
      name: "Test Model",
      capabilities: ["function-calling", "code-generation"],
    });
    const results = queryCapabilities("function-calling");
    expect(results.some((c) => c.modelId === testModelId)).toBe(true);
    const noResults = queryCapabilities("translation");
    expect(noResults.some((c) => c.modelId === testModelId)).toBe(false);
  });
});
