# ADR 261027: Token-Gated HTTP Download & Inspection API for Output Artifacts

## Context
When `MainAgentV1` executes a workspace, it generates output files in `./Output/` (`.json` sidecar and `.txt` summary). It notifies the client over WebSocket with human-readable logs (`Results saved to Output/<filename>`).
However:
1. Remote/browser clients cannot access server filesystem paths.
2. Direct unauthenticated HTTP routes with global `cors: *` create severe security vulnerabilities: any website running in the user's browser could exfiltrate confidential LLM prompts, reasoning steps, and agent traces via cross-origin requests.
3. Timestamp-based filenames (`<workspace>_<timestamp>.json`) are susceptible to enumeration/scraping.
4. Existing `--instance-id` authentication relies on the `x-api-key` HTTP header, which standard browser download triggers (`<a href="..." download>`) cannot send.
5. WebSocket-only file transfer suffers from memory bloat and framing limits on large execution logs and requires complex client-side Blob handling.

## Decision
Adopt **Choice 1: Token-Gated HTTP Download & Inspection API**:
1. **Express Router (`Routes/output.route.ts`)**:
   - `GET /output/download/:filename?token=<uuid>`: Streams file with `Content-Disposition: attachment` to prompt native download.
   - `GET /output/view/:filename?token=<uuid>`: Streams file with `Content-Type: application/json` or `text/plain` for inline browser/modal viewing.
2. **Path Sanitization**:
   - Resolves `path.basename(filename)` and verifies `path.resolve(OUTPUT_DIR, safeFilename)` is strictly within `./Output/` to prevent directory traversal (`../../.env`).
3. **Ephemeral Capability Tokens**:
   - An in-memory token manager issues cryptographically random single-use or short-lived (e.g. 5 minutes) UUID tokens bound to specific files.
   - The token is passed via query parameter (`?token=...`), enabling standard browser link clicks while securing the download against CORS exfiltration and unauthorized scraping.
4. **Structured WebSocket Notification**:
   - `MainAgentV1.saveResults()` emits a `workspace_artifacts` event containing download and view URLs (with tokens) so UI frontends and AI agents have immediate, programmatic access.

## Consequences
- **Positive**:
  - Secure: Complete protection against cross-origin data theft, timestamp enumeration, and path traversal.
  - Native browser UX: Seamless one-click downloads without custom frontend Blob reconstruction.
  - High performance: Files stream directly from disk without blocking the real-time WebSocket connection.
  - Compatible with `--instance-id`: Query parameter capability tokens bypass the limitation of `<a href>` custom headers.
- **Negative / Trade-offs**:
  - Tokens expire after their lifetime (e.g., 5-10 minutes); client must re-request a token over WebSocket if attempting to download after expiration.
