/**
 * Fixtures representing Goal 2 Lean Runtime Payloads sent by Studio over WebSocket.
 * In Goal 2:
 * - Canvas geometry (x, y, width, height) is stripped.
 * - Presentation catalogs (sourceList, i18n, valueSource, UIConfigurable) are stripped.
 * - category, selected, processing, result, nodeValue, and process are stripped.
 * - sockets and connections are preserved.
 * - configParameters are enriched with types, descriptions, and resolved paramValues.
 */

export const createGoal2WorkflowPayload = () => ({
  id: "wf-goal2-demo",
  name: "Goal 2 Execution Flow",
  description: "Test flow with Goal 2 lean serialization",
  nodes: [
    {
      id: 1,
      nodeType: "HttpCall",
      title: "Custom HTTP Request",
      description: "Performs an HTTP request and returns the response",
      sockets: [
        { id: 101, title: "URL", type: "input", nodeId: 1, dataType: "string" },
        { id: 102, title: "Headers", type: "input", nodeId: 1, dataType: "json" },
        { id: 103, title: "Body", type: "input", nodeId: 1, dataType: "unknown" },
        { id: 104, title: "Response Body", type: "output", nodeId: 1, dataType: "unknown" },
        { id: 105, title: "Status Code", type: "output", nodeId: 1, dataType: "number" },
        { id: 106, title: "OK?", type: "output", nodeId: 1, dataType: "boolean" },
        { id: 107, title: "Error", type: "output", nodeId: 1, dataType: "string" },
      ],
      configParameters: [
        {
          parameterName: "Method",
          paramValue: "POST",
          defaultValue: "GET",
          parameterType: "string",
          description: "HTTP method to use.",
        },
        {
          parameterName: "Timeout (ms)",
          paramValue: 5000,
          defaultValue: 10000,
          parameterType: "number",
          description: "Request timeout in milliseconds.",
        },
      ],
    },
    {
      id: 2,
      nodeType: "Join",
      title: "Join Text Blocks",
      description: "Concatenates input strings together",
      sockets: [
        { id: 201, title: "Input 1", type: "input", nodeId: 2, dataType: "string" },
        { id: 202, title: "Input 2", type: "input", nodeId: 2, dataType: "string" },
        { id: 203, title: "Input 3", type: "input", nodeId: 2, dataType: "string" },
        { id: 204, title: "Output", type: "output", nodeId: 2, dataType: "string" },
      ],
      configParameters: [
        {
          parameterName: "Input Count",
          paramValue: 3,
          defaultValue: 2,
          parameterType: "number",
          description: "Number of inputs to concatenate.",
        },
        {
          parameterName: "Separator",
          paramValue: ", ",
          defaultValue: " ",
          parameterType: "string",
          description: "String separator between joined items.",
        },
      ],
    },
  ],
  connections: [
    {
      fromSocket: 104,
      toSocket: 201,
    },
  ],
});

export const createGoal2WorkspacePayload = () => ({
  id: "ws-goal2-test",
  name: "Goal 2 Workspace",
  description: "Workspace with Goal 2 workflows",
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
  apiKey: "test-api-key",
  useSavedCredentials: false,
  tasks: [],
  connections: [],
  agents: [],
  workflows: [createGoal2WorkflowPayload()],
});
