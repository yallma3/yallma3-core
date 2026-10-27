---
purpose: "Explore architectural design options for serving and downloading execution output files (JSON/TXT) to clients over HTTP vs WebSocket"
agent: "Antigravity"
llm: "Gemini"
date: "261027"
ticket: "OUTPUT-DOWNLOAD-01"
---

# Design Options: Serving & Downloading Workspace Execution Output Files to Client

## 1. Context

### Baseline Analysis
- Currently, when `MainAgentV1` finishes workspace execution, it writes output artifacts to the local server disk under `./Output/` via [`MainAgentV1.saveResults()`](file:///home/assem/work/yaLLMa3/yallma3-core/Agent/Main/Versions/MainAgentV1.ts#L613):
  1. Plain-text summary: `Output/<workspaceName>_<timestamp>.txt`
  2. Machine-readable JSON trace (when `YALLMA3_OUTPUT_JSON` is enabled): `Output/<workspaceName>_<timestamp>.json`
- Notification back to the client:
  - The server emits string log messages through the WebSocket connection:
    - `Results saved to Output/<workspaceName>_<timestamp>.txt`
    - `Results saved to Output/<workspaceName>_<timestamp>.json`
- **Current Limitation / Gap**:
  - The client only receives text paths. If the client runs on a different machine or browser/mobile client, it cannot access the local filesystem path.
  - There is currently no API endpoint or WebSocket command allowing the client to retrieve, stream, or download the contents of these files.

### Design Goal
Enable clients (YaLLMa3 Studio, web frontends, CLI, or autonomous agents) to reliably discover and download execution output files (`.json` and `.txt`) with minimal overhead, standard browser integration, and strong filesystem security (preventing path traversal).

---

## 2. Scope & Design Parameters

### Scope
- **Components affected**:
  - Server HTTP layer (`Routes/`, `index.ts`)
  - WebSocket notification contract (`Agent/Main/Versions/MainAgentV1.ts`, `Websocket/socket.ts`)
  - Execution tracer output metadata

### Key Design Parameters
1. **Client Ergonomics & Browser Compatibility**: Can the frontend easily prompt a native browser "Save As" file download dialog, open a link in a new tab, or inspect JSON programmatically?
2. **Security & Path Traversal Guarding**: Does the solution guarantee clients cannot read arbitrary files from the server host (`/etc/passwd`, `.env`, source code) using `../` or relative paths?
3. **Transport Efficiency & Memory Footprint**: Does file transfer impact real-time WebSocket latency, or overload Node/Bun process memory when JSON files grow large (e.g., extensive multi-agent logs)?
4. **API Cleanliness & Architectural Separation**: Does the design follow REST/HTTP standards for static/file resources rather than multiplexing bulk binary/file payloads over control WebSockets?
5. **Event Correlation & Structured Discovery**: Does the client receive structured artifact metadata (filename, URL, mime-type, byte size) rather than having to regex-parse unstructured strings from console logs?

---

## 3. Options Evaluated

### Option A: Dedicated HTTP Download & Inspection API with Structured WebSocket Metadata (Recommended)

- **Approach**:
  1. Create a dedicated Express router `Routes/output.route.ts` mounted at `/output`:
     - `GET /output/download/:filename`: Uses `res.download(filePath, filename)` with `Content-Disposition: attachment` to prompt native browser download dialog.
     - `GET /output/view/:filename`: Uses `res.sendFile(filePath)` with `Content-Type: application/json` or `text/plain; charset=utf-8` to allow inline previewing in the UI or browser tab.
     - Strict path sanitization: enforce `filename = path.basename(filename)`, verify that `path.resolve(OUTPUT_DIR, filename)` is contained strictly within the `Output` directory, and verify file existence before streaming.
  2. Enhance WebSocket completion event in `MainAgentV1`:
     - When saving results, emit a structured WebSocket event (or enrich the completion payload) with artifact descriptors:
       ```json
       {
         "type": "workspace_artifacts",
         "data": {
           "workspace": "AAA",
           "artifacts": [
             {
               "filename": "AAA_2026-10-27T18-54-25-426Z.json",
               "downloadUrl": "/output/download/AAA_2026-10-27T18-54-25-426Z.json",
               "viewUrl": "/output/view/AAA_2026-10-27T18-54-25-426Z.json",
               "format": "json"
             },
             {
               "filename": "AAA_2026-10-27T18-54-25-426Z.txt",
               "downloadUrl": "/output/download/AAA_2026-10-27T18-54-25-426Z.txt",
               "viewUrl": "/output/view/AAA_2026-10-27T18-54-25-426Z.txt",
               "format": "text"
             }
           ]
         }
       }
       ```
- **Pros**:
  - **Native Browser Download**: Works directly with standard `<a href="/output/download/..." download>` tags and browser download managers without JavaScript blob-buffering.
  - **Zero WebSocket Head-of-Line Blocking**: Large JSON files (e.g. 10MB+ LLM traces) stream via kernel HTTP buffers and do not congest real-time WebSocket control frames.
  - **Strong Security Boundary**: `path.basename` and `path.resolve` strictly confine access to `./Output`.
  - **Dual Use (View & Download)**: Enables both direct inline inspection in Studio/AI Agent and single-click downloading.
  - **Machine-Readable Discovery**: Structured completion event removes the need for client regex scraping of log messages.
- **Cons**:
  - Requires exposing an HTTP endpoint alongside the WebSocket server (the Express HTTP server already exists and is running on the same port).
- **Fit**: Excellent. Follows standard client-server architecture where WebSockets handle live events and HTTP handles file transfers.
- **Impact**:
  - New file: `Routes/output.route.ts`
  - Mount route in `index.ts`: `app.use("/output", outputRoutes)`
  - Add structured event emission in `Agent/Main/Versions/MainAgentV1.ts`

---

### Option B: WebSocket Request-Response File Transfer (`download_file` / `file_content`)

- **Approach**:
  1. Add a new WebSocket command `get_output_file` to `Websocket/socket.ts`:
     ```json
     {
       "type": "get_output_file",
       "filename": "AAA_2026-10-27T18-54-25-426Z.json",
       "requestId": "req-123"
     }
     ```
  2. Server reads the file from `./Output/` (with path sanitization).
  3. Server sends back the file content inside a WebSocket message:
     ```json
     {
       "type": "output_file_content",
       "requestId": "req-123",
       "filename": "AAA_2026-10-27T18-54-25-426Z.json",
       "encoding": "utf-8",
       "content": "..."
     }
     ```
  4. Frontend client JavaScript receives the message, creates an in-memory `Blob`, generates an object URL (`URL.createObjectURL(blob)`), creates a synthetic `<a>` element, clicks it, and revokes the URL.
- **Pros**:
  - Everything runs over the single existing WebSocket connection (no separate HTTP URLs or CORS concerns).
  - Can reuse WebSocket authentication if authentication is added later.
- **Cons**:
  - **Memory Bloat & Framing Limits**: Large JSON traces must be buffered entirely into V8/Bun memory as strings and serialized into JSON frames. Can trigger WebSocket payload limit errors or memory spikes.
  - **Complex Client Implementation**: The frontend must implement manual blob construction, download triggering, and memory cleanup rather than relying on browser-native downloads.
  - **No Direct Link Sharing / Previewing**: Users or downstream AI agents cannot curl or open a file URL directly in a browser tab.
- **Fit**: Fair. Solves the issue within WebSocket, but violates best practices for file distribution.
- **Impact**:
  - Edit `Websocket/socket.ts` to add message handler for `get_output_file`.

---

### Option C: Generic Static File Serving via `express.static`

- **Approach**:
  1. Add a single line to `index.ts`:
     ```typescript
     app.use("/output", express.static(path.join(process.cwd(), "Output")));
     ```
  2. Send download URLs in log messages or WebSocket packets: `http://<host>:<port>/output/<filename>`.
- **Pros**:
  - Extreme simplicity: minimal code changes.
  - Uses Express's built-in static file handler.
- **Cons**:
  - **Lack of Download Prompt (`Content-Disposition`)**: `express.static` serves `.json` and `.txt` files with `Content-Disposition: inline`. Browsers will simply display the JSON in the window instead of triggering a download dialog unless the frontend forces blob fetching.
  - **No Directory Listing or File-Specific Validation**: Exposes all files placed in `Output/` without customized metadata or download counters.
  - Unstructured discovery still relies on string parsing unless accompanied by structured events.
- **Fit**: Good, but crude and suboptimal user experience compared to Option A.
- **Impact**:
  - One line change in `index.ts`.

---

## 4. Evaluation Matrix

Scoring options (1 to 5 scale, 5 being best) against weighted criteria:

| Criterion | Weight | Option A: Dedicated HTTP Download API | Option B: WebSocket Command Transfer | Option C: `express.static` |
|:---|:---:|:---:|:---:|:---:|
| **Technical Feasibility** | 25% | **5** (Straightforward Express route) | **4** (Requires custom protocol & blob logic) | **5** (Trivial 1-line middleware) |
| **Design Parameters Fit** | 25% | **5** (Native downloads, secure, streaming) | **2** (No streaming, high memory, complex client) | **3** (No download header, inline only) |
| **Simplicity** | 10% | **4** (Clean modular route) | **3** (Multiplexed stateful socket logic) | **5** (Built-in Express) |
| **Reduced Dependencies** | 10% | **5** (Uses existing Express & Node `fs`) | **5** (Uses existing WebSocket) | **5** (Uses existing Express) |
| **Software Design Best Practices** | 10% | **5** (REST for files, WS for real-time events) | **2** (Anti-pattern: bulk file over WS) | **4** (Standard static middleware) |
| **Effort / Cost to Implement** | 10% | **5** (~50 LOC clean router + test) | **3** (Needs client blob handler & tests) | **5** (<5 LOC) |
| **Risks & Side Effects** | 10% | **5** (Strict path sanitization, safe) | **3** (Frame size limits, memory pressure) | **4** (Potential static exposure) |
| **Weighted Total** | **100%** | **4.90** | **3.05** | **4.25** |

---

## 5. Recommendation

### Primary Recommendation: **Option A (Dedicated HTTP Download & Inspection API with Structured WebSocket Metadata)**

#### Why Option A Wins:
1. **Separation of Concerns**: HTTP is the web's native protocol for file transfers, supporting streaming, caching, range requests, and browser-managed downloads (`Content-Disposition: attachment`). WebSockets remain lightweight for real-time telemetry and control.
2. **Superior Developer Experience**: The client UI can either offer a direct `<a href="/output/download/..." download>` button or an inline viewer modal (`/output/view/...`).
3. **Rock-Solid Security**: Explicitly resolves paths against `path.basename()`, preventing directory traversal attacks (`../../etc/passwd`).
4. **Machine-Readable Discovery**: Emitting a structured completion payload (`workspace_artifacts`) alongside the human-readable log allows AI Agents and UI frontends to programmatically discover all output artifacts without brittle regex parsing.

---

## Selected Option

- **Option**: Choice 1 — Token-Gated HTTP Download & Inspection API
- **Selected By**: Antigravity (Gemini)
- **Timestamp**: 2026-10-27T22:27:00+03:00
- **User**: assem
- **Rationale**: 
  - Standard unauthenticated HTTP with `cors: *` exposes execution traces to cross-origin browser exfiltration and timestamp enumeration attacks.
  - Furthermore, header-based `--instance-id` authentication fails on native browser `<a href>` downloads.
  - Token-Gated HTTP solves both issues: the server issues a cryptographically secure, ephemeral capability token over the active WebSocket upon workspace completion. The token is validated via query parameter (`/output/download/:filename?token=<uuid>`), preventing CORS data theft, timestamp enumeration, and directory traversal while providing high-performance, non-blocking HTTP streaming for browser downloads.
- **Reference**: [.agents/design-options/design-options_261027_client_download_output_files.md](design-options_261027_client_download_output_files.md)
- **Spec Update Plan**:
  - `product_output_json.md`: Update to include client download and artifact retrieval requirements.
  - `system_agent.md`: Document token generation and artifact notification payload emitted by `MainAgentV1`.
  - `system.md` / `system_entry.md`: Document Express route `/output` with token verification middleware.
  - `spec-index.json`: Add index entry for `client-output-download`.

