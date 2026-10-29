import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  OutputTokenManager,
  parseDurationToMs,
  DEFAULT_OUTPUT_TOKEN_TTL_MS,
  MIN_OUTPUT_TOKEN_TTL_MS,
  MAX_OUTPUT_TOKEN_TTL_MS,
} from "../../../Execution/OutputTokenManager";

describe("OutputTokenManager", () => {
  let manager: OutputTokenManager;
  const testOutputDir = path.resolve(process.cwd(), "Output");
  const testFile = "test_artifact_123.txt";
  const testFilePath = path.join(testOutputDir, testFile);

  beforeEach(() => {
    manager = OutputTokenManager.getInstance();
    manager.clear();

    if (!fs.existsSync(testOutputDir)) {
      fs.mkdirSync(testOutputDir, { recursive: true });
    }
    fs.writeFileSync(testFilePath, "Sample output content", "utf8");
  });

  afterEach(() => {
    manager.clear();
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  describe("Path Security & Verification", () => {
    it("should allow a valid file directly in Output directory", () => {
      const res = manager.getSafeOutputPath(testFile);
      expect(res.valid).toBe(true);
      expect(res.path).toBe(testFilePath);
    });

    it("should reject path traversal using ../", () => {
      const res = manager.getSafeOutputPath("../package.json");
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/path traversal/i);
    });

    it("should reject nested subdirectories if strictly forbidden", () => {
      const res = manager.getSafeOutputPath("subfolder/somefile.txt");
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/path traversal|invalid filename/i);
    });

    it("should reject non-existent files", () => {
      const res = manager.getSafeOutputPath("non_existent_file_9999.txt");
      expect(res.valid).toBe(false);
      expect(res.error).toMatch(/not found/i);
    });

    it("should reject null-byte poisoned filenames", () => {
      const res = manager.getSafeOutputPath("test_artifact_123.txt\0.png");
      expect(res.valid).toBe(false);
    });
  });

  describe("Token Generation and Validation", () => {
    it("should generate a valid UUID token for a filename", () => {
      const token = manager.generateToken(testFile);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(10);

      const validation = manager.validateAndConsumeToken(token, testFile);
      expect(validation.valid).toBe(true);
    });

    it("should reject validation for non-existent token", () => {
      const validation = manager.validateAndConsumeToken("invalid-uuid-token", testFile);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toMatch(/invalid or expired/i);
    });

    it("should reject validation if token does not match the requested filename", () => {
      const token = manager.generateToken(testFile);
      const validation = manager.validateAndConsumeToken(token, "other_file.txt");
      expect(validation.valid).toBe(false);
      expect(validation.reason).toMatch(/filename mismatch/i);
    });

    it("should enforce maximum uses", () => {
      const token = manager.generateToken(testFile, { maxUses: 2 });
      
      // Use 1
      expect(manager.validateAndConsumeToken(token, testFile).valid).toBe(true);
      // Use 2
      expect(manager.validateAndConsumeToken(token, testFile).valid).toBe(true);
      // Use 3 (should fail)
      const res = manager.validateAndConsumeToken(token, testFile);
      expect(res.valid).toBe(false);
      expect(res.reason).toMatch(/invalid or expired/i);
    });

    it("should reject expired tokens", async () => {
      const token = manager.generateToken(testFile, { ttlMs: 10 });
      
      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 25));

      const validation = manager.validateAndConsumeToken(token, testFile);
      expect(validation.valid).toBe(false);
      expect(validation.reason).toMatch(/expired/i);
    });

    it("should clean up expired tokens automatically", async () => {
      manager.generateToken(testFile, { ttlMs: 10 });
      expect(manager.getActiveTokenCount()).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, 25));
      manager.cleanupExpired();
      expect(manager.getActiveTokenCount()).toBe(0);
    });
  });

  describe("Duration Parsing and Configuration", () => {
    it("should parse duration strings with units correctly", () => {
      expect(parseDurationToMs("10m")).toBe(10 * 60 * 1000);
      expect(parseDurationToMs("300s")).toBe(300 * 1000);
      expect(parseDurationToMs("1h")).toBe(60 * 60 * 1000);
      expect(parseDurationToMs("1d")).toBe(24 * 60 * 60 * 1000);
    });

    it("should parse unitless numbers/strings as seconds if <= 86400", () => {
      expect(parseDurationToMs("600")).toBe(600 * 1000);
      expect(parseDurationToMs(3600)).toBe(3600 * 1000);
    });

    it("should clamp values between MIN and MAX allowable TTL", () => {
      expect(parseDurationToMs("100ms")).toBe(MIN_OUTPUT_TOKEN_TTL_MS);
      expect(parseDurationToMs("30d")).toBe(MAX_OUTPUT_TOKEN_TTL_MS);
    });

    it("should return fallback for invalid or empty values", () => {
      expect(parseDurationToMs(undefined)).toBe(DEFAULT_OUTPUT_TOKEN_TTL_MS);
      expect(parseDurationToMs("")).toBe(DEFAULT_OUTPUT_TOKEN_TTL_MS);
      expect(parseDurationToMs("not-a-number")).toBe(DEFAULT_OUTPUT_TOKEN_TTL_MS);
    });

    it("should load defaults from environment variables", () => {
      const origTtl = process.env.YALLMA3_OUTPUT_TOKEN_TTL;
      const origUses = process.env.YALLMA3_OUTPUT_TOKEN_MAX_USES;

      try {
        process.env.YALLMA3_OUTPUT_TOKEN_TTL = "45m";
        process.env.YALLMA3_OUTPUT_TOKEN_MAX_USES = "12";

        const testManager = new OutputTokenManager();
        expect(testManager.getDefaultTtl()).toBe(45 * 60 * 1000);
        expect(testManager.getDefaultMaxUses()).toBe(12);
      } finally {
        if (origTtl !== undefined) process.env.YALLMA3_OUTPUT_TOKEN_TTL = origTtl;
        else delete process.env.YALLMA3_OUTPUT_TOKEN_TTL;

        if (origUses !== undefined) process.env.YALLMA3_OUTPUT_TOKEN_MAX_USES = origUses;
        else delete process.env.YALLMA3_OUTPUT_TOKEN_MAX_USES;
      }
    });

    it("should allow programmatic override via setDefaultTtl and setDefaultMaxUses", () => {
      manager.setDefaultTtl("20m");
      expect(manager.getDefaultTtl()).toBe(20 * 60 * 1000);

      manager.setDefaultMaxUses(8);
      expect(manager.getDefaultMaxUses()).toBe(8);

      // Token generated without explicit options inherits the configured defaults
      const token = manager.generateToken(testFile);
      for (let i = 0; i < 8; i++) {
        expect(manager.validateAndConsumeToken(token, testFile).valid).toBe(true);
      }
      expect(manager.validateAndConsumeToken(token, testFile).valid).toBe(false);
    });
  });
});
