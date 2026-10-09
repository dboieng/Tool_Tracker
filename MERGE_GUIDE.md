# Adding the Tool Tracker to Tradies Diary

These steps are for whoever looks after the tradiesdiary.com code, once the standalone version has been approved. It's about **10 files to copy and 4 small edits**. Nothing that already exists in Tradies Diary is changed, apart from adding a route, a menu item and the new database tables.

**Checked so far:** the Angular feature was compiled inside a copy of `Tradies-Diary-FE-main` (`ng build`) with the route and menu edits below, and it built with no errors. The backend endpoints were tested end to end against a database. It has **not** been run against the live MySQL server or with a real Tradies Diary login.

---

## Backend (`Tradies-Diary-main`)

### 1. Copy these files in (same paths)

```
routes/toolTrackerRoutes.js
controllers/toolTrackerController.js
services/toolTrackerService.js
middlewares/deviceAuth.js
```

**Don't copy** `middlewares/auth.js`, `middlewares/roleAuth.js`, `middlewares/ApiResponse.js`, `app.js` or `server.js`. Those are stand-ins for files Tradies Diary already has, and they use the same export names, so the copied files work with the real ones unchanged.

### 2. `app.js`: add two lines

```js
import toolTrackerRoutes from "./routes/toolTrackerRoutes.js";
...
app.use("/tool-tracker", toolTrackerRoutes);   // next to the other app.use(...) routes
```

### 3. `prisma/schema.prisma`: add the four models

Copy the four `model ToolTracker…` blocks from `backend/prisma/schema.prisma` to the end of the main schema. **Don't copy** the `generator` or `datasource` blocks. The table names already follow the `td_…` convention.

Optionally, to match how other models link to `Organisation`, add relations. The module works without them, because it filters by `organisationId` everywhere.

Then create the tables, following the team's usual process (see `FUTURE_MIGRATION_GUIDE.md`):

```bash
npx prisma migrate dev --name add_tool_tracker     # local
npx prisma migrate deploy                          # production
```

### 4. Create the toolbox device and tags

Either add the tags from the Tool Tracker page ("+ Add tool"), or call the API as an admin:

```
POST /tool-tracker/devices   { "name": "DCB Toolbox" }      -> returns deviceKey ONCE
POST /tool-tracker/tags      { "mac": "ec:5a:5f:39:bd:42", "name": "Tool 1" }
```

Put the returned `deviceKey` into the Walter sketch, along with the production URL `https://<api-host>/tool-tracker/ingest`.

**Note:** if the API runs behind nginx, make sure `/tool-tracker/` is proxied the same way as the other routes.

---

## Frontend (`Tradies-Diary-FE-main`)

### 5. Copy these files in (same paths)

```
src/app/core/services/tool-tracker.ts
src/app/features/tool-tracker/tool-tracker-module.ts
src/app/features/tool-tracker/tool-tracker-routing-module.ts
src/app/features/tool-tracker/tool-tracker/tool-tracker.ts
src/app/features/tool-tracker/tool-tracker/tool-tracker.html
```

They use the existing `ApiService` (base URL from `environment.apiUrl`), `authInterceptor` (adds the login token), `ngx-toastr` and Tailwind. No new npm packages are needed.

### 6. `src/app/features/layout/layout-routing.module.ts`: add a route

Add this to the `routes` array:

```ts
  {
    path: 'tool-tracker',
    component: Layout,
    canActivate: [authGuard],
    data: { roles: [RolesObject.SUPER_ADMIN, RolesObject.ADMIN, RolesObject.OWNER, RolesObject.SUPERVISOR] },
    loadChildren: () => import('../tool-tracker/tool-tracker-module').then((m) => m.ToolTrackerModule),
  },
```

### 7. `src/app/core/constants/menu.ts`: add a sidebar item

Add this after the Dashboard item:

```ts
        {
          icon: 'fas fa-toolbox',
          label: 'Tool Tracker',
          route: '/home/tool-tracker',
          roles: [RolesObject.SUPER_ADMIN, RolesObject.ADMIN, RolesObject.OWNER, RolesObject.SUPERVISOR],
        },
```

The page is then at **`/home/tool-tracker`** for logged-in DCB users.

---

## Who can do what

| Action | Roles |
|---|---|
| View the page and summary (backend) | Any logged-in user of the organisation |
| See it in the menu (frontend) | Super Admin, Admin, Owner, Supervisor (change in steps 6 and 7) |
| Add, rename or remove tools; manage devices | Super Admin, Admin, Supervisor (`isAdminOrSuperAdminOrSupervisor`) |
| Send reports | Walter only, using its device key |

## API reference

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/tool-tracker/ingest` | `X-Device-Key` | Walter sends a report |
| GET | `/tool-tracker/summary` | login | Everything the page needs |
| GET | `/tool-tracker/reports?limit=30` | login | Report history |
| GET | `/tool-tracker/changes?limit=50` | login | RETURNED / LEFT history |
| GET / POST | `/tool-tracker/tags` | login / admin | List or add tools |
| PUT / DELETE | `/tool-tracker/tags/:uuid` | admin | Rename or remove a tool |
| GET / POST | `/tool-tracker/devices` | admin | List or add Walters (POST returns the key once) |
| POST | `/tool-tracker/devices/:uuid/rotate-key` | admin | Issue a new key |
| DELETE | `/tool-tracker/devices/:uuid` | admin | Remove a Walter |

## Later ideas (not built yet)

- Link a tag to an existing `td_tool_info` tool. The `toolInfoId` column is already there for this.
- Email or push an alert when a tool is LEFT for more than X days. `emailService.js` could send it.
- Support several toolboxes on one page. The backend already supports multiple devices, but the page currently shows the first one.
