import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import workflowRouter from "../../../Routes/workflow.route";

describe("Workflow Routes", () => {
  let app: express.Application;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/api/workflow", workflowRouter);
    server = app.listen(0); // Random port
  });

  afterAll(() => {
    server.close();
  });

  describe("GET /api/workflow/nodes", () => {
    it("should return all registered node details", async () => {
      const port = server.address().port;
      const response = await fetch(`http://localhost:${port}/api/workflow/nodes`);
      expect(response.status).toBe(200);

      const data = await response.json() as { success: boolean; data: { nodes: unknown[] }; count: number };
      expect(data).toHaveProperty("success", true);
      expect(data).toHaveProperty("data");
      expect(data).toHaveProperty("count");
      expect(typeof data.count).toBe("number");
      expect(Array.isArray(data.data.nodes)).toBe(true);
    });
  });
});