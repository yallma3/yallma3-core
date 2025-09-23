/*
* yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 
 * Copyright (C) 2025 yaLLMa3
 
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
   If a copy of the MPL was not distributed with this file, You can obtain one at https://www.mozilla.org/MPL/2.0/.
 
 * This software is distributed on an "AS IS" basis,
   WITHOUT WARRANTY OF ANY KIND, either express or implied.
   See the Mozilla Public License for the specific language governing rights and limitations under the License.
*/

import type { BaseNode, NodeMetadata } from "./types/types";

// Factory type for creating new nodes
export type NodeFactory = (
  id: number,
  position: { x: number; y: number }
) => BaseNode;

interface NodeDefinition {
  factory: NodeFactory;
  metadata: NodeMetadata;
}

export class NodeRegistry {
  private nodeDefinitions: Record<string, NodeDefinition> = {};

  registerNodeType(
    name: string,
    factory: NodeFactory,
    metadata: NodeMetadata
  ): void {
    this.nodeDefinitions[name] = { factory, metadata };
  }

  createNode(name: string, id: number, position: { x: number; y: number }) {
    const def = this.nodeDefinitions[name];
    if (!def) {
      console.error(`Node type "${name}" not registered.`);
      return undefined;
    }
    return def.factory(id, position);
  }

  getFactory(nodeType: string): NodeFactory | undefined {
    return this.nodeDefinitions[nodeType]?.factory;
  }

  listNodeTypes(): string[] {
    return Object.keys(this.nodeDefinitions);
  }

  listCategories(): string[] {
    return [
      ...new Set(
        Object.values(this.nodeDefinitions).map(
          (d) => d.metadata.category || "Other"
        )
      ),
    ];
  }

  getAllNodeDetails() {
    const categories = this.listCategories();
    const nodes = Object.values(this.nodeDefinitions).map(
      (def) => def.metadata
    );

    const response = {
      categories,
      nodes,
    };

    return response;
  }
}

// Export singleton instance
export const nodeRegistry = new NodeRegistry();
