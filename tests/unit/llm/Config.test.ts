import { describe, it, expect, vi, afterEach } from "vitest";
import type { LLMModel } from "../../../Models/LLM";
import fs from "fs";
import {
  addModel,
  editModel,
  removeModel,
  AvailableLLMs,
} from "../../../LLM/config";

// Mock fs.writeFileSync to avoid writing to disk during tests
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
  };
});

describe("LLM Config Management", () => {
  const testProvider = "Groq"; // Using an existing provider key
  const testModelId = "test-model-id-12345";

  afterEach(() => {
    // Cleanup: remove the test model from AvailableLLMs if it exists
    // We do this manually to avoid triggering the mocked writeFileSync unnecessarily or logic constraints
    // although calling removeModel is fine too if we are careful about readonly.
    const models = AvailableLLMs[testProvider];
    const index = models.findIndex((m) => m.id === testModelId);
    if (index !== -1) {
      models.splice(index, 1);
    }
    vi.clearAllMocks();
  });

  it("should add a new model", () => {
    const newModel: LLMModel = {
      id: testModelId,
      name: "Test Model",
      contextWindow: { input: 100, output: 100 },
    };

    addModel(testProvider, newModel);

    const models = AvailableLLMs[testProvider];
    const added = models.find((m) => m.id === testModelId);
    expect(added).toBeDefined();
    expect(added?.name).toBe("Test Model");
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("should edit an existing model", () => {
    const newModel: LLMModel = {
      id: testModelId,
      name: "Test Model",
      contextWindow: { input: 100, output: 100 },
      readonly: false,
    };
    addModel(testProvider, newModel);
    vi.clearAllMocks(); // Clear write from add

    editModel(testProvider, testModelId, { name: "Updated Name" });

    const models = AvailableLLMs[testProvider];
    const updated = models.find((m) => m.id === testModelId);
    expect(updated?.name).toBe("Updated Name");
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("should fail to edit a readonly model", () => {
    const readOnlyModel: LLMModel = {
      id: testModelId,
      name: "Readonly Model",
      contextWindow: { input: 100, output: 100 },
      readonly: true,
    };
    addModel(testProvider, readOnlyModel);

    expect(() => {
      editModel(testProvider, testModelId, { name: "Try Update" });
    }).toThrow("read-only");
  });

  it("should remove a model", () => {
    const newModel: LLMModel = {
      id: testModelId,
      name: "Test Model",
      contextWindow: { input: 100, output: 100 },
      readonly: false,
    };
    addModel(testProvider, newModel);
    vi.clearAllMocks();

    removeModel(testProvider, testModelId);

    const models = AvailableLLMs[testProvider];
    const found = models.find((m) => m.id === testModelId);
    expect(found).toBeUndefined();
    expect(fs.writeFileSync).toHaveBeenCalled();
  });

  it("should fail to remove a readonly model", () => {
    const readOnlyModel: LLMModel = {
      id: testModelId,
      name: "Readonly Model",
      contextWindow: { input: 100, output: 100 },
      readonly: true,
    };
    addModel(testProvider, readOnlyModel);

    expect(() => {
      removeModel(testProvider, testModelId);
    }).toThrow("read-only");
  });
});
