// services/toolTrackerService.js
// All database work for the Tool Tracker. Every query is limited to one
// organisation (organisationId), the same way the rest of Tradies Diary works.

import { PrismaClient } from "@prisma/client";
import { ApiError } from "../middlewares/ApiResponse.js";
import { hashDeviceKey, newDeviceKey } from "../middlewares/deviceAuth.js";

const prisma = globalThis.__toolTrackerPrisma || (globalThis.__toolTrackerPrisma = new PrismaClient());

const MAX_TAGS_PER_REPORT = 64;

// ---------- small helpers ----------

/** "EC5A5F39BD42", "ec-5a-5f-39-bd-42", "ec:5a:5f:39:bd:42" -> "ec:5a:5f:39:bd:42" (or null) */
export const normalizeMac = (value) => {
  const hex = String(value ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(":");
};

const num = (v, min, max) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
};
const int = (v, min, max) => {
  const n = num(v, min, max);
  return n === null ? null : Math.round(n);
};

const publicDevice = (d) => ({
  uuid: d.uuid,
  name: d.name,
  lastReportOn: d.lastReportOn,
  batteryV: d.batteryV,
  latitude: d.latitude,
  longitude: d.longitude,
  gpsAccuracyM: d.gpsAccuracyM,
  gpsOn: d.gpsOn,
  lteRsrp: d.lteRsrp,
  createdOn: d.createdOn,
});

const publicTag = (t, deviceNames = new Map()) => ({
  uuid: t.uuid,
  mac: t.mac,
  name: t.name,
  notes: t.notes,
  toolInfoId: t.toolInfoId,
  inBox: t.inBox,
  lastSeenOn: t.lastSeenOn,
  lastInBoxOn: t.lastInBoxOn,
  lastRssi: t.lastRssi,
  batteryV: t.batteryV,
  deviceName: t.lastDeviceId ? deviceNames.get(t.lastDeviceId) || null : null,
});

// =====================================================================
// INGEST — called by Walter
// =====================================================================
//
// Body (short keys keep the LTE message small):
// {
//   "bat": 5.12,            Walter battery volts
//   "lat": -33.78, "lon": 151.19, "acc": 10,   GPS (optional)
//   "rsrp": -88,            LTE signal (optional)
//   "lid": 1,               1 = lid closed when measured (optional)
//   "fw": "1.0",            firmware version (optional)
//   "tags": [ { "m": "ec5a5f39bd42", "in": 1, "r": -36, "p": 94, "b": 3.01 }, ... ]
// }
//   m = MAC, in = 1 if Walter decided it is IN the box, r = avg RSSI,
//   p = % strong packets, b = tag battery volts.
// Tags Walter did not hear at all are simply left out -> they count as missing.

export const ingestReport = async (device, body = {}) => {
  const now = new Date();
  const firstReport = !device.lastReportOn; // don't announce every tool as RETURNED on the first ever report

  // ---- read the tags Walter heard ----
  const rawTags = Array.isArray(body.tags) ? body.tags.slice(0, MAX_TAGS_PER_REPORT) : [];
  const heard = new Map();
  for (const t of rawTags) {
    const mac = normalizeMac(t?.m ?? t?.mac);
    if (!mac) continue;
    heard.set(mac, {
      inBox: Boolean(Number(t.in ?? t.inBox ?? 0)),
      rssi: int(t.r ?? t.rssi, -130, 0),
      strongPct: int(t.p ?? t.strongPct, 0, 100),
      batteryV: num(t.b ?? t.batteryV, 0, 5),
    });
  }

  // ---- GPS: ignore the modem's "no fix" values (0,0 or huge accuracy) ----
  let latitude = num(body.lat, -90, 90);
  let longitude = num(body.lon, -180, 180);
  const gpsAccuracyM = num(body.acc, 0, 100000);
  const gpsOk = latitude !== null && longitude !== null && !(latitude === 0 && longitude === 0) &&
                (gpsAccuracyM === null || gpsAccuracyM < 1000);
  if (!gpsOk) { latitude = null; longitude = null; }

  const batteryV = num(body.bat, 0, 20);
  const lteRsrp = int(body.rsrp, -160, 0);
  const lidClosed = body.lid === undefined ? null : Boolean(Number(body.lid));
  const firmware = body.fw ? String(body.fw).slice(0, 40) : null;

  const tags = await prisma.toolTrackerTag.findMany({
    where: { organisationId: device.organisationId, deleteFlag: false },
  });

  return prisma.$transaction(async (tx) => {
    const report = await tx.toolTrackerReport.create({
      data: {
        organisationId: device.organisationId,
        deviceId: device.id,
        receivedOn: now,
        batteryV, latitude, longitude,
        gpsAccuracyM: gpsOk ? gpsAccuracyM : null,
        lteRsrp, lidClosed, firmware,
      },
    });

    const items = [];
    const returned = [];
    const left = [];
    const knownMacs = new Set();
    let inCount = 0;

    for (const tag of tags) {
      knownMacs.add(tag.mac);
      const h = heard.get(tag.mac);

      // Not heard, and last seen in a DIFFERENT toolbox -> this report says nothing about it.
      if (!h && tag.lastDeviceId && tag.lastDeviceId !== device.id) continue;

      const inBox = h ? h.inBox : false;
      if (inBox) inCount++;

      let change = null;
      if (!firstReport) {
        if (inBox && !tag.inBox) { change = "RETURNED"; returned.push(tag.name); }
        else if (!inBox && tag.inBox) { change = "LEFT"; left.push(tag.name); }
      }

      items.push({
        reportId: report.id, tagId: tag.id, mac: tag.mac, inBox, heard: Boolean(h),
        rssi: h?.rssi ?? null, strongPct: h?.strongPct ?? null, batteryV: h?.batteryV ?? null, change,
      });

      const update = { inBox };
      if (h) {
        update.lastSeenOn = now;
        update.lastRssi = h.rssi;
        if (h.batteryV !== null) update.batteryV = h.batteryV;
      }
      if (inBox) {
        update.lastInBoxOn = now;
        update.lastDeviceId = device.id;
      }
      await tx.toolTrackerTag.update({ where: { id: tag.id }, data: update });
    }

    // Tags heard that are not in the tool list yet -> "unknown tags"
    let unknownCount = 0;
    for (const [mac, h] of heard) {
      if (knownMacs.has(mac)) continue;
      unknownCount++;
      items.push({
        reportId: report.id, tagId: null, mac, inBox: h.inBox, heard: true,
        rssi: h.rssi, strongPct: h.strongPct, batteryV: h.batteryV, change: null,
      });
    }

    if (items.length) await tx.toolTrackerReportItem.createMany({ data: items });

    await tx.toolTrackerDevice.update({
      where: { id: device.id },
      data: {
        lastReportOn: now,
        batteryV,
        lteRsrp,
        ...(gpsOk ? { latitude, longitude, gpsAccuracyM, gpsOn: now } : {}),
      },
    });

    return {
      report: report.uuid,
      inBox: inCount,
      tools: tags.length,
      returned,
      left,
      unknown: unknownCount,
    };
  });
};

// =====================================================================
// DASHBOARD
// =====================================================================

export const getSummary = async (organisationId) => {
  const [devices, tags] = await Promise.all([
    prisma.toolTrackerDevice.findMany({ where: { organisationId, deleteFlag: false }, orderBy: { name: "asc" } }),
    prisma.toolTrackerTag.findMany({ where: { organisationId, deleteFlag: false }, orderBy: { name: "asc" } }),
  ]);
  const deviceNames = new Map(devices.map((d) => [d.id, d.name]));
  const knownMacs = new Set(tags.map((t) => t.mac));

  // Unknown tags heard in the last 7 days
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const unknownItems = await prisma.toolTrackerReportItem.findMany({
    where: { tagId: null, report: { organisationId, receivedOn: { gte: since } } },
    include: { report: { select: { receivedOn: true, deviceId: true } } },
    orderBy: { id: "desc" },
    take: 500,
  });
  const unknownMap = new Map();
  for (const it of unknownItems) {
    if (knownMacs.has(it.mac)) continue; // added to the tool list since
    const u = unknownMap.get(it.mac);
    if (!u) {
      unknownMap.set(it.mac, {
        mac: it.mac, lastSeenOn: it.report.receivedOn, lastRssi: it.rssi, inBox: it.inBox,
        batteryV: it.batteryV, deviceName: deviceNames.get(it.report.deviceId) || null, reports: 1,
      });
    } else u.reports++;
  }

  const changes = await getChanges(organisationId, 20, deviceNames);

  return {
    devices: devices.map(publicDevice),
    tags: tags.map((t) => publicTag(t, deviceNames)),
    unknown: [...unknownMap.values()],
    changes,
    summary: { tools: tags.length, inBox: tags.filter((t) => t.inBox).length },
  };
};

export const getChanges = async (organisationId, limit = 50, deviceNames = null) => {
  if (!deviceNames) {
    const devices = await prisma.toolTrackerDevice.findMany({ where: { organisationId } });
    deviceNames = new Map(devices.map((d) => [d.id, d.name]));
  }
  const items = await prisma.toolTrackerReportItem.findMany({
    where: { change: { not: null }, report: { organisationId } },
    include: {
      tag: { select: { name: true, uuid: true } },
      report: { select: { receivedOn: true, latitude: true, longitude: true, deviceId: true } },
    },
    orderBy: { id: "desc" },
    take: Math.min(Number(limit) || 50, 200),
  });
  return items.map((it) => ({
    change: it.change,
    toolName: it.tag?.name || it.mac,
    tagUuid: it.tag?.uuid || null,
    on: it.report.receivedOn,
    latitude: it.report.latitude,
    longitude: it.report.longitude,
    deviceName: deviceNames.get(it.report.deviceId) || null,
  }));
};

export const getReports = async (organisationId, limit = 30) => {
  const reports = await prisma.toolTrackerReport.findMany({
    where: { organisationId },
    include: {
      device: { select: { name: true } },
      items: { select: { inBox: true, tagId: true, change: true } },
    },
    orderBy: { id: "desc" },
    take: Math.min(Number(limit) || 30, 200),
  });
  return reports.map((r) => ({
    uuid: r.uuid,
    receivedOn: r.receivedOn,
    deviceName: r.device?.name,
    batteryV: r.batteryV,
    latitude: r.latitude,
    longitude: r.longitude,
    gpsAccuracyM: r.gpsAccuracyM,
    lteRsrp: r.lteRsrp,
    lidClosed: r.lidClosed,
    inBox: r.items.filter((i) => i.tagId && i.inBox).length,
    tools: r.items.filter((i) => i.tagId).length,
    unknown: r.items.filter((i) => !i.tagId).length,
    changes: r.items.filter((i) => i.change).length,
  }));
};

// =====================================================================
// TAGS (the tool list)
// =====================================================================

export const listTags = async (organisationId) => {
  const tags = await prisma.toolTrackerTag.findMany({ where: { organisationId, deleteFlag: false }, orderBy: { name: "asc" } });
  return tags.map((t) => publicTag(t));
};

export const createTag = async (organisationId, { mac, name, notes, toolInfoId }) => {
  const cleanMac = normalizeMac(mac);
  if (!cleanMac) throw new ApiError("MAC address must be 12 hex digits, e.g. ec:5a:5f:39:bd:42", 400);
  if (!name || !String(name).trim()) throw new ApiError("Tool name is required", 400);

  const existing = await prisma.toolTrackerTag.findUnique({
    where: { organisationId_mac: { organisationId, mac: cleanMac } },
  });
  const data = {
    name: String(name).trim().slice(0, 100),
    notes: notes ? String(notes).slice(0, 190) : null,
    toolInfoId: toolInfoId ? Number(toolInfoId) : null,
  };

  if (existing && !existing.deleteFlag) throw new ApiError(`That tag is already on "${existing.name}"`, 409);

  // If Walter already heard this tag as an "unknown tag", carry over when/how it was last heard
  const lastHeard = await prisma.toolTrackerReportItem.findFirst({
    where: { mac: cleanMac, tagId: null, report: { organisationId } },
    include: { report: { select: { receivedOn: true } } },
    orderBy: { id: "desc" },
  });
  if (lastHeard) {
    data.lastSeenOn = lastHeard.report.receivedOn;
    data.lastRssi = lastHeard.rssi;
    data.batteryV = lastHeard.batteryV;
  }

  const tag = existing
    ? await prisma.toolTrackerTag.update({ where: { id: existing.id }, data: { ...data, deleteFlag: false } }) // re-add a deleted tag
    : await prisma.toolTrackerTag.create({ data: { ...data, organisationId, mac: cleanMac } });
  return publicTag(tag);
};

export const updateTag = async (organisationId, uuid, { name, notes, toolInfoId }) => {
  const tag = await prisma.toolTrackerTag.findFirst({ where: { uuid, organisationId, deleteFlag: false } });
  if (!tag) throw new ApiError("Tool not found", 404);
  const data = {};
  if (name !== undefined) {
    if (!String(name).trim()) throw new ApiError("Tool name is required", 400);
    data.name = String(name).trim().slice(0, 100);
  }
  if (notes !== undefined) data.notes = notes ? String(notes).slice(0, 190) : null;
  if (toolInfoId !== undefined) data.toolInfoId = toolInfoId ? Number(toolInfoId) : null;
  return publicTag(await prisma.toolTrackerTag.update({ where: { id: tag.id }, data }));
};

export const deleteTag = async (organisationId, uuid) => {
  const tag = await prisma.toolTrackerTag.findFirst({ where: { uuid, organisationId, deleteFlag: false } });
  if (!tag) throw new ApiError("Tool not found", 404);
  await prisma.toolTrackerTag.update({ where: { id: tag.id }, data: { deleteFlag: true, inBox: false } });
  return { uuid };
};

// =====================================================================
// DEVICES (Walter gateways)
// =====================================================================

export const listDevices = async (organisationId) => {
  const devices = await prisma.toolTrackerDevice.findMany({ where: { organisationId, deleteFlag: false }, orderBy: { name: "asc" } });
  return devices.map(publicDevice);
};

/** Creates a device and returns its key ONCE. Only the hash is stored. */
export const createDevice = async (organisationId, { name }) => {
  if (!name || !String(name).trim()) throw new ApiError("Device name is required", 400);
  const deviceKey = newDeviceKey();
  const device = await prisma.toolTrackerDevice.create({
    data: { organisationId, name: String(name).trim().slice(0, 100), keyHash: hashDeviceKey(deviceKey) },
  });
  return { ...publicDevice(device), deviceKey };
};

export const rotateDeviceKey = async (organisationId, uuid) => {
  const device = await prisma.toolTrackerDevice.findFirst({ where: { uuid, organisationId, deleteFlag: false } });
  if (!device) throw new ApiError("Device not found", 404);
  const deviceKey = newDeviceKey();
  await prisma.toolTrackerDevice.update({ where: { id: device.id }, data: { keyHash: hashDeviceKey(deviceKey) } });
  return { uuid, deviceKey };
};

export const deleteDevice = async (organisationId, uuid) => {
  const device = await prisma.toolTrackerDevice.findFirst({ where: { uuid, organisationId, deleteFlag: false } });
  if (!device) throw new ApiError("Device not found", 404);
  await prisma.toolTrackerDevice.update({ where: { id: device.id }, data: { deleteFlag: true } });
  return { uuid };
};
