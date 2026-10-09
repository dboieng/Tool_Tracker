// app.js — standalone Tool Tracker server
// When merging into Tradies Diary you only need the ONE line marked below.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import toolTrackerRoutes from "./routes/toolTrackerRoutes.js";
import { errorHandler } from "./middlewares/ApiResponse.js";

dotenv.config();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "100kb" }));

// >>> The one line Tradies Diary's app.js needs (plus the import above) <<<
app.use("/tool-tracker", toolTrackerRoutes);

app.get("/health", (req, res) => res.json({ status: 200, success: true, data: { health: "ok" } }));

// Standalone only: serve the demo web page
const here = path.dirname(fileURLToPath(import.meta.url));
app.use(express.static(path.join(here, "public")));

app.use(errorHandler);

export default app;
