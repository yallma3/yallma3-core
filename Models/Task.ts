export interface Task {
  id: string;
  name: string;
  description: string;
  expectedOutput: string;
  assignedAgent: string | null; // ID of the assigned agent or null for auto-assign
  executeWorkflow: boolean;
  workflowId: string | null; // ID of the workflow to execute if executeWorkflow is true
  workflowName?: string; // Name of the workflow for display purposes
}