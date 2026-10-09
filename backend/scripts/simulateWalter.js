// scripts/simulateWalter.js
// Pretends to be Walter and sends one report, so you can test the page
// before the real Walter code exists.
//
//   DEVICE_KEY=xxxx npm run simulate                 (Tools 1-4 in the box, 5-6 out)
//   DEVICE_KEY=xxxx npm run simulate -- all-in
//   DEVICE_KEY=xxxx npm run simulate -- all-out
//   DEVICE_KEY=xxxx npm run simulate -- some-in https://your-tunnel-url   (test via the internet)

import dotenv from "dotenv";
dotenv.config();

const key = process.env.DEVICE_KEY;
if (!key) {
  console.error("Set DEVICE_KEY first, e.g.  DEVICE_KEY=abc123 npm run simulate");
  process.exit(1);
}
const scenario = process.argv[2] || "some-in";
const baseUrl = process.argv[3] || `http://localhost:${process.env.PORT || 3100}`;

const IN = (m, r, b = 3.0) => ({ m, in: 1, r, p: 95, b });
const OUT = (m, r, b = 3.0) => ({ m, in: 0, r, p: 0, b });

const scenarios = {
  "all-in": [
    IN("ec5a5f39bd42", -36), IN("db4460c70ef1", -35), IN("cb8c79c9bf31", -42), IN("fbf77faf5545", -49),
    IN("c980839879d1", -44), IN("eb1d6835a4fd", -46), IN("fe7e7d60c53e", -35),
  ],
  "some-in": [
    IN("ec5a5f39bd42", -36), IN("db4460c70ef1", -35), IN("cb8c79c9bf31", -42), IN("fbf77faf5545", -49),
    OUT("c980839879d1", -72), OUT("eb1d6835a4fd", -80), OUT("e3d2aab5d599", -90), IN("fe7e7d60c53e", -35),
    OUT("aabbccddeeff", -85, 2.9), // an unknown tag nearby
  ],
  "all-out": [IN("fe7e7d60c53e", -35)],
};

const body = {
  bat: 5.08,
  lat: -33.8688 + (Math.random() - 0.5) * 0.01, // somewhere around Sydney CBD
  lon: 151.2093 + (Math.random() - 0.5) * 0.01,
  acc: 10,
  rsrp: -88,
  lid: 1,
  fw: "sim-1.0",
  tags: scenarios[scenario] || scenarios["some-in"],
};

const res = await fetch(`${baseUrl}/tool-tracker/ingest`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-Device-Key": key },
  body: JSON.stringify(body),
});
console.log(`Sent "${scenario}" report -> HTTP ${res.status}`);
console.log(JSON.stringify(await res.json(), null, 2));
console.log(`(${JSON.stringify(body).length} bytes sent - roughly what Walter will send)`);
