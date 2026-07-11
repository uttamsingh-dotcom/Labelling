# LabelDesk - Web Platform Deploy Guide

A video-labelling platform where **videos never leave the labeller's computer**.
Labellers download videos from the client platform themselves, load them locally
in the browser, and only the labels are stored. AI drafts via Claude.

Stack: Netlify (hosting + functions, free) + Supabase (database, free) + Claude API.

## One-time setup (~20 minutes)

### Step 1 - Supabase (the database)

1. Go to https://supabase.com -> Start your project -> sign in with GitHub/Google.
2. New project -> name it `labeldesk`, pick a strong database password
   (you won't need it again), region `Mumbai` or nearest. Wait ~2 min.
3. Left sidebar -> **SQL Editor** -> New query -> paste the whole content of
   `supabase_setup.sql` -> Run. You should see "Success".
4. Left sidebar -> **Project Settings -> API**. Copy two values:
   - **Project URL**            (like `https://abcd1234.supabase.co`)
   - **service_role key**       (under "Project API keys" - the SECRET one,
     not `anon`). Keep it private.

### Step 2 - Netlify (the website)

1. Go to https://app.netlify.com -> sign up (free).
2. Easiest deploy: **drag & drop will NOT work here** (functions need a build),
   so use Netlify CLI or GitHub:

   **Option A - GitHub (recommended, enables easy updates):**
   - Put this `webplatform` folder in a GitHub repository (github.com -> New
     repository -> upload the files, keeping the folder structure).
   - Netlify -> Add new site -> Import an existing project -> pick the repo.
   - Build settings are read automatically from `netlify.toml`. Deploy.

   **Option B - Netlify CLI (no GitHub):**
   - Install Node.js from nodejs.org, then in a terminal:
     `npm install -g netlify-cli`
     `cd path\to\webplatform`
     `netlify login`
     `netlify deploy --prod`
   - When asked: publish directory = `public`, functions = `netlify/functions`.

3. Site settings -> **Environment variables** -> add these four:

   | Key                    | Value                                          |
   |------------------------|------------------------------------------------|
   | `SUPABASE_URL`         | your Project URL from Step 1                   |
   | `SUPABASE_SERVICE_KEY` | your service_role key from Step 1              |
   | `AUTH_SECRET`          | any long random text (40+ chars, keep private) |
   | `ANTHROPIC_API_KEY`    | your Claude key (sk-ant-...)                   |

   Optional: `CLAUDE_MODEL` (default `claude-sonnet-5`).

4. Deploys -> **Trigger deploy** (so functions pick up the variables).

### Step 3 - First login

1. Open your site URL (like `https://labeldesk.netlify.app`).
2. Sign in as username **admin** with a NEW password of 8+ characters.
   The first login creates the admin account with that password - remember it.
3. Dashboard -> **Add labeller** -> create accounts for your team and share
   the credentials. Labellers log in at the same URL.

## How the team works

- **Labeller**: downloads their assigned video from the client platform ->
  logs in -> "+ New task" -> selects the downloaded file (stays local, never
  uploaded) -> labels with the editor (or clicks **AI draft** for a Claude
  starting point) -> **Submit for QA**.
- **Admin (you)**: Dashboard shows every task, per-labeller approval rates in
  red/amber/green zones, and manual grade tags. Open a submitted task, load
  your own copy of the same video (the app warns if it's the wrong file),
  verify, **Approve** or **Send back for rework**. Export **CSV** per task.
- **AI draft** sends only sampled frames (not the video) to Claude, using the
  Atlas guidelines + client audit lessons + your QA-approved examples, which
  improve the drafts as the approved library grows.

## Costs

- Netlify free tier: fine for this usage.
- Supabase free tier: labels are tiny; you will not outgrow it.
- Claude API: ~Rs 8-12 per AI draft, only when the button is clicked.
  Prepaid credits in console.anthropic.com act as a hard spending cap.

## Notes

- Videos are never stored on the platform - if a task must be re-checked
  later, the video is re-downloaded from the client platform.
- The AUTH_SECRET signs login sessions: changing it logs everyone out.
- To update the site later: push changes to GitHub (Option A) or run
  `netlify deploy --prod` again (Option B).
