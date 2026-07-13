// POST /api/fix {passcode, lines:[".."], objects:"", }
// Rewrites rough labels into SOP-compliant labels. Text-only Claude call.
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

const RULES = `You are an expert label editor for egocentric video annotation.
You will receive ROUGH labels typed by a human annotator who watched the video.
The annotator's stated HANDS, ACTIONS, ACTION ORDER and OBJECTS are ground
truth - NEVER change them. Your only job is to rewrite each line into a label
that follows every rule below. If a rough line is ambiguous about which hand,
keep it ambiguous-free by preserving exactly what was stated; do not guess.

LABEL RULES:
- Imperative form. Under 20 words. 1-3 atomic actions, max 2 separators.
- Always state the hand for every action: with left hand / with right hand /
  with both hands, or 'with <tool> in right hand'.
- Comma separates a LEFT-hand action from a RIGHT-hand action.
- 'and' joins ONLY actions done by the same hand. Never use ", and".
- FORBIDDEN words: the, a, an, it, them, they, any -ing verb form, adjust,
  manipulate, move, transfer, reach, inspect, check, examine, handover, give,
  tool, object, utensil, cutlery, silverware.
- Object leaves a surface = 'pick up'; set down = 'place'.
- Tool phrasing: '<action> <object> with <tool> in <hand>'.
- Object names: use exactly the names the annotator used (or the provided
  object list); no added colour/material/size descriptors unless the annotator
  wrote them; keep one consistent name per object across all lines.
- Actions in the order the annotator stated them.
- If a line contains MORE than 3 atomic actions, split it into two labels and
  return both (mark them 1/2 and 2/2 in the split field).

CLIENT AUDIT LESSONS:
- If one hand anchors while the other works, both must be stated. If the rough
  line mentions only one hand, keep one hand but add flag "one-hand".
- Never write 'hold X' when that hand is actively doing something else the
  annotator described - name the real action.
- Keep micro-actions the annotator wrote: shift, pass, pick up, place, pour,
  scoop, flip, turn, wipe.

Return ONLY JSON:
{"fixes":[{"i":0,"fixed":"...","split":"", "flags":["one-hand"?]}]}
One entry per input line, same order, index i.`;

export async function handler(event) {
  if (event.httpMethod !== "POST")
    return resp(400, { error: "POST only" });
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return resp(400, { error: "bad json" }); }
  const pass = process.env.TEAM_PASSCODE || "";
  if (!pass || b.passcode !== pass)
    return resp(401, { error: "Wrong passcode" });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return resp(500, { error: "ANTHROPIC_API_KEY not configured" });

  const lines = (Array.isArray(b.lines) ? b.lines : [])
    .map((s) => String(s).trim()).filter(Boolean).slice(0, 40);
  if (!lines.length) return resp(400, { error: "No labels provided" });

  let ctx = "";
  if (b.objects) ctx += `\nObject list from annotator (use these exact names): ${
    String(b.objects).slice(0, 300)}`;
  ctx += "\nROUGH LABELS (one per line, index: text):\n" +
    lines.map((s, i) => `${i}: ${s}`).join("\n");

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key,
      "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: 2500,
      messages: [{ role: "user", content: RULES + "\n" + ctx }] }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200);
    return resp(502, { error: `Claude API error ${r.status}: ${t}` });
  }
  const data = await r.json();
  let text = (data.content || []).map((p) => p.text || "").join("");
  text = text.replace(/```(json)?/g, "");
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  let fixes = [];
  try { fixes = JSON.parse(text.slice(s, e + 1)).fixes || []; }
  catch { return resp(502, { error: "Could not parse Claude reply - try again" }); }
  const u = data.usage || {};
  const usd = (u.input_tokens || 0) / 1e6 * 3 + (u.output_tokens || 0) / 1e6 * 15;
  return resp(200, { fixes, costInr: +(usd * 90).toFixed(2) });
}

const resp = (statusCode, obj) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});
