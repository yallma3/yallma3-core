import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LLMModel } from "../../../Models/LLM";
import {
  addModel,
  editModel,
  removeModel,
  AvailableLLMs,
} from "../../../LLM/config";

describe("LLM Config Management", () => {
  const testProvider = "Groq";
  const testModelId = `test-model-${Date.now()}`;

  beforeEach(() => {
    vi.spyOn(require("fs"), "writeFileSync").mockImplementation(() => {});
  });

  afterEach(() => {
    const models = AvailableLLMs[testProvider];
    const index = models.findIndex((m) => m.id === testModelId);
    if (index !== -1) {
      models.splice(index, 1);
    }
    vi.restoreAllMocks();
  });

  it("should add a new model", () => {
    const newModel: LLMModel = {
      id: testModelId,
      name: "Test Model",
      contextWindow: { input: 100, output: 100 },
    };

    const modelsBefore = AvailableLLMs[testProvider].length;
    addModel(testProvider, newModel);
    const modelsAfter = AvailableLLMs[testProvider].length;

    expect(modelsAfter).toBe(modelsBefore + 1);
    const added = AvailableLLMs[testProvider].find((m) => m.id === testModelId);
    expect(added).toBeDefined();
    expect(added?.name).toBe("Test Model");
  });

  it("should edit an existing model", () => {
    const newModel: LLMModel = {
      id: testModelId,
      name: "Test Model",
      contextWindow: { input: 100, output: 100 },
      readonly: false,
    };
    addModel(testProvider, newModel);

    editModel(testProvider, testModelId, { name: "Updated Name" });

    const updated = AvailableLLMs[testProvider].find((m) => m.id === testModelId);
    expect(updated?.name).toBe("Updated Name");
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

    removeModel(testProvider, testModelId);

    const found = AvailableLLMs[testProvider].find((m) => m.id === testModelId);
    expect(found).toBeUndefined();
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
