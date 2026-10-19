import * as fs from "fs";
import * as path from "path";
import type { WorkspaceData } from "../Models/Workspace";
import { Helper } from "../Utils/Helper";

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

export class WorkspaceRepository {
  private static instance: WorkspaceRepository;
  private data = new Map<string, WorkspaceData>();
  private paths = new Map<string, string>();
  private currentId: string | null = null;

  private constructor() {}

  static getInstance(): WorkspaceRepository {
    if (!WorkspaceRepository.instance) {
      WorkspaceRepository.instance = new WorkspaceRepository();
    }
    return WorkspaceRepository.instance;
  }

  get(id: string): WorkspaceData | undefined {
    return this.data.get(id);
  }

  set(id: string, workspaceData: WorkspaceData): void {
    this.data.set(id, workspaceData);
  }

  delete(id: string): void {
    this.data.delete(id);
    this.paths.delete(id);
  }

  getPath(id: string): string | undefined {
    return this.paths.get(id);
  }

  setCurrent(id: string): void {
    this.currentId = id;
  }

  getCurrent(): string | null {
    return this.currentId;
  }

  hydrate(id: string, basePath: string): WorkspaceData {
    const data = this.data.get(id);
    if (!data || !data.workflows) return data!;

    this.paths.set(id, basePath);

    console.log(`[SERVER STDOUT] 💧 Hydrating workspace ${id}...`);

    data.workflows.forEach((wf: { id: string; name: string; nodes?: unknown[]; connections?: unknown[] }) => {
      try {
        const flowsPath = path.join(basePath, "flows", `${safeName(wf.id)}.json`);
        const rootPath = path.join(basePath, `${safeName(wf.name)}.json`);

        if (!isPathSafe(flowsPath, basePath) || !isPathSafe(rootPath, basePath)) {
          console.error(` Path traversal attempt detected: ${wf.id} / ${wf.name}`);
          return;
        }

        let fullPath: string | null = null;
        if (fs.existsSync(flowsPath)) fullPath = flowsPath;
        else if (fs.existsSync(rootPath)) fullPath = rootPath;

        if (fullPath) {
          const content = fs.readFileSync(fullPath, "utf-8");
          const graph = Helper.JsonParser.parse(content);
          let nodes = graph.nodes;
          let connections = graph.connections;
          if (graph.canvasState) {
            nodes = graph.canvasState.nodes;
            connections = graph.canvasState.connections;
          }
          if (nodes) {
            wf.nodes = nodes;
            wf.connections = connections || [];
          }
        }
      } catch (e) {
        console.error(` Failed to hydrate '${wf.name}':`, e);
      }
    });

    if (data.tasks) {
      (data.tasks as unknown as { workflow?: { id: string } }[]).forEach((task) => {
        if (task.workflow && task.workflow.id) {
          const hydratedWf = data.workflows.find(
            (w) => w.id === task.workflow!.id
          );
          if (hydratedWf && hydratedWf.nodes && hydratedWf.nodes.length > 0) {
            task.workflow = hydratedWf;
          }
        }
      });
    }

    this.data.set(id, data);
    return data;
  }
}
