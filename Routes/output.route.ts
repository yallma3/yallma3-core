import express from "express";
import { OutputTokenManager } from "../Execution/OutputTokenManager";

const router = express.Router();
const tokenManager = OutputTokenManager.getInstance();

/**
 * GET /output/download/:filename
 * Streams the requested output artifact with Content-Disposition: attachment for native browser download.
 * Requires a valid capability token in query string: ?token=<uuid>.
 */
router.get("/download/:filename", (req, res) => {
  const { filename } = req.params;
  const token = req.query.token as string | undefined;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Missing required download token in query parameters (?token=...)",
    });
  }

  const tokenValidation = tokenManager.validateAndConsumeToken(token, filename);
  if (!tokenValidation.valid) {
    return res.status(403).json({
      success: false,
      error: tokenValidation.reason || "Forbidden: Invalid or expired capability token",
    });
  }

  const pathResult = tokenManager.getSafeOutputPath(filename);
  if (!pathResult.valid || !pathResult.path) {
    const isNotFound = pathResult.error?.includes("not found");
    return res.status(isNotFound ? 404 : 400).json({
      success: false,
      error: pathResult.error || "File could not be retrieved",
    });
  }

  res.download(pathResult.path, filename);
});

/**
 * GET /output/view/:filename
 * Streams the requested output artifact with inline Content-Type for browser tab / modal viewing.
 * Requires a valid capability token in query string: ?token=<uuid>.
 */
router.get("/view/:filename", (req, res) => {
  const { filename } = req.params;
  const token = req.query.token as string | undefined;

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Missing required capability token in query parameters (?token=...)",
    });
  }

  const tokenValidation = tokenManager.validateAndConsumeToken(token, filename);
  if (!tokenValidation.valid) {
    return res.status(403).json({
      success: false,
      error: tokenValidation.reason || "Forbidden: Invalid or expired capability token",
    });
  }

  const pathResult = tokenManager.getSafeOutputPath(filename);
  if (!pathResult.valid || !pathResult.path) {
    const isNotFound = pathResult.error?.includes("not found");
    return res.status(isNotFound ? 404 : 400).json({
      success: false,
      error: pathResult.error || "File could not be retrieved",
    });
  }

  if (filename.endsWith(".json")) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
  } else {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
  }

  res.sendFile(pathResult.path);
});

export default router;
