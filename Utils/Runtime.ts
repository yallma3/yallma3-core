import type { ExecutionContext } from "../Execution/ExecutionContext";
import { getMainAgent } from "../Agent/Main/MainAgentRegistry";
import { Helper } from "./Helper";
import { WorkspaceRepository } from "../Execution/WorkspaceRepository";

export function createMainAgent(data: string, ctx: ExecutionContext, triggerData?: unknown) {
  try {
    const workspaceData = Helper.JsonParser.parse(data);
    const repo = WorkspaceRepository.getInstance();
    repo.set(workspaceData.id, workspaceData);
    repo.setCurrent(workspaceData.id);
    const agent = getMainAgent("1.0.0", workspaceData, ctx, triggerData); 
    return agent;
  } catch (error) {
    throw new Error(
      `Invalid workspace data: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
