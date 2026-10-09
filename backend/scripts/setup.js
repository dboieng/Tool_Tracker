// scripts/setup.js
// One-off: add your 8 iBS05 tags and one Walter device, then print the device key.
//   npm run setup              (first time)
//   npm run setup -- --new-key (lost the key? make a new one)

import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { createDevice, createTag, rotateDeviceKey } from "../services/toolTrackerService.js";

dotenv.config();
const prisma = new PrismaClient();
const ORG_ID = Number(process.env.ORG_ID || 1);

// Same list as the Arduino TOOL_LIST
const TAGS = [
  { mac: "ec:5a:5f:39:bd:42", name: "Tool 1" },
  { mac: "db:44:60:c7:0e:f1", name: "Tool 2" },
  { mac: "cb:8c:79:c9:bf:31", name: "Tool 3" },
  { mac: "fb:f7:7f:af:55:45", name: "Tool 4" },
  { mac: "c9:80:83:98:79:d1", name: "Tool 5" },
  { mac: "eb:1d:68:35:a4:fd", name: "Tool 6" },
  { mac: "e3:d2:aa:b5:d5:99", name: "Mystery tag" },
  { mac: "fe:7e:7d:60:c5:3e", name: "Toolbox (box's own tag)" },
];

const main = async () => {
  for (const t of TAGS) {
    try {
      await createTag(ORG_ID, t);
      console.log(`  added   ${t.name}`);
    } catch (e) {
      console.log(`  skipped ${t.name} (${e.message})`);
    }
  }

  const existing = await prisma.toolTrackerDevice.findFirst({ where: { organisationId: ORG_ID, deleteFlag: false } });
  let key;
  if (!existing) {
    const d = await createDevice(ORG_ID, { name: "DCB Toolbox" });
    key = d.deviceKey;
    console.log(`\n  created device "${d.name}"`);
  } else if (process.argv.includes("--new-key")) {
    key = (await rotateDeviceKey(ORG_ID, existing.uuid)).deviceKey;
    console.log(`\n  new key for "${existing.name}" (the old key no longer works)`);
  } else {
    console.log(`\n  device "${existing.name}" already exists. Lost its key? Run: npm run setup -- --new-key`);
  }

  if (key) {
    console.log("\n  ==============================================");
    console.log("  DEVICE KEY (put this in the Walter sketch):");
    console.log(`  ${key}`);
    console.log("  It is shown ONCE - copy it somewhere safe now.");
    console.log("  ==============================================\n");
  }
  await prisma.$disconnect();
};

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
