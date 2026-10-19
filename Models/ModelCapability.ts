export interface ModelCapability {
  modelId: string;
  provider: string;
  name: string;
  description?: string;
  aliases?: string[];
  capabilities?: string[];
  benchmarks?: Record<string, number>;
  supportedLanguages?: string[];
  source?: string;
  updatedAt?: number;
}
