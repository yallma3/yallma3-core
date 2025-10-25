import type {
  BaseNode,
  NodeMetadata,
  Socket,
  DataType,
  Position,
  NodeExecutionContext,
} from "../types/types";
import { nodeRegistry } from "../NodeRegistry";

interface HttpCallNode extends BaseNode {
  nodeType: "HttpCall";
}

const metadata: NodeMetadata = {
  nodeType: "HttpCall",
  category: "Network",
  title: "HTTP Call",
  sockets: [
    { title: "URL", type: "input", dataType: "string" },
    { title: "Method", type: "input", dataType: "string" },
    { title: "Headers", type: "input", dataType: "json" },
    { title: "Body", type: "input", dataType: "string" },
    { title: "Response", type: "output", dataType: "json" },
    { title: "Status", type: "output", dataType: "number" },
    { title: "Error", type: "output", dataType: "string" },
  ],
  width: 300,
  height: 250,
  configParameters: [
    {
      parameterName: "timeout",
      parameterType: "number",
      defaultValue: 5000,
      description: "Request timeout in milliseconds",
      valueSource: "UserInput",
      UIConfigurable: true,
    },
    {
      parameterName: "followRedirects",
      parameterType: "boolean",
      defaultValue: true,
      description: "Follow HTTP redirects",
      valueSource: "UserInput",
      UIConfigurable: true,
    },
  ],
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
    sockets: [
      {
        id: id * 100 + 1,
        title: "URL",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 2,
        title: "Method",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 3,
        title: "Headers",
        type: "input",
        nodeId: id,
        dataType: "json",
      },
      {
        id: id * 100 + 4,
        title: "Body",
        type: "input",
        nodeId: id,
        dataType: "string",
      },
      {
        id: id * 100 + 5,
        title: "Response",
        type: "output",
        nodeId: id,
        dataType: "json",
      },
      {
        id: id * 100 + 6,
        title: "Status",
        type: "output",
        nodeId: id,
        dataType: "number",
      },
      {
        id: id * 100 + 7,
        title: "Error",
        type: "output",
        nodeId: id,
        dataType: "string",
      },
    ],
    selected: false,
    processing: false,
    configParameters: metadata.configParameters,
    process: async (context: NodeExecutionContext) => {
      const n = context.node as HttpCallNode;

      try {
        // Get input values
        const url = context.inputs[n.id * 100 + 1] as string;
        const method = (context.inputs[n.id * 100 + 2] as string) || "GET";
        const headers =
          (context.inputs[n.id * 100 + 3] as Record<string, string>) || {};
        const body = context.inputs[n.id * 100 + 4] as string;

        // Get configuration parameters
        const timeoutConfig = n.getConfigParameter?.("timeout");
        const timeout = (timeoutConfig?.paramValue as number) || 5000;
        const followRedirectsConfig = n.getConfigParameter?.("followRedirects");
        const followRedirects =
          (followRedirectsConfig?.paramValue as boolean) || true;

        if (!url) {
          return {
            [n.id * 100 + 105]: {
              data: null,
              headers: {},
              url: "",
              redirected: false,
            },
            [n.id * 100 + 106]: 0,
            [n.id * 100 + 107]: "URL is required",
          };
        }

        // Prepare fetch options
        const fetchOptions: RequestInit = {
          method: method.toUpperCase(),
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          redirect: followRedirects ? "follow" : "manual",
        };

        // Add body for non-GET requests
        if (method.toUpperCase() !== "GET" && body) {
          fetchOptions.body = body;
        }

        // Create AbortController for timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        fetchOptions.signal = controller.signal;

        try {
          const response = await fetch(url, fetchOptions);
          clearTimeout(timeoutId);

          // Get response data
          let responseData: any;
          const contentType = response.headers.get("content-type");

          if (contentType && contentType.includes("application/json")) {
            responseData = await response.json();
          } else {
            responseData = await response.text();
          }

          // Return outputs
          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          const res = {
            data: responseData,
            headers: responseHeaders,
            url: response.url,
            redirected: response.redirected,
          };

          console.log("RESPONSE TYPE:", typeof res);
          console.log("RESPONSE TYPE:", typeof JSON.stringify(res));

          const result = {
            [n.id * 100 + 5]: res,
            [n.id * 100 + 6]: response.status,
            [n.id * 100 + 7]: response.ok
              ? ""
              : `HTTP ${response.status}: ${response.statusText}`,
          };

          return result;
        } catch (fetchError: any) {
          clearTimeout(timeoutId);

          const errorMessage =
            fetchError.name === "AbortError"
              ? `Request timeout after ${timeout}ms`
              : `Network error: ${fetchError.message}`;

          return {
            [n.id * 100 + 105]: {
              data: null,
              headers: {},
              url: "",
              redirected: false,
            },
            [n.id * 100 + 106]: 0,
            [n.id * 100 + 107]: errorMessage,
          };
        }
      } catch (error: any) {
        return {
          [n.id * 100 + 105]: {
            data: null,
            headers: {},
            url: "",
            redirected: false,
          },
          [n.id * 100 + 106]: 0,
          [n.id * 100 + 107]: `HTTP Call error: ${error.message}`,
        };
      }
    },
    getConfigParameters: function () {
      return this.configParameters || [];
    },
    getConfigParameter: function (parameterName: string) {
      return (this.configParameters || []).find(
        (param) => param.parameterName === parameterName
      );
    },
    setConfigParameter: function (
      parameterName: string,
      value: string | number | boolean
    ) {
      const parameter = (this.configParameters || []).find(
        (param) => param.parameterName === parameterName
      );
      if (parameter) {
        parameter.paramValue = value;
      }
    },
  };
}

function register(): void {
  nodeRegistry.registerNodeType("HttpCall", createHttpCallNode, metadata);
}

export type { HttpCallNode };
export { createHttpCallNode, register };
