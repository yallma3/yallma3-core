import type { MainAgent } from "./MainAgent";
import { MainAgentV1 } from "./Versions/MainAgentV1";

// Define a constructor signature for all MainAgents
interface MainAgentConstructor {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): MainAgent;
}

// Strongly typed registry
const registry: Record<string, MainAgentConstructor> = {
  "1.0.0": MainAgentV1,
  // "1.1.0": MainAgentV110,
  // "2.0.0": MainAgentV2,
  // "experimental": MainAgentExperimental,
};

export function getMainAgent(
  version?: string,
  ...args: ConstructorParameters<MainAgentConstructor>
): MainAgent {
  const resolvedVersion = version || process.env.MAIN_AGENT_VERSION || "1.0.0";

  const AgentClass = registry[resolvedVersion];
  if (!AgentClass) {
    const available = Object.keys(registry).join(", ");
    throw new Error(
      `MainAgent version '${resolvedVersion}' does not exist. Available: [${available}]`
    );
  }

  return new AgentClass(...args);
}
