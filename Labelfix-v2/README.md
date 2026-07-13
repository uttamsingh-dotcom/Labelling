# LabelFix - floating label corrector

Tiny separate portal: labellers type rough labels (after watching the video),
and get back SOP/guideline/client-audit compliant labels. The labeller's
hands/actions/order are ground truth - only the wording is fixed.

## Two buttons

- **Quick fix (free, offline)** - instant rule cleanup in the browser: removes
  the/a/an, converts -ing verbs to imperative (holding -> hold), fixes ", and",
  normalises hand phrasing, then flags anything still breaking limits. Zero
  cost, unlimited, fully private, no passcode needed.
- **AI fix (rewrite)** - full rewrite of rough shorthand into SOP grammar via
  Gemini (free) or Claude (paise). Needs the team passcode.

## Deploy (10 min)

1. Add this `labelfix` folder to your GitHub repo at the ROOT (next to
   `webplatform`), keeping the structure.
2. Netlify -> Add new project -> Import from GitHub -> same repo.
   - Base directory: `labelfix`
3. Environment variables (Site configuration -> Environment variables):

   | Key                 | Value                                                    |
   |---------------------|-----------------------------------------------------------|
   | `TEAM_PASSCODE`     | any passcode you share with your labellers (AI fix only)  |
   | `GEMINI_API_KEY`    | free key from aistudio.google.com -> AI fix runs FREE      |
   | `ANTHROPIC_API_KEY` | optional instead of Gemini -> AI fix via Claude (~paise)   |
   | `GEMINI_MODEL`      | optional, default `gemini-2.5-flash`                       |
   | `CLAUDE_MODEL`      | optional, default `claude-sonnet-5`                        |

   Engine choice: if GEMINI_API_KEY is set, AI fix uses Gemini free tier
   (note: Google may use free-tier text to improve their models). Otherwise
   Claude (paid per use, no training on your data). Set only one.

4. Deploy. Labellers can use Quick fix immediately; AI fix asks the passcode once.

## Make it a floating bubble on Windows

1. Open the site in Chrome or Edge.
2. Menu (three dots) -> Cast, save and share -> **Install page as app**
   (Edge: Apps -> Install this site as an app).
3. It opens as its own small window - resize to a narrow panel.
4. For true always-on-top: install Microsoft **PowerToys** (free), select the
   LabelFix window and press **Win+Ctrl+T** to pin it above other windows.

## Rules of use

- Do NOT let the bubble read or automate the client platform - manual
  type/paste only.
- Corrected labels are only as true as what the labeller typed: hands, actions
  and order come from the human. The tool fixes grammar, forbidden words, hand
  phrasing, separators, word limits and object-name consistency, and flags
  suspicious content (one-hand labels, double holds).
