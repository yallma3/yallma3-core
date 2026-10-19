import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import type { ModelCapability } from "../Models/ModelCapability";
import { Helper } from "../Utils/Helper";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CAPABILITIES_FILE_PATH = path.join(__dirname, "models-capabilities.json");

function loadCapabilities(): ModelCapability[] {
  if (!fs.existsSync(CAPABILITIES_FILE_PATH)) {
    return [];
  }
  try {
    const data = fs.readFileSync(CAPABILITIES_FILE_PATH, "utf-8");
    const parsed = Helper.JsonParser.safeParse<ModelCapability[]>(data);
    if (parsed.success) return parsed.data;
    throw new Error("Failed to parse models-capabilities.json: " + parsed.error);
  } catch (error) {
    console.error("Failed to load models-capabilities.json", error);
    return [];
  }
}

export const Capabilities: ModelCapability[] = loadCapabilities();

function saveCapabilities() {
  try {
    const data = JSON.stringify(Capabilities, null, 2);
    fs.writeFileSync(CAPABILITIES_FILE_PATH, data);
  } catch (error) {
    console.error("Failed to save models-capabilities.json", error);
  }
}

export function addCapability(capability: ModelCapability) {
  const exists = Capabilities.some((c) => c.modelId === capability.modelId);
  if (exists) {
    throw new Error(`Capability for model ${capability.modelId} already exists`);
  }
  Capabilities.push(capability);
  saveCapabilities();
}

export function editCapability(modelId: string, updates: Partial<ModelCapability>) {
  const index = Capabilities.findIndex((c) => c.modelId === modelId);
  if (index === -1) {
    throw new Error(`Capability for model ${modelId} not found`);
  }
  Capabilities[index] = { ...Capabilities[index], ...updates };
  saveCapabilities();
}

export function removeCapability(modelId: string) {
  const index = Capabilities.findIndex((c) => c.modelId === modelId);
  if (index === -1) {
    throw new Error(`Capability for model ${modelId} not found`);
  }
  Capabilities.splice(index, 1);
  saveCapabilities();
}

export function getCapabilities(): ModelCapability[] {
  return JSON.parse(JSON.stringify(Capabilities));
}

export function queryCapabilities(tag: string): ModelCapability[] {
  return Capabilities.filter(
    (c) => c.capabilities && c.capabilities.includes(tag)
  );
}
