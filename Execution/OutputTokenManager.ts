import fs from "fs";
import path from "path";
import crypto from "crypto";

export interface TokenOptions {
  ttlMs?: number;
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

  constructor(outputDir?: string) {
    this.outputDir = outputDir || path.resolve(process.cwd(), "Output");
  }

  public static getInstance(): OutputTokenManager {
    if (!OutputTokenManager.instance) {
      OutputTokenManager.instance = new OutputTokenManager();
    }
    return OutputTokenManager.instance;
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
    const ttlMs = options?.ttlMs ?? 10 * 60 * 1000; // default 10 minutes
    const maxUses = options?.maxUses ?? 5; // default 5 downloads

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
   * Clears all stored tokens.
   */
  public clear(): void {
    this.tokens.clear();
  }
}
