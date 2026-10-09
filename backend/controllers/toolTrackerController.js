// controllers/toolTrackerController.js
// Thin HTTP layer: read the request, call the service, send the standard response.

import * as service from "../services/toolTrackerService.js";
import { ApiError, SuccessResponse } from "../middlewares/ApiResponse.js";

const orgOf = (req) => {
  const organisationId = req?.user?.organisationId;
  if (!organisationId) throw new ApiError("Organisation not found for user", 400);
  return organisationId;
};

const wrap = (fn) => async (req, res, next) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (!(error instanceof ApiError)) console.error("[tool-tracker]", error);
    next(new ApiError(error?.message, error?.status));
  }
};

// ---- Walter ----
export const ingest = wrap(async (req, res) => {
  const result = await service.ingestReport(req.device, req.body);
  SuccessResponse(res, result, "Report saved", 201);
});

// ---- Dashboard ----
export const getSummary = wrap(async (req, res) => {
  SuccessResponse(res, await service.getSummary(orgOf(req)), "Tool tracker summary");
});
export const getReports = wrap(async (req, res) => {
  SuccessResponse(res, await service.getReports(orgOf(req), req.query.limit), "Reports");
});
export const getChanges = wrap(async (req, res) => {
  SuccessResponse(res, await service.getChanges(orgOf(req), req.query.limit), "Changes");
});

// ---- Tags ----
export const listTags = wrap(async (req, res) => {
  SuccessResponse(res, await service.listTags(orgOf(req)), "Tools");
});
export const createTag = wrap(async (req, res) => {
  SuccessResponse(res, await service.createTag(orgOf(req), req.body || {}), "Tool added", 201);
});
export const updateTag = wrap(async (req, res) => {
  SuccessResponse(res, await service.updateTag(orgOf(req), req.params.uuid, req.body || {}), "Tool updated");
});
export const deleteTag = wrap(async (req, res) => {
  SuccessResponse(res, await service.deleteTag(orgOf(req), req.params.uuid), "Tool removed");
});

// ---- Devices ----
export const listDevices = wrap(async (req, res) => {
  SuccessResponse(res, await service.listDevices(orgOf(req)), "Devices");
});
export const createDevice = wrap(async (req, res) => {
  SuccessResponse(res, await service.createDevice(orgOf(req), req.body || {}),
    "Device created. Copy the device key now - it is only shown once.", 201);
});
export const rotateDeviceKey = wrap(async (req, res) => {
  SuccessResponse(res, await service.rotateDeviceKey(orgOf(req), req.params.uuid),
    "New device key created. Copy it now - it is only shown once.");
});
export const deleteDevice = wrap(async (req, res) => {
  SuccessResponse(res, await service.deleteDevice(orgOf(req), req.params.uuid), "Device removed");
});
