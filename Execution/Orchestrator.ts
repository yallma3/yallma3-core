import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { WorkspaceRepository } from "./WorkspaceRepository";
import { TriggerExecutionContext } from "./ExecutionContext";
import type { ExecutionContext, WorkflowMessage } from "./ExecutionContext";
import { createMainAgent } from "../Utils/Runtime";
import { executeFlowRuntime, requestStop } from "../Workflow/runtime";
import { Helper } from "../Utils/Helper";
import { scheduledTriggerManager } from "../Trigger/ScheduledTriggerManager";
import type { WorkspaceData } from "../Models/Workspace";
import type { Workflow } from "../Models/Workflow";

function safeName(name: string): string {
  if (!name) return '_';
  return name
    .replace(/[/\\]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/\0/g, '')
    .replace(/^\.+/, '_')
    .trim() || '_';
}

function isPathSafe(resolvedPath: string, basePath: string): boolean {
  try {
    const normalizedResolved = path.resolve(resolvedPath);
    const normalizedBase = path.resolve(basePath);
    return normalizedResolved.startsWith(normalizedBase + path.sep) ||
           normalizedResolved === normalizedBase;
  } catch {
    return false;
  }
}

export type WorkflowResult = {
  layers: number[][];
  results: Record<number, unknown>;
  finalResult: unknown;
};

export class ExecutionOrchestrator {
  constructor(
    private repo: WorkspaceRepository,
    private broadcast: (data: unknown) => void,
  ) {}

  async runWorkspace(workspaceId: string, ctx: ExecutionContext, triggerData?: unknown): Promise<void> {
    const workspaceData = this.repo.get(workspaceId);
    if (!workspaceData) {
      console.error(`[Orchestrator] No workspace data found for ${workspaceId}`);
      return;
    }
    const agent = createMainAgent(JSON.stringify(workspaceData), ctx, triggerData);
    await agent.run();
  }

  async runWorkflow(workflow: Workflow, ctx: ExecutionContext, triggerData?: unknown): Promise<WorkflowResult | Error> {
    const result = await executeFlowRuntime(
      workflow,
      ctx,
      undefined,
      triggerData,
      this.broadcast,
    );
    return result as WorkflowResult | Error;
  }

  abortWorkspace(workspaceId: string): void {
    requestStop(workspaceId);
  }

  async onScheduledTrigger(workspaceId: string): Promise<void> {
    console.log(`[Orchestrator] Executing workspace ${workspaceId} via scheduled trigger`);

    const workspaceData = this.repo.get(workspaceId);

    if (!workspaceData) {
      console.error(`[Orchestrator] No workspace data found for ${workspaceId}`);
      const nextExecutionTime = scheduledTriggerManager.getNextExecutionTime(workspaceId);
      this.broadcast({
        type: "trigger_execution",
        workspaceId,
        data: {
          success: false,
          message: "Workspace data not found",
          nextExecutionTime,
        },
      });
      return;
    }

    try {
      this.broadcast({
        type: "message",
        data: {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "system",
          message: `Workspace triggered by schedule: ${workspaceId}`,
        },
        timestamp: new Date().toISOString(),
      });

      const ctx = new TriggerExecutionContext(this.broadcast);

      ctx.onMessage(async (msg) => {
        if (msg.type !== "run_workflow") return;
        await this.executeTriggerWorkflow(msg, workspaceData, workspaceId, ctx);
      });

      const workspaceAgent = createMainAgent(JSON.stringify(workspaceData), ctx);
      await workspaceAgent.run();

      const nextExecutionTime = scheduledTriggerManager.getNextExecutionTime(workspaceId);

      console.log(`[Orchestrator] Workspace ${workspaceId} execution completed successfully`);
      this.broadcast({
        type: "trigger_execution",
        workspaceId,
        data: {
          success: true,
          nextExecutionTime,
          executedAt: Date.now(),
        },
      });
    } catch (error) {
      console.error(`[Orchestrator] Error executing workspace ${workspaceId}:`, error);
      const nextExecutionTime = scheduledTriggerManager.getNextExecutionTime(workspaceId);
      this.broadcast({
        type: "trigger_execution",
        workspaceId,
        data: {
          success: false,
          message: String(error),
          nextExecutionTime,
        },
      });
    }
  }

  async onWebhookTrigger(workspaceId: string, payload: Record<string, unknown>): Promise<void> {
    console.log(`[Orchestrator] Executing workspace ${workspaceId} via webhook`);

    const workspaceData = this.repo.get(workspaceId);

    if (!workspaceData) {
      console.error(`[Orchestrator] No workspace data found for ${workspaceId}`);
      return;
    }

    try {
      this.broadcast({
        type: "message",
        data: {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "system",
          message: `Workspace triggered by webhook: ${workspaceId}`,
        },
        timestamp: new Date().toISOString(),
      });

      const ctx = new TriggerExecutionContext(this.broadcast);
      ctx.triggerData = payload;

      ctx.onMessage(async (msg) => {
        if (msg.type !== "run_workflow") return;
        await this.executeTriggerWorkflow(msg, workspaceData, workspaceId, ctx, payload);
      });

      const workspaceAgent = createMainAgent(JSON.stringify(workspaceData), ctx, payload);
      await workspaceAgent.run();

      console.log(`[Orchestrator] Webhook execution completed successfully`);
      this.broadcast({
        type: "webhook_execution",
        workspaceId,
        data: {
          success: true,
          executedAt: Date.now(),
          payload,
        },
      });
    } catch (error) {
      console.error(`[Orchestrator] Error executing workspace ${workspaceId} via webhook:`, error);
      this.broadcast({
        type: "webhook_execution",
        workspaceId,
        data: {
          success: false,
          message: String(error),
        },
      });
    }
  }

  async onTelegramTrigger(workspaceId: string, update: Record<string, unknown>): Promise<void> {
    console.log(`[Orchestrator] Executing workspace ${workspaceId} via Telegram`);

    const workspaceData = this.repo.get(workspaceId);

    if (!workspaceData) {
      console.error(`[Orchestrator] No workspace data found for ${workspaceId}`);
      this.broadcast({
        type: "telegram_execution",
        workspaceId,
        data: {
          success: false,
          message: "Workspace data not found",
        },
      });
      return;
    }

    try {
      this.broadcast({
        type: "message",
        data: {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          type: "system",
          message: `Workspace triggered by Telegram: ${workspaceId}`,
        },
        timestamp: new Date().toISOString(),
      });

      const ctx = new TriggerExecutionContext(this.broadcast);
      ctx.triggerData = update;

      ctx.onMessage(async (msg) => {
        if (msg.type !== "run_workflow") return;
        await this.executeTriggerWorkflow(msg, workspaceData, workspaceId, ctx, update);
      });

      const workspaceAgent = createMainAgent(JSON.stringify(workspaceData), ctx, update);
      await workspaceAgent.run();

      console.log(`[Orchestrator] Telegram execution completed successfully`);
      this.broadcast({
        type: "telegram_execution",
        workspaceId,
        data: {
          success: true,
          executedAt: Date.now(),
          update,
        },
      });
    } catch (error) {
      console.error(`[Orchestrator] Error executing Telegram workspace ${workspaceId}:`, error);
      this.broadcast({
        type: "telegram_execution",
        workspaceId,
        data: {
          success: false,
          message: String(error),
        },
      });
    }
  }

  private async executeTriggerWorkflow(
    msg: WorkflowMessage,
    workspaceData: WorkspaceData,
    workspaceId: string,
    ctx: TriggerExecutionContext,
    triggerData?: unknown,
  ): Promise<void> {
    let workflow = msg.data as Record<string, unknown>;
    const workflowId = msg.id || msg.requestId;

    if (workflow && typeof workflow === "object") {
      if ("workflow" in workflow) workflow = workflow.workflow as Record<string, unknown>;
      else if ("data" in workflow) workflow = workflow.data as Record<string, unknown>;
    }

    if (!workflow || typeof workflow !== "object") {
      const targetId = String(msg.data ?? "");
      const foundWf = workspaceData.workflows.find(
        (w: { id: string }) => w.id === targetId,
      );
      if (foundWf) workflow = foundWf as unknown as Record<string, unknown>;
    }

    if (
      (!workflow || !("nodes" in workflow) || !Array.isArray(workflow.nodes)) &&
      workflow &&
      "id" in workflow
    ) {
      const basePath = this.repo.getPath(workspaceId);
      if (basePath) {
        const flowsPath = path.join(basePath, "flows", `${safeName(String(workflow.id))}.json`);
        const rootNamePath = workflow.name
          ? path.join(basePath, `${safeName(String(workflow.name))}.json`)
          : null;

        if (!isPathSafe(flowsPath, basePath) ||
            (rootNamePath && !isPathSafe(rootNamePath, basePath))) {
          console.error("[Orchestrator] Path traversal attempt detected");
          return;
        }

        let fullPath: string | null = null;
        if (fs.existsSync(flowsPath)) fullPath = flowsPath;
        else if (rootNamePath && fs.existsSync(rootNamePath)) fullPath = rootNamePath;

        if (fullPath) {
          try {
            const fileContent = fs.readFileSync(fullPath, "utf-8");
                const graphData = Helper.JsonParser.parse(fileContent) as Record<string, unknown>;
                let nodes = graphData.nodes;
                let connections = graphData.connections;
                if (graphData.canvasState) {
                  const cs = graphData.canvasState as Record<string, unknown>;
                  nodes = cs.nodes;
                  connections = cs.connections;
                }
            if (nodes) {
              workflow.nodes = nodes;
              workflow.connections = connections || [];
              console.log(
                `[Orchestrator] Hydrated '${(workflow as Record<string, unknown>).name || workflow.id}' from disk! Nodes: ${(nodes as unknown[]).length}`,
              );
            }
          } catch (err) {
            console.error("[Orchestrator] Disk read failed:", err);
          }
        }
      }
    }

    if (
      !workflow ||
      !("nodes" in workflow) ||
      !Array.isArray(workflow.nodes) ||
      workflow.nodes.length === 0
    ) {
      console.error("[Orchestrator] ABORTING: Workflow has no nodes.");
      return;
    }

    try {
      const context = triggerData
        ? JSON.stringify(triggerData)
        : (msg.context || "");

      const result = await executeFlowRuntime(
        workflow as never,
        ctx,
        context,
        triggerData,
        this.broadcast,
      );

      ctx.send({
        type: "workflow_json",
        id: workflowId as string,
        data: result,
        timestamp: new Date().toISOString(),
      });
    } catch (execError) {
      console.error("[Orchestrator] Execution Error:", execError);
      ctx.send({
        type: "error",
        requestId: workflowId as string,
        commandType: "run_workflow",
        code: "EXECUTION_ERROR",
        message: String(execError),
        timestamp: new Date().toISOString(),
      });
    }
  }
}
