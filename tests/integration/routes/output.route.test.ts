import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import fs from "fs";
import path from "path";
import outputRouter from "../../../Routes/output.route";
import { OutputTokenManager } from "../../../Execution/OutputTokenManager";

describe("Output Routes Integration", () => {
  let app: express.Application;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let server: any;
  let port: number;
  const tokenManager = OutputTokenManager.getInstance();
  const outputDir = path.resolve(process.cwd(), "Output");
  const sampleJsonFile = "integration_test_result.json";
  const sampleTxtFile = "integration_test_result.txt";
  const jsonContent = JSON.stringify({ workspace: "Test", status: "success" });
  const txtContent = "Test workspace execution text output";

  beforeAll(() => {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(path.join(outputDir, sampleJsonFile), jsonContent, "utf8");
    fs.writeFileSync(path.join(outputDir, sampleTxtFile), txtContent, "utf8");

    app = express();
    app.use(express.json());
    app.use("/output", outputRouter);
    server = app.listen(0);
    port = server.address().port;
  });

  afterAll(() => {
    if (fs.existsSync(path.join(outputDir, sampleJsonFile))) {
      fs.unlinkSync(path.join(outputDir, sampleJsonFile));
    }
    if (fs.existsSync(path.join(outputDir, sampleTxtFile))) {
      fs.unlinkSync(path.join(outputDir, sampleTxtFile));
    }
    server.close();
  });

  beforeEach(() => {
    tokenManager.clear();
  });

  describe("GET /output/download/:filename", () => {
    it("should reject requests without a token (401)", async () => {
      const res = await fetch(`http://localhost:${port}/output/download/${sampleJsonFile}`);
      expect(res.status).toBe(401);
      const data = await res.json() as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/missing required download token/i);
    });

    it("should reject requests with an invalid or expired token (403)", async () => {
      const res = await fetch(`http://localhost:${port}/output/download/${sampleJsonFile}?token=invalid-token`);
      expect(res.status).toBe(403);
      const data = await res.json() as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/invalid or expired/i);
    });

    it("should successfully download file with valid token and attachment disposition (200)", async () => {
      const token = tokenManager.generateToken(sampleJsonFile);
      const res = await fetch(`http://localhost:${port}/output/download/${sampleJsonFile}?token=${token}`);
      expect(res.status).toBe(200);

      const disposition = res.headers.get("content-disposition");
      expect(disposition).toContain("attachment");
      expect(disposition).toContain(sampleJsonFile);

      const body = await res.text();
      expect(body).toBe(jsonContent);
    });

    it("should reject path traversal attempts (400)", async () => {
      const maliciousFilename = "../package.json";
      const token = tokenManager.generateToken(maliciousFilename);
      const res = await fetch(`http://localhost:${port}/output/download/${encodeURIComponent(maliciousFilename)}?token=${token}`);
      expect(res.status).toBe(400);
      const data = await res.json() as { success: boolean; error: string };
      expect(data.success).toBe(false);
      expect(data.error).toMatch(/path traversal/i);
    });
  });

  describe("GET /output/view/:filename", () => {
    it("should reject requests without a token (401)", async () => {
      const res = await fetch(`http://localhost:${port}/output/view/${sampleTxtFile}`);
      expect(res.status).toBe(401);
    });

    it("should serve JSON with application/json Content-Type (200)", async () => {
      const token = tokenManager.generateToken(sampleJsonFile);
      const res = await fetch(`http://localhost:${port}/output/view/${sampleJsonFile}?token=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");

      const body = await res.json() as { workspace: string; status: string };
      expect(body.workspace).toBe("Test");
    });

    it("should serve TXT with text/plain Content-Type (200)", async () => {
      const token = tokenManager.generateToken(sampleTxtFile);
      const res = await fetch(`http://localhost:${port}/output/view/${sampleTxtFile}?token=${token}`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/plain");

      const text = await res.text();
      expect(text).toBe(txtContent);
    });
  });
});
