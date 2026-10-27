import type { Workflow } from "../../Models/Workflow";
import type { WorkspaceData } from "../../Models/Workspace";
import type { BaseNode, Socket } from "../types/types";
import { nodeRegistry } from "../NodeRegistry";

/**
 * Normalizes incoming workflow wire payloads into canonical Workflow objects.
 * Populates missing category and static sockets from NodeRegistry while preserving
 * custom titles, dynamic sockets, and enriched config parameters.
 */
export function normalizeWorkflowPayload(rawWorkflow: Workflow): Workflow {
  if (!rawWorkflow || typeof rawWorkflow !== "object") {
    return rawWorkflow;
  }

  const nodes = Array.isArray(rawWorkflow.nodes)
    ? rawWorkflow.nodes.map((nodeData: BaseNode): BaseNode => {
        const factory = nodeRegistry.getFactory(nodeData.nodeType);
        const metadata = nodeRegistry.getMetadata(nodeData.nodeType);

        // Determine category: preserve if present, else fallback to metadata or "Other"
        const category = nodeData.category || metadata?.category || "Other";

        // Determine sockets: preserve if provided (including dynamic sockets), else re-derive from factory
        let sockets: Socket[] = Array.isArray(nodeData.sockets) ? nodeData.sockets : [];
        if (sockets.length === 0 && factory) {
          const freshNode = factory(nodeData.id, { x: nodeData.x ?? 0, y: nodeData.y ?? 0 });
          sockets = freshNode.sockets;
        }

        return {
          ...nodeData,
          category,
          x: nodeData.x ?? 0,
          y: nodeData.y ?? 0,
          sockets,
        };
      })
    : [];

  return {
    ...rawWorkflow,
    nodes,
    connections: Array.isArray(rawWorkflow.connections) ? rawWorkflow.connections : [],
  };
}

/**
 * Normalizes all workflows embedded within a WorkspaceData payload.
 */
export function normalizeWorkspacePayload(rawWorkspace: WorkspaceData): WorkspaceData {
  if (!rawWorkspace || typeof rawWorkspace !== "object") {
    return rawWorkspace;
  }

  const workflows = Array.isArray(rawWorkspace.workflows)
    ? rawWorkspace.workflows.map((wf) => normalizeWorkflowPayload(wf))
    : [];

  return {
    ...rawWorkspace,
    workflows,
  };
}
