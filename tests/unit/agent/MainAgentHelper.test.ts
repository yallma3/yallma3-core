import { describe, it, expect, vi } from "vitest";
import { generateWorkflowYaml, generateAgentYaml } from "../../../Agent/Utls/MainAgentHelper";
import type { Workflow } from "../../../Models/Workflow";
import type { BaseNode, Connection, Socket } from "../../../Workflow/types/types";
import type { Agent } from "../../../Models/Agent";
import type { LLMProvider } from "../../../Models/LLM";

function inputSocket(id: number, nodeId: number): Socket {
  return { id, title: "Input", type: "input", nodeId, dataType: "string" };
}

function outputSocket(id: number, nodeId: number): Socket {
  return { id, title: "Output", type: "output", nodeId, dataType: "string" };
}

function node(overrides: Partial<BaseNode> & { id: number; title: string }): BaseNode {
  return {
    ...overrides,
    category: overrides.category ?? "Test",
    nodeType: overrides.nodeType ?? "Generic",
    sockets: overrides.sockets ?? [],
    x: overrides.x ?? 0,
    y: overrides.y ?? 0,
    width: overrides.width ?? 100,
    height: overrides.height ?? 100,
    selected: overrides.selected ?? false,
    processing: overrides.processing ?? false,
  };
}

function workflowInputNode(id: number, title = "Workflow Input"): BaseNode {
  return node({
    id,
    title,
    nodeType: "WorkflowInput",
    sockets: [outputSocket(id * 100 + 2, id)],
  });
}

function workflowOutputNode(id: number, title = "Workflow Output"): BaseNode {
  return node({
    id,
    title,
    nodeType: "WorkflowOutput",
    sockets: [inputSocket(id * 100 + 1, id)],
  });
}

function sourceNode(id: number, title: string): BaseNode {
  return node({
    id,
    title,
    sockets: [outputSocket(id * 100 + 2, id)],
  });
}

function sinkNode(id: number, title: string): BaseNode {
  return node({
    id,
    title,
    sockets: [inputSocket(id * 100 + 1, id)],
  });
}

function capNode(id: number, title: string): BaseNode {
  return node({
    id,
    title,
    sockets: [inputSocket(id * 100 + 1, id), outputSocket(id * 100 + 2, id)],
  });
}

function conn(fromSocket: number, toSocket: number): Connection {
  return { fromSocket, toSocket };
}

function makeWorkflow(overrides: Partial<Workflow> & { nodes: BaseNode[]; connections: Connection[] }): Workflow {
  return {
    id: overrides.id ?? "wf-1",
    name: overrides.name ?? "Test Workflow",
    description: overrides.description ?? "A test workflow",
    nodes: overrides.nodes,
    connections: overrides.connections,
  };
}

describe("generateWorkflowYaml", () => {
  it("should return empty categories for empty workflow", () => {
    const wf = makeWorkflow({ nodes: [], connections: [] });
    const result = generateWorkflowYaml(wf);

    expect(result).toBe([
      "ID: wf-1",
      "Type: workflow",
      "Name: Test Workflow",
      "Objective: A test workflow",
      "Input: ",
      "Capabilities: ",
      "Output: ",
    ].join("\n"));
  });

  it("should exclude WorkflowInput and WorkflowOutput nodes from all categories", () => {
    const wf = makeWorkflow({
      nodes: [workflowInputNode(1), workflowOutputNode(2)],
      connections: [],
    });

    const result = generateWorkflowYaml(wf);

    expect(result).toContain("Input: ");
    expect(result).toContain("Capabilities: ");
    expect(result).toContain("Output: ");
    expect(result).not.toContain("Workflow Input");
    expect(result).not.toContain("Workflow Output");
  });

  describe("Input category", () => {
    it("should classify source-only nodes (no input, has output) as Input", () => {
      const n1 = sourceNode(1, "DataFetcher");
      const wf = makeWorkflow({ nodes: [n1], connections: [] });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Input: DataFetcher");
    });

    it("should classify nodes connected to WorkflowInput as Input", () => {
      const wi = workflowInputNode(1);
      const n2 = capNode(2, "Processor");
      const wf = makeWorkflow({
        nodes: [wi, n2],
        connections: [conn(102, 201)],
      });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Input: Processor");
    });

    it("should include multiple input sources", () => {
      const n1 = sourceNode(1, "FetcherA");
      const n2 = sourceNode(2, "FetcherB");
      const wf = makeWorkflow({ nodes: [n1, n2], connections: [] });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Input: FetcherA, FetcherB");
    });
  });

  describe("Capabilities category", () => {
    it("should classify nodes with both input and output sockets as Capabilities", () => {
      const n1 = capNode(1, "Transformer");
      const wf = makeWorkflow({ nodes: [n1], connections: [] });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Capabilities: Transformer");
    });

    it("should not include source-only or sink-only nodes in Capabilities", () => {
      const n1 = sourceNode(1, "Fetcher");
      const n2 = sinkNode(2, "Logger");
      const n3 = capNode(3, "Processor");
      const wf = makeWorkflow({ nodes: [n1, n2, n3], connections: [] });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Capabilities: Processor");
      expect(result).not.toContain("Capabilities: Fetcher");
      expect(result).not.toContain("Capabilities: Logger");
    });
  });

  describe("Output category", () => {
    it("should classify sink-only nodes (has input, no output) as Output", () => {
      const n1 = sinkNode(1, "ResultSaver");
      const wf = makeWorkflow({ nodes: [n1], connections: [] });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Output: ResultSaver");
    });

    it("should classify nodes feeding into WorkflowOutput as Output", () => {
      const n1 = capNode(1, "FinalProcessor");
      const wo = workflowOutputNode(2);
      const wf = makeWorkflow({
        nodes: [n1, wo],
        connections: [conn(102, 201)],
      });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Output: FinalProcessor");
    });
  });

  describe("Mixed workflow", () => {
    it("should correctly categorize all nodes in a full workflow", () => {
      const wi = workflowInputNode(1);
      const fetcher = sourceNode(2, "DataFetcher");
      const processor = capNode(3, "DataProcessor");
      const formatter = capNode(4, "Formatter");
      const saver = sinkNode(5, "DatabaseSaver");
      const notifier = sinkNode(6, "Notifier");
      const wo = workflowOutputNode(7);

      const wf = makeWorkflow({
        id: "wf-demo",
        name: "Data Pipeline",
        description: "Fetch, process, format, save, and notify",
        nodes: [wi, fetcher, processor, formatter, saver, notifier, wo],
        connections: [
          conn(102, 301),   // WorkflowInput -> DataProcessor
          conn(202, 301),   // DataFetcher -> DataProcessor
          conn(302, 401),   // DataProcessor -> Formatter
          conn(402, 501),   // Formatter -> DatabaseSaver
          conn(402, 601),   // Formatter -> Notifier
          conn(402, 701),   // Formatter -> WorkflowOutput
        ],
      });

      const result = generateWorkflowYaml(wf);

      expect(result).toContain("ID: wf-demo");
      expect(result).toContain("Name: Data Pipeline");
      expect(result).toContain("Objective: Fetch, process, format, save, and notify");
      expect(result).toContain("Input: DataFetcher, DataProcessor");
      expect(result).toContain("Capabilities: DataProcessor, Formatter");
      expect(result).toContain("Output: DatabaseSaver, Formatter, Notifier");
    });
  });

  describe("Deduplication", () => {
    it("should not duplicate a node within the same category", () => {
      const n1 = sourceNode(1, "Sensor");
      const wi = workflowInputNode(2);
      const wf = makeWorkflow({
        nodes: [n1, wi],
        connections: [conn(202, 101)],
      });

      const result = generateWorkflowYaml(wf);

      const inputLine = result.split("\n").find((l) => l.startsWith("Input:"));
      expect(inputLine).toBe("Input: Sensor");
    });

    it("should handle a node appearing in all three categories", () => {
      const wi = workflowInputNode(1);
      const n2 = capNode(2, "Hub");
      const wo = workflowOutputNode(3);
      const wf = makeWorkflow({
        nodes: [wi, n2, wo],
        connections: [
          conn(102, 201),
          conn(202, 301),
        ],
      });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Input: Hub");
      expect(result).toContain("Capabilities: Hub");
      expect(result).toContain("Output: Hub");
    });
  });

  describe("Edge cases", () => {
    it("should use empty string when description is missing", () => {
      const n1 = sourceNode(1, "A");
      const wf = makeWorkflow({
        nodes: [n1],
        connections: [],
        description: "",
      });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Objective: ");
    });

    it("should sort titles alphabetically", () => {
      const n1 = sourceNode(1, "Zebra");
      const n2 = sourceNode(2, "Alpha");
      const n3 = sourceNode(3, "Beta");
      const wf = makeWorkflow({ nodes: [n1, n2, n3], connections: [] });

      const result = generateWorkflowYaml(wf);
      expect(result).toContain("Input: Alpha, Beta, Zebra");
    });
  });
});

describe("generateAgentYaml", () => {
  const agent: Agent = {
    id: "agent-research",
    name: "Research Assistant",
    role: "Conduct research and summarize findings",
    objective: "Help users research topics",
    background: "Expert researcher with web search and analysis capabilities",
    capabilities: "Web search, content analysis, summarization, citation management",
    tools: [
      { type: "function", name: "web_search", description: "Search the web", parameters: {} },
      { type: "function", name: "scrape_url", description: "Scrape a URL", parameters: {} },
    ],
    llm: { provider: "OpenAI", model: { id: "gpt-4", name: "GPT-4", contextWindow: { input: 128000, output: 4096 } } },
    apiKey: "test-key",
  };

  const agentNoTools: Agent = {
    ...agent,
    id: "agent-no-tools",
    name: "Simple Bot",
    tools: [],
  };

  function mockLLM(response: string): LLMProvider {
    return {
      generateText: vi.fn().mockResolvedValue(response),
      supportsTools: false,
      registerTools: vi.fn(),
    };
  }

  it("should return basic YAML fields from agent data", async () => {
    const llm = mockLLM(JSON.stringify({
      typicalInput: "A research question or topic URL",
      assumedCapabilities: "Web search and content analysis",
      typicalOutput: "A structured summary with citations",
    }));

    const result = await generateAgentYaml(llm, agent);

    expect(result).toContain("ID: agent-research");
    expect(result).toContain("Type: agent");
    expect(result).toContain("Name: Research Assistant");
    expect(result).toContain("Objective: Conduct research and summarize findings");
  });

  it("should include typicalInput, Capabilities, and typicalOutput from LLM response", async () => {
    const llm = mockLLM(JSON.stringify({
      typicalInput: "A research question or topic URL",
      assumedCapabilities: "Web search and content analysis",
      typicalOutput: "A structured summary with citations",
    }));

    const result = await generateAgentYaml(llm, agent);

    expect(result).toContain("Input: A research question or topic URL");
    expect(result).toContain("Capabilities: Web search and content analysis, web_search, scrape_url");
    expect(result).toContain("Output: A structured summary with citations");
  });

  it("should only use assumedCapabilities when agent has no tools", async () => {
    const llm = mockLLM(JSON.stringify({
      typicalInput: "A simple query",
      assumedCapabilities: "Basic question answering",
      typicalOutput: "A short answer",
    }));

    const result = await generateAgentYaml(llm, agentNoTools);

    expect(result).toContain("Capabilities: Basic question answering");
    expect(result).not.toContain(", ");
  });

  it("should handle missing LLM response fields gracefully", async () => {
    const llm = mockLLM(JSON.stringify({
      typicalInput: "Any text",
    }));

    const result = await generateAgentYaml(llm, agent);

    expect(result).toContain("Input: Any text");
    expect(result).toContain("Capabilities: , web_search, scrape_url");
    expect(result).toContain("Output: ");
  });

  it("should throw when LLM response contains no valid JSON", async () => {
    const llm = mockLLM("not json at all");

    await expect(generateAgentYaml(llm, agent)).rejects.toThrow("Failed to generate agent YAML");
  });
});
