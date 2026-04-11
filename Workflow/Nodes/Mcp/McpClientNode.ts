/*
 * yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 *
 * Copyright (C) 2025 yaLLMa3
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://www.mozilla.org/MPL/2.0/.
 */

import type { NodeRegistry } from "../../NodeRegistry";
import type {
  BaseNode,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  NodeMetadata,
  Position,
} from "../../types/types";

import { McpHttpClient } from "../../../Utils/McpHttpClient";
import { McpSTDIOClient } from "../../../Utils/McpStdioClient";
import { getLLMProvider } from "../../../LLM/LLMRunner";
import { getWorkspaceDataForTools } from "../../../Agent/Utls/ToolCallingHelper";

export interface McpClientNode extends BaseNode {
  nodeType: string;
  nodeValue?: NodeValue;
  process: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
}

const metadata: NodeMetadata = {
  category: "MCP",
  title: "MCP Client",
  nodeType: "McpClient",
  description:
    "Connect to any MCP server via HTTP or Stdio. Call tools, read resources, or get prompts — manually or let the AI agent decide dynamically.",
  nodeValue: "",
  sockets: [
    { title: "Input",  type: "input",  dataType: "string" },
    { title: "Output", type: "output", dataType: "string" },
  ],
  width: 300,
  height: 200,
  configParameters: [
    {
      parameterName: "Selection Mode",
      parameterType: "string",
      defaultValue: "manual",
      valueSource: "UserInput",
      UIConfigurable: true,
      sourceList: [
        { key: "manual",  label: "Manual"       },
        { key: "dynamic", label: "Dynamic (AI)" },
      ],
      description: "Manual: you pick the capability. Dynamic: the AI agent picks based on input.",
      isNodeBodyContent: false,
      i18n: {
        en: { "Selection Mode": { Name: "Selection Mode", Description: "How the capability is selected" } },
        ar: { "Selection Mode": { Name: "وضع الاختيار",  Description: "كيفية اختيار الإمكانية"         } },
      },
    },
    {
      parameterName: "Capability Type",
      parameterType: "string",
      defaultValue: "tool",
      valueSource: "UserInput",
      UIConfigurable: true,
      sourceList: [
        { key: "tool",     label: "Tool"     },
        { key: "resource", label: "Resource" },
        { key: "prompt",   label: "Prompt"   },
      ],
      description: "Which MCP capability to invoke.",
      isNodeBodyContent: false,
      i18n: {
        en: { "Capability Type": { Name: "Capability Type", Description: "Type of MCP capability" } },
        ar: { "Capability Type": { Name: "نوع الإمكانية",  Description: "نوع إمكانية MCP"          } },
      },
    },
    {
      parameterName: "Transport Type",
      parameterType: "string",
      defaultValue: "http",
      valueSource: "UserInput",
      UIConfigurable: true,
      sourceList: [
        { key: "http",  label: "HTTP"  },
        { key: "stdio", label: "Stdio" },
      ],
      description: "Transport mechanism to use",
      isNodeBodyContent: false,
      i18n: {
        en: { "Transport Type": { Name: "Transport Type", Description: "Transport mechanism" } },
        ar: { "Transport Type": { Name: "نوع النقل",     Description: "آلية النقل"          } },
      },
    },
    // ── HTTP ───────────────────────────────────────────────────────────────
    {
      parameterName: "MCP Server URL",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "URL of the MCP server (HTTP transport)",
      isNodeBodyContent: false,
      i18n: {
        en: { "MCP Server URL": { Name: "MCP Server URL", Description: "URL of the MCP server" } },
        ar: { "MCP Server URL": { Name: "رابط خادم MCP", Description: "رابط خادم MCP"         } },
      },
    },
    {
      parameterName: "Authentication Token",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Authentication token for the MCP server (if required)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Authentication Token": { Name: "Authentication Token", Description: "Auth token" } },
        ar: { "Authentication Token": { Name: "رمز المصادقة",         Description: "رمز المصادقة" } },
      },
    },
    // ── Stdio ──────────────────────────────────────────────────────────────
    {
      parameterName: "Command",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Command to launch the MCP server (Stdio transport)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Command": { Name: "Command", Description: "Command to run MCP server" } },
        ar: { "Command": { Name: "الأمر",   Description: "الأمر لتشغيل خادم MCP"   } },
      },
    },
    {
      parameterName: "Args",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Space-separated arguments e.g. -y some-mcp-server",
      isNodeBodyContent: false,
      i18n: {
        en: { "Args": { Name: "Args",       Description: "Command arguments separated by space" } },
        ar: { "Args": { Name: "المعاملات", Description: "معاملات الأمر مفصولة بمسافة"          } },
      },
    },
    {
      parameterName: "Env Variables",
      parameterType: "text",
      defaultValue: "{}",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: 'JSON env vars e.g. {"API_KEY":"secret"}',
      isNodeBodyContent: false,
      i18n: {
        en: { "Env Variables": { Name: "Env Variables",   Description: "Environment variables as JSON" } },
        ar: { "Env Variables": { Name: "متغيرات البيئة", Description: "متغيرات البيئة كـ JSON"        } },
      },
    },
    // ── Capability identifiers — set by the discovery UI ──────────────────
    {
      parameterName: "Tool Name",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: false,
      description: "Tool name to call (set by discovery UI)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Tool Name": { Name: "Tool Name",   Description: "Tool to call" } },
        ar: { "Tool Name": { Name: "اسم الأداة", Description: "الأداة"       } },
      },
    },
    {
      parameterName: "Resource URI",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: false,
      description: "Resource URI to read (set by discovery UI)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Resource URI": { Name: "Resource URI", Description: "Resource to read" } },
        ar: { "Resource URI": { Name: "رابط المورد", Description: "المورد للقراءة"   } },
      },
    },
    {
      parameterName: "Prompt Name",
      parameterType: "string",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: false,
      description: "Prompt name to retrieve (set by discovery UI)",
      isNodeBodyContent: false,
      i18n: {
        en: { "Prompt Name": { Name: "Prompt Name",   Description: "Prompt to get" } },
        ar: { "Prompt Name": { Name: "اسم المطالبة", Description: "المطالبة"       } },
      },
    },
    // ── Input JSON (tool arguments / prompt arguments) ─────────────────────
    {
      parameterName: "Input JSON",
      parameterType: "text",
      defaultValue: "{}",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: 'Arguments as JSON e.g. {"url":"https://example.com/feed"}',
      isNodeBodyContent: false,
      i18n: {
        en: { "Input JSON": { Name: "Input JSON", Description: "Tool arguments as JSON" } },
        ar: { "Input JSON": { Name: "مدخل JSON",  Description: "معاملات الأداة كـ JSON" } },
      },
    },
    // ── Dynamic Mode: AI instructions ──────────────────────────────────────
    {
      parameterName: "Dynamic Instructions",
      parameterType: "text",
      defaultValue: "",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Instructions for the AI to decide which capability to use and how.",
      isNodeBodyContent: false,
      i18n: {
        en: { "Dynamic Instructions": { Name: "Dynamic Instructions", Description: "AI instructions" } },
        ar: { "Dynamic Instructions": { Name: "تعليمات ديناميكية",   Description: "تعليمات الذكاء الاصطناعي" } },
      },
    },
  ],
  i18n: {
    en: {
      category: "MCP",
      title: "MCP Client",
      nodeType: "MCP Client",
      description: "Connect to an MCP server and call tools, resources, or prompts — manually or dynamically via AI.",
    },
    ar: {
      category: "MCP",
      title: "عميل MCP",
      nodeType: "عميل MCP",
      description: "الاتصال بخادم MCP واستدعاء الأدوات أو الموارد أو المطالبات — يدوياً أو ديناميكياً عبر الذكاء الاصطناعي.",
    },
  },
};

// ── Build the right transport client ─────────────────────────────────────────

async function buildClient(n: McpClientNode): Promise<McpHttpClient | McpSTDIOClient> {
  const get = (name: string) => {
    const param = n.getConfigParameter?.(name);
    return String(param?.paramValue ?? param?.defaultValue ?? "");
  };

  const transport = (get("Transport Type") || "http").toLowerCase();

  if (transport === "http") {
    const url = get("MCP Server URL");
    if (!url) throw new Error("MCP Server URL is not configured.");
    return new McpHttpClient(url);
  }

  if (transport === "stdio") {
    const command = get("Command");
    if (!command) throw new Error("Command is required for Stdio transport.");
    const args   = get("Args");
    const envStr = get("Env Variables") || "{}";
    let envVars: Record<string, string> = {};
    try { envVars = JSON.parse(envStr); } catch { /* ignore */ }
    return new McpSTDIOClient({
      command,
      args: args ? args.split(" ").filter(Boolean) : [],
      env: envVars,
    });
  }

  throw new Error(`Unsupported Transport Type: ${transport}`);
}

// ── Dynamic AI selector ───────────────────────────────────────────────────────

interface DiscoveredCapabilities {
  tools:     { name: string; description?: string }[];
  resources: { name: string; uri: string; description?: string }[];
  prompts:   { name: string; description?: string; arguments?: unknown[] }[];
}

interface DynamicDecision {
  type:  "tool" | "resource" | "prompt";
  name:  string;
  input: Record<string, unknown>;
  reason: string;
}

async function aiSelectCapability(
  input: string,
  instructions: string,
  capabilities: DiscoveredCapabilities,
  llmOption: import("../../../Models/LLM").LLMOption,
  apiKey: string
): Promise<DynamicDecision> {
  // Uses the workspace's main LLM — same provider/model/key configured in workspace settings
  const llm = getLLMProvider(llmOption, apiKey);

  const prompt = `You are an MCP capability selector. Pick the best capability for the given input.

Available Tools:
${capabilities.tools.map(t => `- name: "${t.name}" | desc: "${t.description ?? ""}"`).join("\n") || "none"}

Available Resources:
${capabilities.resources.map(r => `- uri: "${r.uri}" | name: "${r.name}" | desc: "${r.description ?? ""}"`).join("\n") || "none"}

Available Prompts:
${capabilities.prompts.map(p => `- name: "${p.name}" | desc: "${p.description ?? ""}"`).join("\n") || "none"}

${instructions ? `Extra instructions: ${instructions}` : ""}

User input: ${input || "Perform the most appropriate action."}

Reply ONLY with this JSON (no markdown, no extra text):
{"type":"tool"|"resource"|"prompt","name":"exact name/URI","input":{},"reason":"one sentence"}`;

  const raw = await llm.generateText(prompt);

  const cleaned = raw.replace(/\`\`\`json|\`\`\`/g, "").trim();
  const jsonStart = cleaned.indexOf("{");
  const jsonEnd   = cleaned.lastIndexOf("}") + 1;
  if (jsonStart === -1) throw new Error("AI selector returned no JSON. Response: " + raw.substring(0, 300));
  return JSON.parse(cleaned.substring(jsonStart, jsonEnd)) as DynamicDecision;
}

// ── Node factory ──────────────────────────────────────────────────────────────

export function createMcpClientNode(id: number, position: Position): McpClientNode {
  return {
    id,
    category:  metadata.category,
    title:     metadata.title,
    nodeValue: metadata.nodeValue,
    nodeType:  metadata.nodeType,
    sockets: [
      { id: id * 100 + 1, title: "Input",  type: "input",  nodeId: id, dataType: "string" },
      { id: id * 100 + 2, title: "Output", type: "output", nodeId: id, dataType: "string" },
    ],
    x:          position.x,
    y:          position.y,
    width:      metadata.width,
    height:     metadata.height,
    selected:   false,
    processing: false,

    process: async (context: NodeExecutionContext) => {
      const n   = context.node as McpClientNode;
      const get = (name: string) => {
        const param = n.getConfigParameter?.(name);
        return String(param?.paramValue ?? param?.defaultValue ?? "");
      };

      const socketInput =
        ((await context.inputs[n.id * 100 + 1]) as string | undefined)?.trim() ?? "";

      const selectionMode  = (get("Selection Mode")  || "manual").toLowerCase();
      const capabilityType = (get("Capability Type") || "tool").toLowerCase();

      let client: McpHttpClient | McpSTDIOClient | null = null;

      try {
        client = await buildClient(n);
        await client.init();

        // ── DYNAMIC MODE ───────────────────────────────────────────────────
        if (selectionMode === "dynamic") {
          const instructions = get("Dynamic Instructions");

          const stdioClient = client as McpSTDIOClient;
          const [toolsResult, resourcesResult, promptsResult] = await Promise.allSettled([
            client.listTools(),
            typeof stdioClient.listResources === "function" ? stdioClient.listResources() : Promise.resolve([]),
            typeof stdioClient.listPrompts   === "function" ? stdioClient.listPrompts()   : Promise.resolve([]),
          ]);

          const capabilities: DiscoveredCapabilities = {
            tools:     toolsResult.status     === "fulfilled" ? (toolsResult.value     as { name: string; description?: string }[])                       : [],
            resources: resourcesResult.status === "fulfilled" ? (resourcesResult.value as { name: string; uri: string; description?: string }[])          : [],
            prompts:   promptsResult.status   === "fulfilled" ? (promptsResult.value   as { name: string; description?: string; arguments?: unknown[] }[]) : [],
          };
          const wsData = getWorkspaceDataForTools() as any;
          const llmOption = wsData?.mainLLM;
          const apiKey: string = wsData?.apiKey ?? "";

          if (!llmOption) {
            throw new Error("Dynamic mode: workspace data not available. Make sure the workspace has a Main LLM configured.");
          }

          const decision = await aiSelectCapability(socketInput, instructions, capabilities, llmOption, apiKey);
          console.log(`[McpClient][Dynamic] AI chose: ${decision.type} → ${decision.name}`, decision.reason);

          let result: unknown;

          if (decision.type === "tool") {
            result = await client.callTool({ tool: decision.name, input: decision.input });
          } else if (decision.type === "resource") {
            if (typeof stdioClient.getResource !== "function") throw new Error("This transport does not support resources.");
            result = await stdioClient.getResource(decision.name);
          } else {
            if (typeof stdioClient.getPrompt !== "function") throw new Error("This transport does not support prompts.");
            result = await stdioClient.getPrompt(decision.name);
          }

          await client.close();
          client = null;

          return {
            [n.id * 100 + 2]: JSON.stringify({
              mode: "dynamic",
              selected: { type: decision.type, name: decision.name, reason: decision.reason },
              result,
            }, null, 2),
          };
        }

        // ── MANUAL MODE ────────────────────────────────────────────────────

        // --- TOOL ---
        if (capabilityType === "tool") {
          let toolName  = get("Tool Name");
          let inputJSON = get("Input JSON") || "{}";

          if (socketInput) {
            if (socketInput.startsWith("{")) {
              try {
                const parsed = JSON.parse(socketInput) as Record<string, unknown>;
                if (typeof parsed.tool === "string") {
                  toolName  = parsed.tool;
                  inputJSON = JSON.stringify(parsed.input ?? {});
                } else {
                  inputJSON = socketInput;
                }
              } catch { inputJSON = socketInput; }
            } else if (!socketInput.startsWith("[")) {
              toolName = socketInput;
            }
          }

          if (!toolName) {
            const errMsg = "Tool Name is not configured. Open the node panel, click \"Choose...\" to connect and pick a tool.";
            console.error("[McpClient]", errMsg);
            return { [n.id * 100 + 2]: `Error: ${errMsg}` };
          }

          let inputRecord: Record<string, unknown> = {};
          if (inputJSON.trim() && inputJSON.trim() !== "{}") {
            const sanitized = inputJSON.replace(/[\u0000-\u001F\u007F]/g, (c) =>
              ({ "\n": "\\n", "\r": "\\r", "\t": "\\t" }[c] ?? "")
            );
            try {
              inputRecord = JSON.parse(sanitized);
            } catch {
              return { [n.id * 100 + 2]: `Error: Input JSON is invalid. Got: ${inputJSON}` };
            }
          }

          console.log(`[McpClient] Connected. Calling tool: ${toolName}`, inputRecord);
          const result = await client.callTool({ tool: toolName, input: inputRecord });
          await client.close();
          client = null;
          return { [n.id * 100 + 2]: JSON.stringify(result, null, 2) };
        }

        // --- RESOURCE ---
        if (capabilityType === "resource") {
          let resourceUri = get("Resource URI");

          if (socketInput && !socketInput.startsWith("{")) {
            resourceUri = socketInput;
          } else if (socketInput.startsWith("{")) {
            try {
              const parsed = JSON.parse(socketInput) as Record<string, unknown>;
              if (typeof parsed.uri === "string") resourceUri = parsed.uri;
            } catch { /* ignore */ }
          }

          if (!resourceUri) {
            const errMsg = "Resource URI is not configured. Open the node panel and choose a resource.";
            return { [n.id * 100 + 2]: `Error: ${errMsg}` };
          }

          const stdioClient = client as McpSTDIOClient;
          if (typeof stdioClient.getResource !== "function") throw new Error("This transport does not support resources.");
          const result = await stdioClient.getResource(resourceUri);
          await client.close();
          client = null;
          return { [n.id * 100 + 2]: JSON.stringify(result, null, 2) };
        }

        // --- PROMPT ---
        if (capabilityType === "prompt") {
          let promptName = get("Prompt Name");

          if (socketInput) {
            if (socketInput.startsWith("{")) {
              try {
                const parsed = JSON.parse(socketInput) as Record<string, unknown>;
                if (typeof parsed.prompt === "string") promptName = parsed.prompt;
              } catch { /* ignore */ }
            } else {
              promptName = socketInput;
            }
          }

          if (!promptName) {
            const errMsg = "Prompt Name is not configured. Open the node panel and choose a prompt.";
            return { [n.id * 100 + 2]: `Error: ${errMsg}` };
          }

          const stdioClient = client as McpSTDIOClient;
          if (typeof stdioClient.getPrompt !== "function") throw new Error("This transport does not support prompts.");
          const result = await stdioClient.getPrompt(promptName);
          await client.close();
          client = null;
          return { [n.id * 100 + 2]: JSON.stringify(result, null, 2) };
        }

        throw new Error(`Unknown Capability Type: ${capabilityType}`);

      } catch (error) {
        console.error("[McpClient] Error:", error);
        if (client) {
          try { await client.close(); } catch { /* ignore */ }
        }
        return {
          [n.id * 100 + 2]: `Error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    configParameters: metadata.configParameters,
    getConfigParameters(): ConfigParameterType[] { return this.configParameters ?? []; },
    getConfigParameter(name: string): ConfigParameterType | undefined {
      return (this.configParameters ?? []).find((p) => p.parameterName === name);
    },
    setConfigParameter(name: string, value: string | number | boolean | undefined): void {
      const p = (this.configParameters ?? []).find((p) => p.parameterName === name);
      if (p) p.paramValue = value;
    },
  };
}

export function register(nodeRegistry: NodeRegistry): void {
  nodeRegistry.registerNodeType("McpClient", createMcpClientNode, metadata);
}