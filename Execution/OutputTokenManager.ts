import fs from "fs";
import path from "path";
import crypto from "crypto";

export const MIN_OUTPUT_TOKEN_TTL_MS = 5 * 1000; // 5 seconds
export const MAX_OUTPUT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const DEFAULT_OUTPUT_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const DEFAULT_OUTPUT_TOKEN_MAX_USES = 5;

/**
 * Parses a duration string (e.g. '10m', '300s', '1h', '1d', '500ms') or number into milliseconds.
 * Clamps result between MIN_OUTPUT_TOKEN_TTL_MS and MAX_OUTPUT_TOKEN_TTL_MS.
 */
export function parseDurationToMs(
  val: string | number | undefined | null,
  fallbackMs: number = DEFAULT_OUTPUT_TOKEN_TTL_MS
): number {
  if (val === undefined || val === null || val === "") {
    return fallbackMs;
  }

  const str = String(val).trim().toLowerCase();
  if (!str) return fallbackMs;

  const match = str.match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/);
  if (!match) return fallbackMs;

  const num = parseFloat(match[1]);
  if (isNaN(num) || num <= 0) return fallbackMs;

  const unit = match[2];
  let ms: number;
  switch (unit) {
    case "ms":
      ms = num;
      break;
    case "s":
      ms = num * 1000;
      break;
    case "m":
      ms = num * 60 * 1000;
      break;
    case "h":
      ms = num * 60 * 60 * 1000;
      break;
    case "d":
      ms = num * 24 * 60 * 60 * 1000;
      break;
    default:
      // Unitless (e.g. "600" or 3600): numbers <= 86400 treated as seconds; > 86400 treated as ms
      ms = num <= 86400 ? num * 1000 : num;
      break;
  }

  return Math.min(Math.max(ms, MIN_OUTPUT_TOKEN_TTL_MS), MAX_OUTPUT_TOKEN_TTL_MS);
}

export interface TokenOptions {
  ttlMs?: number | string;
  maxUses?: number;
}

export interface TokenMetadata {
  token: string;
  filename: string;
  expiresAt: number;
  usesRemaining: number;
}

export interface PathValidationResult {
  valid: boolean;
  path?: string;
  error?: string;
}

export interface TokenValidationResult {
  valid: boolean;
  reason?: string;
}

export class OutputTokenManager {
  private static instance: OutputTokenManager;
  private tokens: Map<string, TokenMetadata> = new Map();
  private outputDir: string;
  private defaultTtlMs: number = DEFAULT_OUTPUT_TOKEN_TTL_MS;
  private defaultMaxUses: number = DEFAULT_OUTPUT_TOKEN_MAX_USES;

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.resolve(process.cwd(), "Output");
    this.loadEnvDefaults();
  }

  public static getInstance(): OutputTokenManager {
    if (!OutputTokenManager.instance) {
      OutputTokenManager.instance = new OutputTokenManager();
    }
    return OutputTokenManager.instance;
  }

  /**
   * Loads default TTL and MaxUses from environment variables:
   * YALLMA3_OUTPUT_TOKEN_TTL (e.g. "10m", "1h", "600")
   * YALLMA3_OUTPUT_TOKEN_MAX_USES (e.g. "5", "10")
   */
  public loadEnvDefaults(): void {
    if (process.env.YALLMA3_OUTPUT_TOKEN_TTL) {
      this.defaultTtlMs = parseDurationToMs(process.env.YALLMA3_OUTPUT_TOKEN_TTL, DEFAULT_OUTPUT_TOKEN_TTL_MS);
    } else if (process.env.YALLMA3_OUTPUT_TOKEN_TTL_MS) {
      this.defaultTtlMs = parseDurationToMs(process.env.YALLMA3_OUTPUT_TOKEN_TTL_MS, DEFAULT_OUTPUT_TOKEN_TTL_MS);
    } else if (process.env.YALLMA3_OUTPUT_TOKEN_TTL_SECONDS) {
      this.defaultTtlMs = parseDurationToMs(`${process.env.YALLMA3_OUTPUT_TOKEN_TTL_SECONDS}s`, DEFAULT_OUTPUT_TOKEN_TTL_MS);
    } else {
      this.defaultTtlMs = DEFAULT_OUTPUT_TOKEN_TTL_MS;
    }

    if (process.env.YALLMA3_OUTPUT_TOKEN_MAX_USES) {
      const uses = parseInt(process.env.YALLMA3_OUTPUT_TOKEN_MAX_USES, 10);
      if (!isNaN(uses) && uses > 0) {
        this.defaultMaxUses = uses;
      }
    } else {
      this.defaultMaxUses = DEFAULT_OUTPUT_TOKEN_MAX_USES;
    }
  }

  public setDefaultTtl(ttl: string | number): void {
    this.defaultTtlMs = parseDurationToMs(ttl, this.defaultTtlMs);
  }

  public getDefaultTtl(): number {
    return this.defaultTtlMs;
  }

  public setDefaultMaxUses(maxUses: number): void {
    if (maxUses > 0) {
      this.defaultMaxUses = maxUses;
    }
  }

  public getDefaultMaxUses(): number {
    return this.defaultMaxUses;
  }

  /**
   * Validates and returns a safe absolute path for the requested filename within Output/.
   * Strictly defends against path traversal, null bytes, and non-existent files.
   */
  public getSafeOutputPath(filename: string): PathValidationResult {
    if (!filename || typeof filename !== "string") {
      return { valid: false, error: "Invalid filename provided" };
    }

    if (filename.includes("\0")) {
      return { valid: false, error: "Null byte poisoning detected" };
    }

    // Must be a pure filename without directory traversal or path separators
    const base = path.basename(filename);
    if (base !== filename || filename.includes("/") || filename.includes("\\")) {
      return { valid: false, error: "Path traversal or subdirectory access is forbidden" };
    }

    const resolved = path.resolve(this.outputDir, base);

    // Verify resolved path stays strictly within outputDir
    const rel = path.relative(this.outputDir, resolved);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      return { valid: false, error: "Path traversal detected" };
    }

    if (!fs.existsSync(resolved)) {
      return { valid: false, error: `File '${base}' not found` };
    }

    return { valid: true, path: resolved };
  }

  /**
   * Generates a cryptographically secure ephemeral token mapped to a specific filename.
   */
  public generateToken(filename: string, options?: TokenOptions): string {
    this.cleanupExpired();

    const base = path.basename(filename);
    const token = crypto.randomUUID();
    let ttlMs = this.defaultTtlMs;
    if (options?.ttlMs !== undefined) {
      if (typeof options.ttlMs === "number") {
        ttlMs = options.ttlMs;
      } else {
        ttlMs = parseDurationToMs(options.ttlMs, this.defaultTtlMs);
      }
    }
    const maxUses = options?.maxUses ?? this.defaultMaxUses;

    const metadata: TokenMetadata = {
      token,
      filename: base,
      expiresAt: Date.now() + ttlMs,
      usesRemaining: maxUses,
    };

    this.tokens.set(token, metadata);
    return token;
  }

  /**
   * Validates an ephemeral token and decrements its usage count.
   */
  public validateAndConsumeToken(token: string, requestedFilename: string): TokenValidationResult {
    this.cleanupExpired();

    if (!token || typeof token !== "string") {
      return { valid: false, reason: "Missing token" };
    }

    const metadata = this.tokens.get(token);
    if (!metadata) {
      return { valid: false, reason: "Invalid or expired capability token" };
    }

    if (Date.now() > metadata.expiresAt) {
      this.tokens.delete(token);
      return { valid: false, reason: "Capability token has expired" };
    }

    const requestedBase = path.basename(requestedFilename);
    if (metadata.filename !== requestedBase) {
      return { valid: false, reason: `Token filename mismatch: expected '${metadata.filename}', got '${requestedBase}'` };
    }

    metadata.usesRemaining -= 1;
    if (metadata.usesRemaining <= 0) {
      this.tokens.delete(token);
    }

    return { valid: true };
  }

  /**
   * Cleans up expired tokens.
   */
  public cleanupExpired(): void {
    const now = Date.now();
    for (const [token, meta] of this.tokens.entries()) {
      if (now > meta.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }

  /**
   * Returns current active token count (useful for testing/diagnostics).
   */
  public getActiveTokenCount(): number {
    this.cleanupExpired();
    return this.tokens.size;
  }

  /**
   * Clears all stored tokens and resets defaults from environment.
   */
  public clear(): void {
    this.tokens.clear();
    this.loadEnvDefaults();
  }
}
