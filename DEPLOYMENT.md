# Deploying the Invoice Review Portal

## Architecture

As of 2026-08-10 this is a **Vercel-only** deploy: Next.js web app + AgentStudio
extraction both run inside the same Vercel project, no separate always-on
worker host needed.

That wasn't true until this refactor. Previously, extraction ran in
`worker/index.ts` — an always-on process that polled Postgres in an infinite
loop and could hold an AgentStudio OCR call open for up to ~180s+, which
didn't fit a traditional short-lived serverless function. That pushed the
app to a four-service split (Vercel + a separate Railway worker + Neon +
Vercel Blob). Two things changed that:

1. **Vercel's Fluid Compute now defaults to a 300s function duration on
   every plan, including the free Hobby tier.** This app's own extraction
   ceiling (`EXTRACTION_WALL_CLOCK_CEILING_MS` in
   `src/server/extractionRunner.ts`) is 205s — comfortably inside that.
2. **Next.js's `after()` API** lets a route handler respond to the browser
   immediately while continuing to run code in the background of that same
   request, for up to the function's max duration. `POST /api/documents`
   (`src/app/api/documents/route.ts`) uses this: it creates the
   `Document`/`ExtractionJob` rows, returns `201` right away, then runs the
   full AgentStudio submit-and-poll sequence (`runExtractionJob` in
   `src/server/extractionRunner.ts`) in an `after()` callback. `maxDuration`
   is set to `220` on that route (above the 205s ceiling, under Vercel's
   300s default) to guarantee the platform doesn't cut it off early.

So the always-on worker, and the separate host it needed, are both gone.

| Piece | Host | Why |
|---|---|---|
| Next.js web app + AgentStudio extraction (upload UI, review UI, API routes, background extraction via `after()`) | **Vercel** | Everything now fits inside Vercel's request/response + `after()` model — see above. |
| Postgres | **Neon** (or Vercel's own Postgres integration, which is Neon-backed and provisioned from the Vercel dashboard — see step 1) | Vercel doesn't host a database itself; something reachable over the network is still required. |
| Uploaded file bytes | **Vercel Blob** | Still needed even with a single service: a serverless function instance doesn't share a persistent local disk across invocations, so `STORAGE_DRIVER=local` isn't safe on Vercel — the instance that writes the upload isn't guaranteed to be the same one whose `after()` continuation reads it back, or that later serves it via `/api/documents/[id]/file`. Code already supports this via the `StorageAdapter` interface (`src/lib/storage/`). |

**Trade-off worth knowing:** the old design had an always-on poller that
could notice and retry a job stuck mid-extraction (e.g. after a crash). This
design doesn't — if the specific serverless invocation running a job's
`after()` continuation is killed (a Vercel deploy landing mid-extraction, a
rare platform hiccup), nothing automatically retries it; the job just stays
`PROCESSING` in Postgres. For a low-volume, single-reviewer portal this is
an acceptable trade for dropping an entire service, but if it matters to
you, a Vercel Cron route that sweeps jobs stuck in `PROCESSING` past some
age back to `FAILED`/`PENDING` would be a cheap addition (not built here —
see "Not built here" below).

Nothing below can be done by me — creating accounts, connecting billing,
and pasting credentials into web dashboards all require you directly (see
this assistant's standing safety rules: no account creation, no entering
credentials on your behalf). This doc is the checklist for what to do and
in what order.

## 0. Prerequisites

- You already have a Vercel account.
- Create a **Neon** account/project: https://console.neon.tech — or, to
  avoid a separate account entirely, provision Postgres straight from the
  Vercel dashboard instead (Vercel project → **Storage** → **Postgres**,
  which is Neon under the hood but never leaves vercel.com). Either path
  produces the same kind of connection string used in step 1 below.
- Push this repo to a git provider (GitHub/GitLab) — Vercel deploys from a
  git remote. Locally the repo is git-initialized with one commit (`main`)
  but has **no remote configured yet**. Create an empty repo on GitHub and
  run:
  ```
  git remote add origin <your-repo-url>
  git push -u origin main
  ```

## 1. Postgres (Neon, standalone or via Vercel)

1. Create the project (Neon dashboard, or Vercel → Storage → Postgres).
2. Copy the connection string. It will look like:
   ```
   postgresql://user:password@ep-xxxx-xxxx.region.aws.neon.tech/dbname?sslmode=require
   ```
   This works with this app's Prisma setup as-is — `pg` (via
   `@prisma/adapter-pg`) uses `pg-connection-string`, which already parses
   `sslmode=require` from the URL and enables TLS automatically. No code
   changes needed. If you provisioned via Vercel → Storage, this variable
   is auto-injected into your Vercel project already — you can skip pasting
   it in step 3.
3. Run migrations and seed the catalog **once**, from your local machine,
   pointed at this database:
   ```
   DATABASE_URL="<connection-string>" npx prisma migrate deploy
   DATABASE_URL="<connection-string>" npx tsx prisma/seed.ts
   ```
   (`migrate deploy` applies existing migrations without generating new
   ones — the right command for a target DB that isn't your dev DB.)

## 2. Vercel Blob (file storage)

1. In the Vercel dashboard, open (or create) the project for this repo →
   **Storage** tab → create a **Blob** store → connect it to the project.
   Connecting it auto-injects `BLOB_READ_WRITE_TOKEN` into the Vercel
   project's env vars — you don't need to copy it anywhere yourself; there's
   no second host to propagate it to anymore.

## 3. Vercel (web app + extraction)

1. Import the git repo as a new Vercel project (or connect it if you
   already created the project in step 2).
2. Framework preset: Next.js (auto-detected). Build command / output are
   already correct via `package.json`'s `build`/`start` scripts — no
   override needed.
3. Set these environment variables in the Vercel project (Settings →
   Environment Variables), for the Production environment:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | the connection string from step 1 (skip if auto-injected via Vercel Postgres) |
   | `AGENTSTUDIO_CLIENT_MODE` | `live` |
   | `AGENTSTUDIO_REST_BASE_URL` | `https://agents.dyna.ai` |
   | `AGENTSTUDIO_FLOW_UUID` | your flow's UUID |
   | `AGENTSTUDIO_APICALL_ROBOT_KEY` | from your AgentStudio "API Call" publish platform |
   | `AGENTSTUDIO_APICALL_ROBOT_TOKEN` | same |
   | `AGENTSTUDIO_APICALL_TENANT_NAME` | same |
   | `AGENTSTUDIO_APICALL_USERNAME` | same |
   | `STORAGE_DRIVER` | `vercel-blob` |
   | `BLOB_READ_WRITE_TOKEN` | auto-injected by step 2, leave as-is |

   `.env.example` in the repo root lists the same variables with
   descriptions if you need a reference.
4. Deploy. Vercel will build and serve the web app (upload UI, review UI,
   `/api/*` routes, `/api/documents/[id]/file` streaming from Blob) **and**
   run AgentStudio extraction in the background of each upload request via
   `after()` — no second deploy, no second project, nothing else to wire up.

## 4. Verify end to end

1. Open the deployed Vercel URL → Upload page → upload a test invoice
   (`test-invoices/` in the repo has sample PDFs/images).
2. Watch the job go `PENDING → SUBMITTING → PROCESSING → SUCCEEDED` on the
   status page — this confirms the `after()` continuation is running the
   AgentStudio submit-and-poll sequence and writing status updates back to
   Postgres.
3. Open the review page, confirm the document renders (proves
   `/api/documents/[id]/file` is correctly reading from Vercel Blob) and
   fields/confidence/highlighting show up.
4. Export to Excel, confirm the file downloads and reflects any edits.

## Not built here (optional hardening)

- **Stuck-job sweeper.** See the trade-off note in Architecture above — a
  Vercel Cron route that finds jobs stuck in `PROCESSING` past, say, 10
  minutes and marks them `FAILED` (so they at least surface as failed
  rather than hanging forever) would close that gap. Ask if you want this
  added; it's a small addition (one new route + a `vercel.json` cron entry).
  Note Vercel Cron only fires once/day on the free Hobby plan, so it'd be a
  coarse safety net rather than fast recovery, unless you're on Pro (cron
  down to once/minute).

## Notes / things intentionally not automated here

- I didn't run any of the account-creation, dashboard-clicking, or
  credential-pasting steps above — per this assistant's standing rules,
  those require you directly.
- Neither the `vercel` nor `gh` CLI is installed on this machine, so the
  above is written for the web dashboards. If you install and log into
  those CLIs yourself, `vercel --prod` and `gh repo create` can replace
  the equivalent dashboard steps, but I won't run `vercel login` /
  `gh auth login` for you (that's an account-authentication step you need
  to do).
- `docker-compose.yml` / plain `Dockerfile` on a single Docker host (or
  bare `npm run dev` / `npm start` on one machine) remain a valid,
  simpler alternative if you'd rather self-host instead of using Vercel at
  all — `after()` works the same way on a self-hosted Node.js server, per
  Next.js's own docs, no Vercel-specific plumbing required. Documented in
  `docker-compose.yml`'s own header comment.
