---
purpose: "Implement secure Token-Gated HTTP Download & Inspection API for workspace output artifacts with structured WebSocket notifications"
agent: "Antigravity"
llm: "Gemini"
date: "261027"
design_option_ref: ".agents/design-options/design-options_261027_client_download_output_files.md"
---

# Plan: Token-Gated HTTP Output Artifact Download & Inspection API

## Context
- **Related Specs**:
  - [`.agents/specs/product_output_json.md`](file:///home/assem/work/yaLLMa3/yallma3-core/.agents/specs/product_output_json.md)
  - [`.agents/specs/system_agent.md`](file:///home/assem/work/yaLLMa3/yallma3-core/.agents/specs/system_agent.md)
  - [`.agents/specs/system_routes.md`](file:///home/assem/work/yaLLMa3/yallma3-core/.agents/specs/system_routes.md)
  - [`.agents/specs/system.md`](file:///home/assem/work/yaLLMa3/yallma3-core/.agents/specs/system.md)
- **Design Decision**:
  - Recorded in [`.agents/design-options/design-options_261027_client_download_output_files.md`](file:///home/assem/work/yaLLMa3/yallma3-core/.agents/design-options/design-options_261027_client_download_output_files.md) (Choice 1) and [`.agents/research/adr_261027_token_gated_output_download.md`](file:///home/assem/work/yaLLMa3/yallma3-core/.agents/research/adr_261027_token_gated_output_download.md).
- **Scope**:
  - In Scope:
    - Ephemeral capability token manager for output files (`Execution/OutputTokenManager.ts`).
    - Path traversal hardening and containment verification within `./Output/`.
    - Express route `Routes/output.route.ts` with `GET /output/download/:filename` and `GET /output/view/:filename`.
    - Exemption of `/output` from the global `--instance-id` header requirement so that query parameter capability tokens suffice.
    - Structured `workspace_artifacts` WebSocket event emitted alongside text logs upon workspace execution completion in `MainAgentV1`.
    - Comprehensive unit and integration test coverage.
  - Out of Scope:
    - Permanent persistent storage or database-backed file catalog (tokens remain in-memory with TTL).
    - Multi-tenant cloud object storage (S3/GCS); files remain on server local disk `./Output/`.

### Assumptions & Tradeoffs
- **Assumption 1**: The client runs in an environment capable of making standard HTTP `GET` requests to the server's HTTP port (the same host/port serving the WebSocket connection).
- **Assumption 2**: Output files are generated inside `./Output/` relative to the application working directory.
- **Tradeoff**: Ephemeral tokens expire after their TTL (default 10 minutes) or after max usage. If a user waits longer before clicking download, the token expires, preventing permanent public links and mitigating link leakage.

---

## Acceptance Criteria
- [ ] Safe path resolution prevents directory traversal attacks (e.g. `../../.env` or absolute paths return HTTP 400).
- [ ] Non-existent files return HTTP 404.
- [ ] Requests without a token, or with an expired/invalid token, return HTTP 401/403.
- [ ] Valid tokens allow `GET /output/download/:filename?token=<uuid>` to stream the file with `Content-Disposition: attachment; filename="..."`.
- [ ] Valid tokens allow `GET /output/view/:filename?token=<uuid>` to stream the file with `Content-Type: application/json` or `text/plain`.
- [ ] When `--instance-id` is active, the `/output` download route accepts the capability token via query parameter without requiring the `x-api-key` header.
- [ ] When `MainAgentV1.saveResults()` finishes writing `.txt` and `.json` files, it generates capability tokens and emits a `workspace_artifacts` WebSocket message containing download and view URLs for each artifact.
- [ ] All unit and integration test suites pass (`npx vitest run`) and linter passes with 0 errors (`npm run lint`).

---

## Phases

### Phase 1: Output Token & Path Security Manager
- **Goal**: Implement a hardened, pure in-memory capability token and path resolution service.
- **Tasks**:
  - [ ] Create `Execution/OutputTokenManager.ts`:
    - `getSafeOutputPath(filename: string): { valid: boolean; path?: string; error?: string }`
      - Resolves `path.basename(filename)`.
      - Ensures resolved path is strictly within `./Output/`.
      - Confirms file exists on disk.
    - `generateToken(filename: string, options?: { ttlMs?: number; maxUses?: number }): string`
      - Issues a cryptographically secure UUID (`crypto.randomUUID()`).
      - Stores token mapping `{ token, filename, expiresAt, usesRemaining }`.
    - `validateAndConsumeToken(token: string, requestedFilename: string): { valid: boolean; reason?: string }`
      - Checks existence, expiry, filename match, and decrements `usesRemaining`.
    - Cleanup routine for expired tokens.
  - [ ] Write unit tests in `tests/unit/execution/OutputTokenManager.test.ts`:
    - Test token generation, validation, expiry, and max uses.
    - Test directory traversal attempts (`../`, `../../etc/passwd`, null bytes, absolute paths).
    - Test file existence verification.
- **Verification**: `npx vitest run tests/unit/execution/OutputTokenManager.test.ts` passes.
- **Gate**: 100% tests pass for `OutputTokenManager`.
- **Spec Updates**: N/A (Internal utility).

---

### Phase 2: Express HTTP Output Download & View Router
- **Goal**: Implement `Routes/output.route.ts` and mount it on the Express application.
- **Tasks**:
  - [ ] Create `Routes/output.route.ts`:
    - Route `GET /download/:filename`:
      - Extracts `token` from `req.query.token`.
      - Validates and consumes token via `OutputTokenManager`.
      - Verifies safe path and invokes `res.download(safePath, filename)`.
    - Route `GET /view/:filename`:
      - Extracts `token` from `req.query.token`.
      - Validates and consumes token via `OutputTokenManager`.
      - Verifies safe path, sets appropriate `Content-Type` (`application/json` or `text/plain; charset=utf-8`), and invokes `res.sendFile(safePath)`.
  - [ ] Update `index.ts`:
    - Ensure `/output` route is mounted before or exempted from the `--instance-id` header check (or allows authentication via either `x-api-key` header OR valid capability token in query param).
    - Mount router: `app.use("/output", outputRoutes)`.
  - [ ] Write integration tests in `tests/integration/routes/output.route.test.ts`:
    - Test successful file download with attachment header.
    - Test successful inline view with correct Content-Type.
    - Test rejection of missing token (401), invalid token (403), expired token (403), and path traversal (400).
    - Test behavior with and without `--instance-id` authentication.
- **Verification**: `npx vitest run tests/integration/routes/output.route.test.ts` passes.
- **Gate**: All route integration tests pass.
- **Spec Updates**:
  - `system_routes.md`: Document `/output` endpoints, security constraints, and token validation.

---

### Phase 3: MainAgent WebSocket Artifact Notification Integration
- **Goal**: Wire capability token generation into `MainAgentV1.saveResults()` and emit structured artifact descriptors to the client over WebSocket.
- **Tasks**:
  - [ ] In `Agent/Main/Versions/MainAgentV1.ts`:
    - After writing `.txt` and optional `.json` files in `saveResults()`:
      - Call `outputTokenManager.generateToken(txtFilename)` and `outputTokenManager.generateToken(jsonFilename)`.
      - Construct artifact list:
        ```typescript
        const artifacts = [
          {
            filename: txtFilename,
            format: "text",
            downloadUrl: `/output/download/${encodeURIComponent(txtFilename)}?token=${txtToken}`,
            viewUrl: `/output/view/${encodeURIComponent(txtFilename)}?token=${txtToken}`,
          },
          ...(jsonFilename ? [{
            filename: jsonFilename,
            format: "json",
            downloadUrl: `/output/download/${encodeURIComponent(jsonFilename)}?token=${jsonToken}`,
            viewUrl: `/output/view/${encodeURIComponent(jsonFilename)}?token=${jsonToken}`,
          }] : []),
        ];
        ```
      - Emit `workspace_artifacts` event to client:
        ```typescript
        this.ctx.send({
          type: "workspace_artifacts",
          requestId: this.ctx.requestId,
          data: {
            workspace: this.workspaceData.name,
            workspaceId: this.workspaceId,
            artifacts,
          },
          timestamp: new Date().toISOString(),
        });
        ```
  - [ ] Update integration tests in `tests/integration/output/JsonSidecarOutput.test.ts` to assert that `workspace_artifacts` is broadcast/sent with valid download and view URLs.
- **Verification**: `npx vitest run tests/integration/output/JsonSidecarOutput.test.ts` passes.
- **Gate**: Full vitest test suite passes (`npx vitest run`).
- **Spec Updates**:
  - `system_agent.md`: Document `workspace_artifacts` event format and lifecycle in `MainAgentV1`.

---

### Phase 4: Full Verification & Spec Synchronization
- **Goal**: Synchronize all architecture and product specifications and ensure zero drift.
- **Tasks**:
  - [ ] Update `product_output_json.md` to document the client download and inspection capabilities.
  - [ ] Update `system.md` and `system_routes.md` with `/output` router architecture.
  - [ ] Update `spec-index.json` with entry for `client-output-download`.
  - [ ] Run full test suite (`npx vitest run`) and linter (`npm run lint`).
  - [ ] Stage and commit plan and spec updates.
- **Verification**: `npm run lint && npx vitest run` passes with 0 errors and all tests green.
- **Gate**: All quality gates pass.

---

## Risks & Mitigations
- **Risk**: Token expiration before user clicks download.
  - **Mitigation**: Generous default TTL (10 minutes) and allow multiple uses within that window (`maxUses: 5`).
- **Risk**: Memory leak from abandoned tokens if thousands of runs occur without cleanup.
  - **Mitigation**: Automated expiration cleanup in `OutputTokenManager` on a periodic sweep or on each generation.
- **Risk**: Path traversal via encoded slashes (`%2F`, `..`).
  - **Mitigation**: Use `path.basename` to extract solely the filename component and compare `path.resolve(OUTPUT_DIR, safeFilename)` against `OUTPUT_DIR`.
