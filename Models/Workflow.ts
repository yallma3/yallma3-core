import type { BaseNode, Connection } from "../Workflow/types/types";

export interface Workflow {
  id: string;
  name: string;
  nodes: BaseNode[];
  connections: Connection[];
  description: string;
}
