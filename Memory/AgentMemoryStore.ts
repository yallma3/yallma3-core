import fs from "node:fs";
import path from "node:path";
import type { Agent } from "../Models/Agent";
import type { AgentMemoryRecord, AgentMemoryStore } from "../Models/AgentMemory";
import { hashAgent } from "./AgentHasher";

function getAgentId(agent: Agent): string {
  return hashAgent(agent);
}

export class FileAgentMemoryStore implements AgentMemoryStore {
  private basePath: string;

  constructor(basePath?: string) {
    this.basePath = basePath ?? path.join(process.cwd(), "agent-memory");
  }

  recordOutcome(agent: Agent, success: boolean): void {
    const agentId = getAgentId(agent);
    const existing = this.loadRecord(agentId);
    const now = Date.now();

    if (existing) {
      if (success) existing.successes++;
      else existing.failures++;
      existing.updatedAt = now;
      this.saveRecord(existing);
    } else {
      const record: AgentMemoryRecord = {
        agentId,
        name: agent.name,
        role: agent.role,
        objective: agent.objective,
        background: agent.background,
        llm: {
          provider: agent.llm.provider,
          model: agent.llm.model.name,
          modelId: agent.llm.model.id,
        },
        tools: agent.tools.map((t) => t.name),
        successes: success ? 1 : 0,
        failures: success ? 0 : 1,
        capabilities: [],
        createdAt: now,
        updatedAt: now,
      };
      this.saveRecord(record);
    }
  }

  addCapabilities(agentId: string, tags: string[]): void {
    const record = this.loadRecord(agentId);
    if (!record) return;
    for (const tag of tags) {
      if (!record.capabilities.includes(tag)) {
        record.capabilities.push(tag);
      }
    }
    record.updatedAt = Date.now();
    this.saveRecord(record);
  }

  removeCapabilities(agentId: string, tags: string[]): void {
    const record = this.loadRecord(agentId);
    if (!record) return;
    record.capabilities = record.capabilities.filter((t) => !tags.includes(t));
    record.updatedAt = Date.now();
    this.saveRecord(record);
  }

  getAgent(agentId: string): AgentMemoryRecord | undefined {
    return this.loadRecord(agentId);
  }

  queryByCapability(tag: string): AgentMemoryRecord[] {
    return this.getAll().filter((r) => r.capabilities.includes(tag));
  }

  getAll(): AgentMemoryRecord[] {
    const records: AgentMemoryRecord[] = [];
    try {
      const files = fs.readdirSync(this.basePath);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        const filePath = path.join(this.basePath, file);
        try {
          const data = fs.readFileSync(filePath, "utf-8");
          const parsed = JSON.parse(data) as AgentMemoryRecord;
          records.push(parsed);
        } catch {
          // skip corrupt files
        }
      }
    } catch {
      // directory doesn't exist or can't be read
    }
    return records;
  }

  private recordPath(agentId: string): string {
    return path.join(this.basePath, `${agentId}.json`);
  }

  private loadRecord(agentId: string): AgentMemoryRecord | undefined {
    const filePath = this.recordPath(agentId);
    try {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data) as AgentMemoryRecord;
    } catch {
      return undefined;
    }
  }

  private saveRecord(record: AgentMemoryRecord): void {
    try { fs.mkdirSync(this.basePath, { recursive: true }); } catch { /* ignore */ }
    const filePath = this.recordPath(record.agentId);
    const tmpPath = filePath + ".tmp";
    const data = JSON.stringify(record, null, 2);
    fs.writeFileSync(tmpPath, data, "utf-8");
    fs.renameSync(tmpPath, filePath);
  }
}
