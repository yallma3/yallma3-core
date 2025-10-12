import { WebSocket } from "ws";
// Define possible value types for nodes
export type NodeValue =
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>
  | null;

// Define a type for the context used in node processing
export type NodeExecutionContext = {
  node: NodeType;
  inputs: Record<string, any>;
    ws?: WebSocket;
};

export type ConfigParameterType = {
  parameterName: string;
  parameterType: "string" | "text" | "number" | "boolean";
  defaultValue: string | number | boolean;
  UIConfigurable?: boolean; // Whether the parameter is configurable in the UI, needs to be True if ValueSource is UserInput
  sourceList?: Array<{ key: string; label: string }>; // Optional list of key-value pairs for dropdowns
  valueSource: "UserInput" | "Env" | "Default" | "RuntimeVault"; // Source of the value
  paramValue?: string | number | boolean; // The value of the parameter
  isNodeBodyContent?: boolean; // Whether to notify the node when the parameter changes
  description: string;
  i18n?: Record<string, Record<string, { Name: string; Description: string }>>;
};

export interface BaseNode {
  id: number;
  category: string;
  title: string;
  nodeType: string;
  nodeValue?: NodeValue;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  sockets: Socket[];
  selected?: boolean;
  processing?: boolean;
  result?: NodeValue;
  process?: (context: NodeExecutionContext) => Promise<NodeValue | undefined>;
  configParameters?: ConfigParameterType[]; // Configuration parameters for the node
  getConfigParameters?: () => Array<ConfigParameterType>;
  getConfigParameter?: (
    parameterName: string
  ) => ConfigParameterType | undefined;

  setConfigParameter?: (
    parameterName: string,
    value: string | number | boolean
  ) => void;
}

// Define available node types
export type NodeType = BaseNode;

export type Connection = {
  fromSocket: number;
  toSocket: number;
  label?: string; // Optional label like "context", "trigger", etc.
};

export type SocketDirection = "input" | "output";
// Define types for node, socket, and connection
export type Socket = {
  id: number;
  title: string;
  type: SocketDirection; // type of the socket on the node
  nodeId: number; // Reference to the parent node
  dataType?: DataType; // The type of data this socket accepts/provides
};

export type Position = {
  x: number;
  y: number;
};

export type DataType =
  | "string"
  | "number"
  | "boolean"
  | "json"
  | "html"
  | "embedding"
  | "url"
  | "unknown";

// Node metadata type
export interface NodeMetadata {
  category: string;
  title: string;
  nodeType: string;
  nodeValue?: NodeValue;
  sockets: Array<{
    title: string;
    type: "input" | "output";
    dataType: string;
  }>;
  width: number;
  height: number;
  configParameters: ConfigParameterType[];
}
