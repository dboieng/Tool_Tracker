// middlewares/deviceAuth.js
// Walter has no user login. Each toolbox gets its own secret "device key".
// Walter sends it in the X-Device-Key header; we compare its sha256 hash with the
// one stored for the device. (We never store the key itself, like a password.)
//
// This file is NEW for Tradies Diary — keep it when merging.

import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { ApiError } from "./ApiResponse.js";

const prisma = globalThis.__toolTrackerPrisma || (globalThis.__toolTrackerPrisma = new PrismaClient());

export const hashDeviceKey = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");

export const newDeviceKey = () => crypto.randomBytes(24).toString("base64url"); // 32 characters

export const authenticateDevice = async (req, res, next) => {
  try {
    // Header (preferred) or "k" inside the JSON body (simpler for Walter's modem;
    // still private because the whole body is encrypted by HTTPS)
    const key = req.headers["x-device-key"] || req.body?.k;
    if (!key) throw new ApiError("Missing device key (X-Device-Key header or \"k\" in body)", 401);

    const device = await prisma.toolTrackerDevice.findFirst({
      where: { keyHash: hashDeviceKey(key), deleteFlag: false },
    });
    if (!device) throw new ApiError("Unknown device key", 401);

    req.device = device;
    next();
  } catch (error) {
    next(new ApiError(error?.message, error?.status || 401));
  }
};
