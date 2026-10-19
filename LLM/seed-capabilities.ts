import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ModelCapability } from "../Models/ModelCapability";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_PATH = path.join(__dirname, "models-capabilities.json");

const SOURCES = {
  modelsDev: "https://raw.githubusercontent.com/anomalyco/models.dev/dev/models.json",
  llmRing: {
    manifest: "https://raw.githubusercontent.com/llmring/registry/main/manifest.json",
    base: "https://raw.githubusercontent.com/llmring/registry/main/",
  },
  jnd0Scores: "https://raw.githubusercontent.com/jnd0/llm-registry/main/src/data/scores",
};

interface LlmRingModel {
  provider: string;
  model_name: string;
  display_name: string;
  model_aliases?: string[];
  supports_function_calling?: boolean;
  supports_parallel_tool_calls?: boolean;
  supports_json_mode?: boolean;
  supports_json_schema?: boolean;
  supports_vision?: boolean;
  supports_audio?: boolean;
  supports_documents?: boolean;
  is_reasoning_model?: boolean;
  supports_thinking?: boolean;
}

const LLM_RING_FLAG_TAGS: Record<string, string> = {
  supports_function_calling: "function-calling",
  supports_parallel_tool_calls: "parallel-tools",
  supports_json_mode: "structured-output",
  supports_json_schema: "structured-output",
  supports_vision: "image-understanding",
  supports_audio: "audio-understanding",
  supports_documents: "document-qa",
};

function deriveTags(llmRingModel?: LlmRingModel): string[] {
  const tags = new Set<string>();
  if (!llmRingModel) return [];

  for (const [flag, tag] of Object.entries(LLM_RING_FLAG_TAGS)) {
    if ((llmRingModel as any)[flag]) {
      tags.add(tag);
    }
  }

  if (llmRingModel.is_reasoning_model || llmRingModel.supports_thinking) {
    tags.add("logical-reasoning");
    tags.add("multi-step");
  }

  return Array.from(tags).sort();
}

function normalize(str: string): string {
  return str.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function matchesModelsDev(devId: string, llmModel: LlmRingModel): boolean {
  const devIdNorm = normalize(devId);
  const names = [llmModel.model_name, llmModel.display_name, ...(llmModel.model_aliases || [])]
    .map(normalize)
    .filter(Boolean);

  // Exact match first
  for (const nameNorm of names) {
    if (devIdNorm === nameNorm) return true;
  }
  // Then longest suffix match
  const suffixMatches = names
    .filter((n) => devIdNorm.endsWith(n))
    .sort((a, b) => b.length - a.length);
  if (suffixMatches.length > 0) return true;

  return false;
}

async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`);
  }
  return response.json();
}

async function fetchWithFallback(url: string, label: string): Promise<any | null> {
  try {
    console.log(`  Fetching ${label}...`);
    return await fetchJson(url);
  } catch (err) {
    console.warn(`  Warning: ${label} unavailable (${err instanceof Error ? err.message : String(err)}), skipping`);
    return null;
  }
}

async function main() {
  console.log("Seeding capability registry from MIT-licensed sources...\n");

  const modelsDevData = await fetchWithFallback(
    SOURCES.modelsDev,
    "anomalyco/models.dev (MIT)"
  );

  const llmRingManifest = await fetchWithFallback(
    SOURCES.llmRing.manifest,
    "llmring/registry manifest (MIT)"
  );

  const llmRingModels: LlmRingModel[] = [];
  if (llmRingManifest?.providers) {
    for (const [provider, info] of Object.entries(llmRingManifest.providers) as [string, any][]) {
      const fileUrl = `${SOURCES.llmRing.base}${info.file}`;
      const providerData = await fetchWithFallback(fileUrl, `llmring/registry ${provider} (MIT)`);
      if (providerData?.models) {
        for (const model of Object.values(providerData.models) as any[]) {
          llmRingModels.push(model as LlmRingModel);
        }
      }
    }
  }

  const capabilities: ModelCapability[] = [];
  let matched = 0;

  if (!Array.isArray(modelsDevData?.data)) {
    throw new Error("models.dev data unavailable or unexpected shape; refusing to overwrite registry");
  }
  {
    for (const entry of modelsDevData.data) {
      const modelId: string = entry.id;
      const provider = modelId.includes("/") ? modelId.split("/")[0] : "unknown";
      const name: string = entry.name || modelId;
      const description: string | undefined = entry.description;

      const candidates = llmRingModels.filter((m) => matchesModelsDev(modelId, m));
      const llmRingEntry = candidates.sort((a, b) => {
        const aNames = [a.model_name, a.display_name, ...(a.model_aliases || [])].map(normalize).filter(Boolean);
        const bNames = [b.model_name, b.display_name, ...(b.model_aliases || [])].map(normalize).filter(Boolean);
        const aMax = Math.max(0, ...aNames.map((n) => n.length));
        const bMax = Math.max(0, ...bNames.map((n) => n.length));
        return bMax - aMax;
      })[0];
      const tags = deriveTags(llmRingEntry);

      if (llmRingEntry) matched++;

      const cap: ModelCapability = {
        modelId,
        provider,
        name,
        description,
        capabilities: tags.length > 0 ? tags : undefined,
        source: "models.dev",
        updatedAt: Math.floor(Date.now() / 1000),
      };

      capabilities.push(cap);
    }
  }

  if (capabilities.length === 0) {
    throw new Error("No capabilities produced; refusing to overwrite registry");
  }
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(capabilities, null, 2));
  console.log(`\nWrote ${capabilities.length} capabilities to ${OUTPUT_PATH}`);
  console.log(`Matched ${matched} models with llmring/registry capability tags`);
}

main().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
