import type {
  BaseNode,
  NodeMetadata,
  Position,
  ConfigParameterType,
  NodeValue,
  NodeExecutionContext,
  DataType,
} from "../types/types";
import { nodeRegistry } from "../NodeRegistry";

interface HttpCallNode extends BaseNode {
  nodeType: "HttpCall";
}

type SocketDef = {
  title: string;
  type: "input" | "output";
  dataType: DataType;
};

const SOCKETS: SocketDef[] = [
  { title: "URL",           type: "input",  dataType: "string"  },
  { title: "Headers",       type: "input",  dataType: "json"    },
  { title: "Body",          type: "input",  dataType: "unknown" },
  { title: "Response Body", type: "output", dataType: "unknown" },
  { title: "Status Code",   type: "output", dataType: "number"  },
  { title: "OK?",           type: "output", dataType: "boolean" },
  { title: "Error",         type: "output", dataType: "string"  },
];

const metadata: NodeMetadata = {
  nodeType: "HttpCall",
  description: "Performs an HTTP request and returns the response body, status code, and any error.",
  category: "Tools",
  title: "HTTP Call",
  nodeValue: "",
  sockets: SOCKETS,
  width: 300,
  height: 250,
  configParameters: [
    {
      parameterName: "Method",
      parameterType: "string",
      defaultValue: "GET",
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "HTTP method to use.",
      sourceList: [
        { key: "GET",    label: "GET"    },
        { key: "POST",   label: "POST"   },
        { key: "PUT",    label: "PUT"    },
        { key: "PATCH",  label: "PATCH"  },
        { key: "DELETE", label: "DELETE" },
      ],
      i18n: {
        en: { Method: { Name: "Method",       Description: "HTTP method." } },
        ar: { Method: { Name: "طريقة الطلب", Description: "طريقة HTTP." } },
      },
    },
    {
      parameterName: "Timeout (ms)",
      parameterType: "number",
      defaultValue: 10000,
      valueSource: "UserInput",
      UIConfigurable: true,
      description: "Request timeout in milliseconds.",
      i18n: {
        en: { "Timeout (ms)": { Name: "Timeout (ms)",     Description: "Request timeout in milliseconds." } },
        ar: { "Timeout (ms)": { Name: "المهلة (مللي ث)",  Description: "مهلة الطلب بالملي ثانية." } },
      },
    },
  ],
  i18n: {
    en: { category: "Tools",  title: "HTTP Call",    nodeType: "HTTP Call",    description: "Performs an HTTP request." },
    ar: { category: "أدوات", title: "استدعاء HTTP", nodeType: "استدعاء HTTP", description: "يُنفذ طلب HTTP." },
  },
};

function createHttpCallNode(id: number, position: Position): HttpCallNode {
  return {
    id,
    nodeType: "HttpCall",
    category: metadata.category,
    title: metadata.title,
    x: position.x,
    y: position.y,
    width: metadata.width,
    height: metadata.height,
    selected: false,
    processing: false,
    nodeValue: null,
    configParameters: JSON.parse(JSON.stringify(metadata.configParameters)),

    sockets: SOCKETS.map((socket, index) => ({
      id: id * 100 + (socket.type === "input" ? index + 1 : index - 3 + 101),
      title: socket.title,
      type: socket.type,
      nodeId: id,
      dataType: socket.dataType,
    })),

    process: async (context: NodeExecutionContext) => {
      const n    = context.node as HttpCallNode;
      const base = n.id * 100;

      const url     = context.inputs[base + 1] as string | undefined;
      const headers = context.inputs[base + 2] as Record<string, string> | undefined;
      const body    = context.inputs[base + 3];

      const method  = (n.getConfigParameter?.("Method")?.paramValue      ?? "GET")  as string;
      const timeout = (n.getConfigParameter?.("Timeout (ms)")?.paramValue ?? 10000) as number;

      if (!url?.trim()) {
        n.nodeValue = null;
        return {
          [base + 101]: null,
          [base + 102]: 0,
          [base + 103]: false,
          [base + 104]: "URL is required",
        };
      }

      const controller = new AbortController();
      const timeoutId  = setTimeout(() => controller.abort(), timeout);

      try {
        const hasBody = body != null && method !== "GET" && method !== "HEAD";

        const response = await fetch(url.trim(), {
          method: method.toUpperCase(),
          headers: {
            ...(hasBody ? { "Content-Type": "application/json" } : {}),
            ...headers,
          },
          body: hasBody
            ? (typeof body === "string" ? body : JSON.stringify(body))
            : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get("content-type") ?? "";
        const data = contentType.includes("application/json")
          ? await response.json()
          : await response.text();

        n.nodeValue = data as NodeValue;

        return {
          [base + 101]: data,
          [base + 102]: response.status,
          [base + 103]: response.ok,
          [base + 104]: response.ok ? "" : `HTTP ${response.status}: ${response.statusText}`,
        };

      } catch (err: unknown) {
        clearTimeout(timeoutId);

        const message = err instanceof Error && err.name === "AbortError"
          ? `Request timed out after ${timeout}ms`
          : `Network error: ${err instanceof Error ? err.message : String(err)}`;

        n.nodeValue = null;

        return {
          [base + 101]: null,
          [base + 102]: 0,
          [base + 103]: false,
          [base + 104]: message,
        };
      }
    },

    getConfigParameters: function (): ConfigParameterType[] {
      return this.configParameters || [];
    },
    getConfigParameter: function (parameterName: string): ConfigParameterType | undefined {
      return (this.configParameters || []).find(
        (p: ConfigParameterType) => p.parameterName === parameterName
      );
    },
    setConfigParameter: function (parameterName: string, value: string | number | boolean): void {
      const param = (this.configParameters || []).find(
        (p: ConfigParameterType) => p.parameterName === parameterName
      );
      if (param) param.paramValue = value;
    },
  };
}

function register(): void {
  nodeRegistry.registerNodeType("HttpCall", createHttpCallNode, metadata);
}

export type { HttpCallNode };
export { createHttpCallNode, register };
