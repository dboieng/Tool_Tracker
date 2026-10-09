// routes/toolTrackerRoutes.js
// Mounted at /tool-tracker (see app.js). Copy this file into Tradies Diary as-is.

import express, { Router } from "express";
import authenticate from "../middlewares/auth.js";
import { isAdminOrSuperAdminOrSupervisor } from "../middlewares/roleAuth.js";
import { authenticateDevice } from "../middlewares/deviceAuth.js";
import * as c from "../controllers/toolTrackerController.js";

const router = Router();

// ---- Walter (device key, no user login) ----
// Parse the body as JSON whatever Content-Type the modem sends (it may say text/plain)
const anyJson = express.json({ type: () => true, limit: "16kb" });
router.post("/ingest", anyJson, authenticateDevice, c.ingest);

// ---- Everything below needs a logged-in user ----
router.use(authenticate);

// Anyone logged in can look
router.get("/summary", c.getSummary);
router.get("/reports", c.getReports);
router.get("/changes", c.getChanges);
router.get("/tags", c.listTags);

// Admins / supervisors can change the tool list and devices
router.post("/tags", isAdminOrSuperAdminOrSupervisor, c.createTag);
router.put("/tags/:uuid", isAdminOrSuperAdminOrSupervisor, c.updateTag);
router.delete("/tags/:uuid", isAdminOrSuperAdminOrSupervisor, c.deleteTag);

router.get("/devices", isAdminOrSuperAdminOrSupervisor, c.listDevices);
router.post("/devices", isAdminOrSuperAdminOrSupervisor, c.createDevice);
router.post("/devices/:uuid/rotate-key", isAdminOrSuperAdminOrSupervisor, c.rotateDeviceKey);
router.put("/devices/:uuid", isAdminOrSuperAdminOrSupervisor, c.updateDevice);
router.delete("/devices/:uuid", isAdminOrSuperAdminOrSupervisor, c.deleteDevice);

export default router;
