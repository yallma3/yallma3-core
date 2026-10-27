import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import type { WorkspaceData } from "../../../Models/Workspace";
import type { ExecutionContext } from "../../../Execution/ExecutionContext";
import { MainAgentV1 } from "../../../Agent/Main/Versions/MainAgentV1";
import { writeFile } from "fs/promises";
import { initFlowSystem } from "../../../Workflow/initFlowSystem";

// Mock external LLM health & file writing
vi.mock("../../../LLM/LLMRunner", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../LLM/LLMRunner")>();
  return {
    ...actual,
    testLLMHealth: vi.fn().mockResolvedValue({ ok: true }),
    getLLMProvider: vi.fn(() => ({
      supportsTools: false,
      registerTools: vi.fn(),
      generateText: vi.fn().mockResolvedValue(
        JSON.stringify({
          task_completion_status: "complete",
          feedback: "Great job",
          confidence: 0.95,
          reasoning: "Matched executor",
          plan: [{ step: 1, action: "execute" }],
          intent: "process data",
        })
      ),
      callLLM: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          task_completion_status: "complete",
          feedback: "Great job",
        }),
      }),
    })),
  };
});

vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

function createMockContext() {
  const sentMessages: unknown[] = [];
  const ctx: ExecutionContext = {
    requestId: "req-sidecar-1",
    send: vi.fn(async (msg) => {
      sentMessages.push(msg);
    }),
    onMessage: vi.fn(),
    onClose: vi.fn(() => () => {}),
    broadcast: vi.fn(),
  };
  return { ctx, sentMessages };
}

describe("Integration: YALLMA3_OUTPUT_JSON Sidecar Generation", () => {
  const originalEnv = process.env.YALLMA3_OUTPUT_JSON;

  beforeAll(() => {
    initFlowSystem();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.YALLMA3_OUTPUT_JSON;
    } else {
      process.env.YALLMA3_OUTPUT_JSON = originalEnv;
    }
  });

  it("writes enriched, machine-readable JSON sidecar with clean workflow graph, LLM interactions, and steps", async () => {
    process.env.YALLMA3_OUTPUT_JSON = "true";

    const workspace: WorkspaceData = {
      id: "ws-sidecar-demo",
      name: "Demo Analytics Workspace",
      description: "Demonstration of clean sidecar serialization",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mainLLM: {
        provider: "OpenAI",
        model: {
          id: "gpt-4o",
          name: "GPT-4o",
          contextWindow: { input: 128000, output: 4096 },
        },
      },
      apiKey: "sk-test",
      useSavedCredentials: false,
      workflows: [
        {
          id: "wf-clean-1",
          name: "Clean Ingestion Flow",
          description: "Data preparation workflow",
          nodes: [
            {
              id: 1,
              title: "Input Node",
              nodeType: "WorkflowInput",
              category: "Input",
              x: 120,
              y: 240,
              width: 200,
              height: 100,
              selected: true,
              processing: false,
              sockets: [
                { id: 101, title: "Context", type: "output", nodeId: 1, dataType: "string" },
              ],
              configParameters: [
                {
                  parameterName: "MaxTokens",
                  parameterType: "number",
                  defaultValue: 1000,
                  paramValue: 2000,
                  valueSource: "UserInput",
                  UIConfigurable: true,
                  description: "Maximum tokens",
                  i18n: { en: { Name: "Max Tokens", Description: "Desc" } },
                },
              ],
              process: async () => "Source data payload",
            },
            {
              id: 2,
              title: "Text Transformer",
              nodeType: "JSONManipulator",
              category: "Transformation",
              x: 450,
              y: 240,
              width: 220,
              height: 120,
              selected: false,
              processing: false,
              sockets: [
                { id: 201, title: "Input", type: "input", nodeId: 2, dataType: "string" },
                { id: 202, title: "Output", type: "output", nodeId: 2, dataType: "string" },
              ],
              process: async (c) => `Transformed: ${c.inputs[201]}`,
            },
          ],
          connections: [
            {
              fromSocket: 101,
              toSocket: 201,
            },
          ],
        },
      ],
      agents: [
        {
          id: "agent-eval-1",
          name: "SummarizerAgent",
          role: "Executive Analyst",
          background: "Experienced in executive summaries and data synthesis",
          description: "Produces summaries",
          systemPrompt: "You are an executive analyst.",
          tools: [],
          llm: {
            provider: "OpenAI",
            model: {
              id: "gpt-4o-mini",
              name: "GPT-4o Mini",
              contextWindow: { input: 128000, output: 4096 },
            },
          },
        },
      ],
      tasks: [
        {
          id: "task-wf-1",
          title: "Run Ingestion Workflow",
          description: "Ingest and transform source data",
          expectedOutput: "transformed string",
          type: "workflow",
          executorId: "wf-clean-1",
          position: "0",
          selected: false,
          sockets: [
            { id: 501, title: "Out", type: "output" },
          ],
        },
        {
          id: "task-agent-2",
          title: "Generate Summary",
          description: "Analyze ingested data",
          expectedOutput: "summary report",
          type: "specific-agent",
          executorId: "agent-eval-1",
          position: "1",
          selected: false,
          sockets: [
            { id: 502, title: "In", type: "input" },
          ],
        },
      ],
      connections: [
        {
          fromSocket: 501,
          toSocket: 502,
        },
      ],
    };

    const { ctx } = createMockContext();
    const agent = new MainAgentV1(workspace, ctx);
    const results = await agent.run();

    expect(results).toBeDefined();
    expect(writeFile).toHaveBeenCalled();

    // Find the call for the .json sidecar
    const jsonCall = vi.mocked(writeFile).mock.calls.find((call) =>
      String(call[0]).endsWith(".json")
    );
    expect(jsonCall).toBeDefined();

    const jsonPath = String(jsonCall![0]);
    expect(jsonPath).toContain("Output/Demo_Analytics_Workspace_");

    const payload = JSON.parse(String(jsonCall![1]));

    // 1. Workspace metadata
    expect(payload.workspace).toBe("Demo Analytics Workspace");
    expect(payload.aborted).toBe(false);

    // 2. Clean Workflow Graph verification
    expect(payload.workflows).toBeInstanceOf(Array);
    expect(payload.workflows).toHaveLength(1);

    const wf = payload.workflows[0];
    expect(wf.id).toBe("wf-clean-1");
    expect(wf.name).toBe("Clean Ingestion Flow");
    expect(wf.description).toBe("Data preparation workflow");
    expect(wf.nodes).toHaveLength(2);

    const node1 = wf.nodes[0];
    expect(node1.id).toBe(1);
    expect(node1.type).toBe("WorkflowInput");
    expect(node1.title).toBe("Input Node");
    expect(node1.category).toBe("Input");
    expect(node1.config).toEqual({ MaxTokens: 2000 });
    expect(node1.outputs).toEqual([{ id: 101, name: "Context", dataType: "string" }]);
    expect(node1.inputs).toEqual([]);

    // Clutter check: Ensure UI coordinates and editor states are stripped
    expect(node1.x).toBeUndefined();
    expect(node1.y).toBeUndefined();
    expect(node1.width).toBeUndefined();
    expect(node1.height).toBeUndefined();
    expect(node1.selected).toBeUndefined();
    expect(node1.processing).toBeUndefined();
    expect(node1.i18n).toBeUndefined();

    // Semantic connections
    expect(wf.connections).toHaveLength(1);
    expect(wf.connections[0]).toEqual({
      fromNodeId: 1,
      fromSocket: 101,
      fromSocketTitle: "Context",
      toNodeId: 2,
      toSocket: 201,
      toSocketTitle: "Input",
    });

    // 3. LLM Interactions verification
    expect(payload.llmInteractions).toBeInstanceOf(Array);
    expect(payload.llmInteractions.length).toBeGreaterThanOrEqual(1);

    for (const interaction of payload.llmInteractions) {
      expect(interaction.id).toBeDefined();
      expect(interaction.timestamp).toBeDefined();
      expect(interaction.caller).toBeDefined();
      expect(interaction.caller.source).toBeDefined();
      expect(interaction.provider).toBeDefined();
      expect(interaction.model).toBeDefined();
      expect(interaction.response).toBeDefined();
      expect(interaction.durationMs).toBeGreaterThanOrEqual(0);
    }

    // 4. Steps Logging verification
    expect(payload.steps).toBeInstanceOf(Array);
    expect(payload.steps.length).toBeGreaterThanOrEqual(2);

    // Should contain task steps and workflow node steps
    const taskSteps = payload.steps.filter((s: { type: string }) => s.type === "task");
    const nodeSteps = payload.steps.filter((s: { type: string }) => s.type === "workflow_node");

    expect(taskSteps.length).toBeGreaterThanOrEqual(2);
    expect(nodeSteps.length).toBeGreaterThanOrEqual(2);

    const executedNode1 = nodeSteps.find((s: { nodeId: number }) => s.nodeId === 1);
    expect(executedNode1).toBeDefined();
    expect(executedNode1.status).toBe("success");
    expect(executedNode1.output).toBe("Source data payload");

    const executedNode2 = nodeSteps.find((s: { nodeId: number }) => s.nodeId === 2);
    expect(executedNode2).toBeDefined();
    expect(executedNode2.status).toBe("success");
    expect(executedNode2.output).toBe("Transformed: Source data payload");

    // 5. Tasks verification
    expect(payload.tasks).toHaveLength(2);
    expect(payload.tasks[0].taskId).toBe("task-wf-1");
    expect(payload.tasks[0].status).toBe("success");
    expect(payload.tasks[1].taskId).toBe("task-agent-2");
    expect(payload.tasks[1].status).toBe("success");
  });

  it("does not write JSON sidecar file when YALLMA3_OUTPUT_JSON is not enabled", async () => {
    delete process.env.YALLMA3_OUTPUT_JSON;

    const workspace: WorkspaceData = {
      id: "ws-no-json",
      name: "No Sidecar Workspace",
      description: "",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      mainLLM: {
        provider: "OpenAI",
        model: { id: "gpt-4o", name: "GPT-4o", contextWindow: { input: 128000, output: 4096 } },
      },
      apiKey: "sk-test",
      useSavedCredentials: false,
      workflows: [],
      agents: [
        {
          id: "agent-1",
          name: "Agent 1",
          role: "Assistant",
          background: "Helper agent",
          description: "Helper",
          systemPrompt: "Helper",
          tools: [],
          llm: {
            provider: "OpenAI",
            model: { id: "gpt-4o", name: "GPT-4o", contextWindow: { input: 128000, output: 4096 } },
          },
        },
      ],
      tasks: [
        {
          id: "task-1",
          title: "Simple Task",
          description: "Test task",
          expectedOutput: "output",
          type: "specific-agent",
          executorId: "agent-1",
          position: "0",
          selected: false,
          sockets: [],
        },
      ],
      connections: [],
    };

    const { ctx } = createMockContext();
    const agent = new MainAgentV1(workspace, ctx);
    await agent.run();

    // Verify .txt was written but NO .json
    const calls = vi.mocked(writeFile).mock.calls;
    const txtCall = calls.find((c) => String(c[0]).endsWith(".txt"));
    const jsonCall = calls.find((c) => String(c[0]).endsWith(".json"));

    expect(txtCall).toBeDefined();
    expect(jsonCall).toBeUndefined();
  });
});
