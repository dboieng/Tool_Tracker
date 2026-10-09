# DCB Tool Tracker

A standalone **Tool Tracker** web page for the Walter toolbox. It is built the same way as Tradies Diary (Express + Prisma backend, Angular frontend), so once your boss approves it, the code can be moved into Tradies Diary with a few copy-paste steps. See **MERGE_GUIDE.md**.

```
Walter ──LTE──► POST /tool-tracker/ingest ──► database ──► Tool Tracker page
```

## What's in this folder

| Folder | What it is |
|---|---|
| `backend/` | A small server you can run on your Ubuntu laptop right now. It has its own simple web page (`backend/public/index.html`) and uses a SQLite file as its database, so no database server is needed. |
| `frontend-angular/` | The same page written as a Tradies Diary Angular feature, ready to drop into the website later. It isn't used by the standalone version. |
| `MERGE_GUIDE.md` | Step-by-step instructions for adding it to tradiesdiary.com. |

## Run it on your laptop (Ubuntu)

You need Node.js 20 or newer. Check with `node -v`. If it's missing or too old:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Then:

```bash
cd Tool_Tracker/backend
cp .env.example .env          # then edit .env and change DASHBOARD_TOKEN to your own password
npm install                   # downloads Express + Prisma (takes about a minute)
npm run db:push               # creates the tooltracker.db database file
npm run setup                 # adds your 8 tags + the "DCB Toolbox" device, and prints the DEVICE KEY
npm start                     # Tool Tracker running on http://localhost:3100
```

Open **http://localhost:3100** and enter the `DASHBOARD_TOKEN` password.

**Copy the device key that `npm run setup` prints.** Walter will send it with every report, and it's only shown once. If you lose it, run `npm run setup -- --new-key`.

## Test without Walter

Open a second terminal and pretend to be Walter:

```bash
cd Tool_Tracker/backend
DEVICE_KEY=paste-your-key-here npm run simulate              # Tools 1-4 in, 5-6 out, plus one unknown tag
DEVICE_KEY=paste-your-key-here npm run simulate -- all-in    # everything back in the box
DEVICE_KEY=paste-your-key-here npm run simulate -- all-out   # everything gone
```

Refresh the page after each one. The **Recent changes** list will show which tools LEFT and RETURNED.

> The first report never shows RETURNED or LEFT. That's on purpose: it sets the starting state, just like the startup fix we planned for the Arduino code.

## What Walter sends (for Lesson 6)

`POST /tool-tracker/ingest` with header `X-Device-Key: <device key>`:

```json
{
  "bat": 5.12, "lat": -33.78, "lon": 151.19, "acc": 10, "rsrp": -88, "lid": 1, "fw": "1.0",
  "tags": [
    { "m": "ec5a5f39bd42", "in": 1, "r": -36, "p": 94, "b": 3.01 },
    { "m": "c980839879d1", "in": 0, "r": -72, "p": 0,  "b": 3.00 }
  ]
}
```

| Key | Meaning |
|---|---|
| `bat` | Walter battery voltage |
| `lat`, `lon`, `acc` | GPS position and accuracy in metres. Leave them out when there's no fix. A `0,0` position or `20000000` accuracy is ignored. |
| `rsrp` | LTE signal in dBm |
| `lid` | 1 if the lid was closed when Walter measured |
| `m` | Tag MAC address. Colons are optional. |
| `in` | 1 if Walter decided the tag is in the box (the -60 dBm / % strong rule) |
| `r`, `p`, `b` | Average RSSI, percentage of strong packets, and tag battery voltage |

Tags Walter didn't hear at all are simply left out, and they count as missing. A report like this is about 400 bytes, so one a day uses roughly 12 KB a month.

## Letting the real Walter reach your laptop

Walter is on the mobile network, so it can't see `localhost`. For testing, open a temporary public address with Cloudflare's free quick tunnel (the Tradies Diary team has used these before):

```bash
# install once
curl -L -o cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
# each time
cloudflared tunnel --url http://localhost:3100
```

It prints an `https://something.trycloudflare.com` address. That's the URL Walter will use in Lesson 6. The address changes every time you restart the tunnel, so it's only for testing. The long-term home is the Tradies Diary server.

## Security notes

- The web page is protected by `DASHBOARD_TOKEN`. Inside Tradies Diary it will use the normal login instead.
- Each Walter has its own device key. Only a scrambled version (a sha256 hash) is stored, the same way passwords are. If a key leaks, run `npm run setup -- --new-key`.
- Never commit `.env` or the device key to git.
