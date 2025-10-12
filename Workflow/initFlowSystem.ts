/*
* yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 
 * Copyright (C) 2025 yaLLMa3
 
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
   If a copy of the MPL was not distributed with this file, You can obtain one at https://www.mozilla.org/MPL/2.0/.
 
 * This software is distributed on an "AS IS" basis,
   WITHOUT WARRANTY OF ANY KIND, either express or implied.
   See the Mozilla Public License for the specific language governing rights and limitations under the License.
*/

import { nodeRegistry } from "./NodeRegistry";

import { register as registerMathNode } from "./Nodes/mathExpressionNode";
import { register as registerTextNode } from "./Nodes/textTemplateNode";
import { register as registerJoinNode } from "./Nodes/JoinTextNode";
import { register as registerClaudeChatNode } from "./Nodes/Chat/ClaudeChatNode";
import { register as registerGeminiChatNode } from "./Nodes/Chat/GeminiChatNode";
import { register as registerGroqChatNode } from "./Nodes/Chat/GroqChatNode";
import { register as registerOpenAIChatNode } from "./Nodes/Chat/OpenAiChatNode";
import { register as registerOpenRouterChatNode } from "./Nodes/Chat/OpenRouterChatNode";

import { register as registerArxivScraperNode } from "./Nodes/ArxivScraperNode";
import { register as registerMcpDiscoveryNode } from "./Nodes/Mcp/McpDiscoveryNode";
import { register as registerMcpToolCallNode } from "./Nodes/Mcp/McpToolCallNode";
import { register as registerMcpGetResourceNode } from "./Nodes/Mcp/McpGetResourceNode";
import { register as registerMcpGeToolNode } from "./Nodes/Mcp/McpGetPromptNode";
import { register as registerPdfDownloaderNode } from "./Nodes/DownloaderNode";
import { register as registerPdfExtractorNode } from "./Nodes/PdfExtractorNode";
import { register as registerChunkingNode } from "./Nodes/ChunkingNode";
import { register as registerHashNode } from "./Nodes/HashNode";
import { register as registerHttpCallNode } from "./Nodes/HttpCallNode";
import { register as registerUrlReferenceNode } from "./Nodes/UrlRefrenceNode";
import { register as registerIfElseNode } from "./Nodes/ifElseNode";
import { register as registerDelayNode } from "./Nodes/DelayNode";
import { register as registerEmbeddingNode } from "./Nodes/EmbeddingNode";

import { register as registerWorkflowInputNode } from "./Nodes/WorkflowInputNode";
import { register as registerMailNode } from "./Nodes/SendMailNode";
import { register as registerJSONManipulatorNode } from "./Nodes/JSONManipulatorNode";

export async function initFlowSystem() {
  registerMathNode(nodeRegistry);
  registerTextNode(nodeRegistry);
  registerJoinNode(nodeRegistry);
  registerClaudeChatNode(nodeRegistry);
  registerGeminiChatNode(nodeRegistry);

  registerOpenRouterChatNode(nodeRegistry);
  registerOpenAIChatNode(nodeRegistry);
  registerGroqChatNode(nodeRegistry);

  registerArxivScraperNode(nodeRegistry);
  registerMcpDiscoveryNode(nodeRegistry);
  registerMcpToolCallNode(nodeRegistry);
  registerMcpGetResourceNode(nodeRegistry);
  registerMcpGeToolNode(nodeRegistry);

  registerPdfDownloaderNode(nodeRegistry);
  registerPdfExtractorNode(nodeRegistry);
  registerChunkingNode(nodeRegistry);

  registerHashNode(nodeRegistry);
  registerHttpCallNode();
  registerUrlReferenceNode();
  registerIfElseNode();
  registerDelayNode(nodeRegistry);
  registerEmbeddingNode(nodeRegistry);

  registerWorkflowInputNode(nodeRegistry);
  registerMailNode(nodeRegistry);
  registerJSONManipulatorNode(nodeRegistry);
}

export async function loadModule(name: string) {
  const path = `/custom-modules/${name}.js`;
  const response = await fetch(path);
  const code = await response.text();

  // Option 1: Use dynamic `Function` for isolated context
  const moduleExports = {};
  const fn = new Function("exports", code);
  fn(moduleExports);
  return moduleExports;

  // Option 2 (if using ESM): use dynamic `import()` but you need to serve it with correct MIME
  //return await import(path); // Ensure the server serves the file with the correct MIME type
}
