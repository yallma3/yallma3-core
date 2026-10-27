import { describe, it, expect, vi } from "vitest";
import {
  ExecutionTracer,
  sanitizeWorkflowGraph,
} from "../../../Execution/ExecutionTracer";
import type { Workflow } from "../../../Models/Workflow";
import type { LLMProvider } from "../../../Models/LLM";

describe("ExecutionTracer — sanitizeWorkflowGraph", () => {
  it("sanitizes workflow nodes and connections into clean, machine-readable representations", () => {
    const rawWorkflow: Workflow = {
      id: "wf-test-1",
      name: "Test Flow",
      description: "Sample description",
      nodes: [
        {
          id: 1,
          title: "Prompt Input",
          nodeType: "WorkflowInput",
          category: "Input",
          x: 100,
          y: 200,
          width: 250,
          height: 150,
          selected: true,
          processing: false,
          sockets: [
            { id: 10, title: "Context", type: "output", nodeId: 1, dataType: "string" },
          ],
          configParameters: [
            {
              parameterName: "PromptTemplate",
              parameterType: "string",
              defaultValue: "default prompt",
              paramValue: "custom prompt",
              valueSource: "UserInput",
              UIConfigurable: true,
              description: "template",
              i18n: { en: { Name: "Prompt Template", Description: "Desc" } },
            },
          ],
        },
        {
          id: 2,
          title: "Processor",
          nodeType: "JSONManipulator",
          category: "Transform",
          x: 400,
          y: 200,
          sockets: [
            { id: 20, title: "Input Data", type: "input", nodeId: 2, dataType: "json" },
            { id: 21, title: "Result", type: "output", nodeId: 2, dataType: "json" },
          ],
          nodeValue: { count: 42 },
        },
      ],
      connections: [
        {
          fromSocket: 10,
          toSocket: 20,
        },
      ],
    };

    const clean = sanitizeWorkflowGraph(rawWorkflow);

    expect(clean.id).toBe("wf-test-1");
    expect(clean.name).toBe("Test Flow");
    expect(clean.description).toBe("Sample description");

    // Nodes
    expect(clean.nodes).toHaveLength(2);

    const node1 = clean.nodes[0];
    expect(node1.id).toBe(1);
    expect(node1.type).toBe("WorkflowInput");
    expect(node1.title).toBe("Prompt Input");
    expect(node1.category).toBe("Input");
    expect(node1.config).toEqual({ PromptTemplate: "custom prompt" });
    expect(node1.outputs).toEqual([{ id: 10, name: "Context", dataType: "string" }]);
    expect(node1.inputs).toEqual([]);

    // Ensure UI clutter is not present
    expect((node1 as Record<string, unknown>).x).toBeUndefined();
    expect((node1 as Record<string, unknown>).y).toBeUndefined();
    expect((node1 as Record<string, unknown>).width).toBeUndefined();
    expect((node1 as Record<string, unknown>).selected).toBeUndefined();

    const node2 = clean.nodes[1];
    expect(node2.id).toBe(2);
    expect(node2.type).toBe("JSONManipulator");
    expect(node2.nodeValue).toEqual({ count: 42 });
    expect(node2.inputs).toEqual([{ id: 20, name: "Input Data", dataType: "json" }]);
    expect(node2.outputs).toEqual([{ id: 21, name: "Result", dataType: "json" }]);

    // Connections
    expect(clean.connections).toHaveLength(1);
    expect(clean.connections[0]).toEqual({
      fromNodeId: 1,
      fromSocket: 10,
      fromSocketTitle: "Context",
      toNodeId: 2,
      toSocket: 20,
      toSocketTitle: "Input Data",
    });
  });
});

describe("ExecutionTracer — Core Capabilities", () => {
  it("records workflows, steps, and logs", () => {
    const tracer = new ExecutionTracer();

    tracer.recordWorkflow({
      id: "wf-1",
      name: "Flow 1",
      description: "test",
      nodes: [],
      connections: [],
    });

    expect(tracer.getWorkflows()).toHaveLength(1);
    expect(tracer.getWorkflows()[0].name).toBe("Flow 1");

    tracer.recordStep({
      type: "task",
      name: "Task A",
      status: "started",
      taskId: "task-1",
    });

    tracer.recordStep({
      type: "task",
      name: "Task A",
      status: "success",
      taskId: "task-1",
      durationMs: 120,
      output: { result: "done" },
    });

    const steps = tracer.getSteps();
    expect(steps).toHaveLength(2);
    expect(steps[0].stepIndex).toBe(1);
    expect(steps[0].status).toBe("started");
    expect(steps[1].stepIndex).toBe(2);
    expect(steps[1].status).toBe("success");
    expect(steps[1].output).toEqual({ result: "done" });

    tracer.recordLog({
      level: "info",
      message: "Step executed successfully",
      details: { foo: "bar" },
    });

    const logs = tracer.getLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].level).toBe("info");
    expect(logs[0].message).toBe("Step executed successfully");
  });

  it("transparently wraps an LLMProvider and records generateText interactions", async () => {
    const tracer = new ExecutionTracer();

    const mockProvider: LLMProvider = {
      supportsTools: true,
      registerTools: vi.fn(),
      generateText: vi.fn().mockResolvedValue("Mocked completion text"),
    };

    const wrapped = tracer.wrapLLM(
      mockProvider,
      {
        source: "agent",
        name: "ResearchAgent",
        action: "generate_text",
      },
      { providerName: "OpenAI", modelName: "gpt-4o" }
    );

    // Verifies passthrough properties
    expect(wrapped.supportsTools).toBe(true);

    const result = await wrapped.generateText("Analyze this problem");
    expect(result).toBe("Mocked completion text");
    expect(mockProvider.generateText).toHaveBeenCalledWith("Analyze this problem");

    const interactions = tracer.getLLMInteractions();
    expect(interactions).toHaveLength(1);
    expect(interactions[0].provider).toBe("OpenAI");
    expect(interactions[0].model).toBe("gpt-4o");
    expect(interactions[0].prompt).toBe("Analyze this problem");
    expect(interactions[0].response).toBe("Mocked completion text");
    expect(interactions[0].caller.name).toBe("ResearchAgent");
    expect(interactions[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it("transparently wraps an LLMProvider and records callLLM interactions with tool calls", async () => {
    const tracer = new ExecutionTracer();

    const mockProvider: LLMProvider = {
      supportsTools: true,
      registerTools: vi.fn(),
      generateText: vi.fn(),
      callLLM: vi.fn().mockResolvedValue({
        content: "Tool called",
        toolCalls: [{ id: "tc-1", name: "search", input: { q: "yallma3" } }],
      }),
    };

    const wrapped = tracer.wrapLLM(
      mockProvider,
      {
        source: "main_agent",
        action: "plan_task",
      },
      { providerName: "Anthropic", modelName: "claude-3-5-sonnet" }
    );

    const messages = [{ role: "user" as const, content: "Search web" }];
    const res = await wrapped.callLLM!(messages);
    expect(res.content).toBe("Tool called");

    const interactions = tracer.getLLMInteractions();
    expect(interactions).toHaveLength(1);
    expect(interactions[0].provider).toBe("Anthropic");
    expect(interactions[0].messages).toEqual(messages);
    expect(interactions[0].response).toBe("Tool called");
    expect(interactions[0].toolCalls).toEqual([
      { id: "tc-1", name: "search", input: { q: "yallma3" } },
    ]);
  });

  it("captures error response when provider throws during generateText", async () => {
    const tracer = new ExecutionTracer();

    const mockProvider: LLMProvider = {
      generateText: vi.fn().mockRejectedValue(new Error("Rate limit exceeded")),
      registerTools: vi.fn(),
    };

    const wrapped = tracer.wrapLLM(
      mockProvider,
      { source: "main_agent", action: "analyze_task" },
      { providerName: "Groq", modelName: "llama-3.3-70b" }
    );

    await expect(wrapped.generateText("Hello")).rejects.toThrow("Rate limit exceeded");

    const interactions = tracer.getLLMInteractions();
    expect(interactions).toHaveLength(1);
    expect(interactions[0].response).toContain("Error: Rate limit exceeded");
  });
});
