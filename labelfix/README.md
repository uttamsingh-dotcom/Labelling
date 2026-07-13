# LabelFix - floating label corrector

Tiny separate portal: labellers type rough labels (after watching the video),
Claude rewrites them into SOP/guideline/client-audit compliant labels.
The labeller's hands/actions/order are treated as ground truth - only the
wording is fixed. Cost: ~Rs 0.5-2 per batch of labels (text-only).

## Deploy (10 min)

1. Add this `labelfix` folder to your GitHub repo (upload the folder like you
   did with `webplatform`, keeping the structure).
2. Netlify -> Add new project -> Import from GitHub -> same repo.
   - Base directory: `labelfix`
3. Environment variables (Site configuration -> Environment variables):

   | Key                 | Value                                     |
   |---------------------|-------------------------------------------|
   | `ANTHROPIC_API_KEY` | your Claude key                            |
   | `TEAM_PASSCODE`     | any passcode you share with your labellers |
   | `CLAUDE_MODEL`      | optional, default `claude-sonnet-5`        |

4. Deploy. Open the site, enter the passcode once (it is remembered).

## Make it a floating bubble on Windows

1. Open the site in Chrome or Edge.
2. Menu (three dots) -> Cast, save and share -> **Install page as app**
   (Edge: Apps -> Install this site as an app).
3. It opens as its own small window - resize it to a narrow panel.
4. Optional, for true always-on-top: install Microsoft **PowerToys** (free,
   from the Microsoft Store), select the LabelFix window and press
   **Win+Ctrl+T** to pin it above every other window.

Labellers keep it pinned beside the client platform, type rough labels while
watching, click Fix, copy the corrected label out.

## Rules of use

- Do NOT let the bubble read or automate the client platform - it is a
  manual type/paste helper only.
- The corrected label is only as true as what the labeller typed: hands,
  actions and order come from the human. The tool fixes grammar, forbidden
  words, hand phrasing, separators, word limits and object-name consistency,
  and flags suspicious content (one-hand labels, double holds).
