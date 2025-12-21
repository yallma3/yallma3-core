/*
* yaLLMa3 - Framework for building AI agents that are capable of learning from their environment and interacting with it.
 
 * Copyright (C) 2025 yaLLMa3
 
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
   If a copy of the MPL was not distributed with this file, You can obtain one at https://www.mozilla.org/MPL/2.0/.
 
 * This software is distributed on an "AS IS" basis,
   WITHOUT WARRANTY OF ANY KIND, either express or implied.
   See the Mozilla Public License for the specific language governing rights and limitations under the License.
*/

import express from "express";
import { AvailableLLMs } from "../LLM/config";

const router = express.Router();

// Get all public models
router.get("/models", async (req, res) => {
  try {
    res.json({
      success: true,
      AvailableLLMs,
    });
  } catch (error) {
    console.error("Error listing public models:", error);
    res.status(500).json({
      success: false,
      error: "Failed to list models",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});

export default router;
