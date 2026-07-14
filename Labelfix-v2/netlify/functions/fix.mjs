// POST /api/fix {passcode, lines:[".."], objects:""}
// Rewrites rough labels into SOP-compliant labels.
// Engine: Gemini free tier when GEMINI_API_KEY is set, otherwise Claude.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

const RULES = `You are an expert label editor for egocentric video annotation.
You will receive ROUGH labels typed by a human annotator who watched the video.
The annotator's stated HANDS, ACTIONS, ACTION ORDER and OBJECTS are ground
truth - NEVER change them. Your only job is to rewrite each line into a label
that follows every rule below. If a rough line does not state a hand, do NOT
invent one - keep the action and add flag "one-hand".

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
  put the second label in the split field.

VERB CORRECTION (important): keep WHAT physically happened exactly as the
annotator described, but NAME it with the precise SOP verb that fits the
object and activity:
- clean/rub with cloth -> wipe;  clean with brush -> scrub
- move/relocate on a surface -> shift;  put/set/drop down -> place
- grab/take/lift off a surface -> pick up;  hand to other hand -> pass
- turn over -> flip;  turn around -> rotate or turn
Never invent an action that was not described; never delete one; only choose
the correct verb for it.

CLIENT AUDIT LESSONS:
- Never write 'hold X' when that hand is actively doing something else the
  annotator described - name the real action.
- Keep micro-actions the annotator wrote: shift, pass, pick up, place, pour,
  scoop, flip, turn, wipe.

FINAL CHECK before returning: scan every output label once more - zero
forbidden words, zero -ing verb forms, correct SOP verbs, hands untouched.

Return ONLY JSON:
{"fixes":[{"i":0,"fixed":"...","split":"","flags":[]}]}
One entry per input line, same order, index i.`;

export async function handler(event) {
  if (event.httpMethod !== "POST") return resp(400, { error: "POST only" });
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return resp(400, { error: "bad json" }); }
  const pass = process.env.TEAM_PASSCODE || "";
  if (!pass || b.passcode !== pass) return resp(401, { error: "Wrong passcode" });

  const gKey = process.env.GEMINI_API_KEY || "";
  const cKey = process.env.ANTHROPIC_API_KEY || "";
  if (!gKey && !cKey)
    return resp(500, { error: "No AI key configured (GEMINI_API_KEY or ANTHROPIC_API_KEY)" });

  const lines = (Array.isArray(b.lines) ? b.lines : [])
    .map((s) => String(s).trim()).filter(Boolean).slice(0, 40);
  if (!lines.length) return resp(400, { error: "No labels provided" });

  let ctx = "";
  if (b.objects) ctx += `\nObject list from annotator (use these exact names): ${
    String(b.objects).slice(0, 300)}`;
  ctx += "\nROUGH LABELS (one per line, index: text):\n" +
    lines.map((s, i) => `${i}: ${s}`).join("\n");
  const prompt = RULES + "\n" + ctx;

  try {
    const ask = (p) => gKey ? askGemini(gKey, p) : askClaude(cKey, p);
    const out = await ask(prompt);
    out.fixes = (out.fixes || []).map((f) => ({ ...f,
      fixed: postClean(f.fixed), split: f.split ? postClean(f.split) : "" }));
    // if any output STILL contains a forbidden word, one automatic repair pass
    const bad = out.fixes.filter((f) => violations(f.fixed).length ||
      (f.split && violations(f.split).length));
    if (bad.length) {
      const rep = await ask(RULES +
        "\nThese outputs still violate the rules. Rewrite ONLY these, same " +
        "index i, removing every violation listed, changing nothing else:\n" +
        bad.map((f) => `${f.i}: "${f.fixed}" (violations: ${
          violations(f.fixed).join(", ")})`).join("\n"));
      for (const r2 of (rep.fixes || [])) {
        const t = out.fixes.find((f) => f.i === r2.i);
        if (t && r2.fixed) t.fixed = postClean(r2.fixed);
      }
      if (rep.costInr) out.costInr = +((out.costInr || 0) + rep.costInr).toFixed(2);
    }
    return resp(200, out);
  } catch (e) {
    return resp(502, { error: String(e.message || e).slice(0, 300) });
  }
}

// ---------- mechanical output enforcement ----------
const BAD_WORDS = ["the","a","an","it","them","they","adjust","adjusts",
"move","moves","manipulate","manipulates","transfer","transfers","handover","give","gives",
"reach","reaches","inspect","inspects","check","checks","examine","examines",
"tool","tools","object","objects","utensil","utensils","cutlery","silverware"];
const ING_OK = ["string","ring","spring","wing","thing","earring","icing",
"ceiling","during"];
const ING_MAP = {holding:"hold",wiping:"wipe",picking:"pick",placing:"place",
putting:"put",cutting:"cut",rotating:"rotate",folding:"fold",plucking:"pluck",
pouring:"pour",stirring:"stir",scooping:"scoop",passing:"pass",shifting:"shift",
flipping:"flip",turning:"turn",arranging:"arrange",packing:"pack",
pressing:"press",opening:"open",closing:"close",cleaning:"clean",
scrubbing:"scrub",wrapping:"wrap",attaching:"attach",spreading:"spread",
dipping:"dip",sweeping:"sweep",ironing:"iron",smoothing:"smooth",
squeezing:"squeeze",grabbing:"grab",lifting:"lift",dropping:"drop",
tearing:"tear",pushing:"push",pulling:"pull",twisting:"twist",peeling:"peel",
slicing:"slice",washing:"wash",rinsing:"rinse",drying:"dry",loading:"load",
removing:"remove",inserting:"insert",releasing:"release",tapping:"tap",
rolling:"roll",sealing:"seal",filling:"fill",stacking:"stack",sorting:"sort",
aligning:"align",repositioning:"reposition",straightening:"straighten",
moving:"shift"};
function postClean(s) {
  let t = " " + String(s || "").trim() + " ";
  t = t.toLowerCase().replace(/&/g, " and ").replace(/\s+/g, " ");
  t = t.replace(/\b(the|a|an)\b/g, " ");
  t = t.split(" ").map((w) => {
    const bare = w.replace(/[^a-z]/g, "");
    if (ING_MAP[bare]) return w.replace(bare, ING_MAP[bare]);
    return w;
  }).join(" ");
  t = t.replace(/\s+,/g, ",").replace(/\s+/g, " ").trim();
  return t.replace(/,\s*$/, "").replace(/^\s*,/, "");
}
function violations(s) {
  const out = [];
  const words = String(s || "").toLowerCase().replace(/,/g, " ")
    .split(/\s+/).filter(Boolean);
  for (const w of words) {
    if (BAD_WORDS.includes(w)) out.push(w);
    else if (w.endsWith("ing") && !ING_OK.includes(w) && !ING_MAP[w]) out.push(w);
  }
  return [...new Set(out)];
}

async function askGemini(key, prompt) {
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { response_mime_type: "application/json",
          maxOutputTokens: 2500,
          thinkingConfig: { thinkingBudget: 0 } },
      }) });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200);
    if (r.status === 429) throw new Error(
      "Gemini free-tier limit reached for today - try later or switch engine.");
    throw new Error(`Gemini API error ${r.status}: ${t}`);
  }
  const data = await r.json();
  const text = ((data.candidates || [])[0]?.content?.parts || [])
    .map((p) => p.text || "").join("");
  return { fixes: parseFixes(text), engine: "gemini (free)", costInr: 0 };
}

async function askClaude(key, prompt) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": key,
      "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: 2500,
      messages: [{ role: "user", content: prompt }] }),
  });
  if (!r.ok) {
    const t = (await r.text()).slice(0, 200);
    throw new Error(`Claude API error ${r.status}: ${t}`);
  }
  const data = await r.json();
  const text = (data.content || []).map((p) => p.text || "").join("");
  const u = data.usage || {};
  const usd = (u.input_tokens || 0) / 1e6 * 3 + (u.output_tokens || 0) / 1e6 * 15;
  return { fixes: parseFixes(text), engine: "claude",
    costInr: +(usd * 90).toFixed(2) };
}

function parseFixes(text) {
  text = (text || "").replace(/```(json)?/g, "");
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  try { return JSON.parse(text.slice(s, e + 1)).fixes || []; }
  catch {
    const m = text.match(/\{[^{}]*"fixed"[^{}]*\}/g) || [];
    const arr = [];
    for (const o of m) { try { arr.push(JSON.parse(o)); } catch {} }
    if (!arr.length) throw new Error("Could not parse AI reply - try again");
    return arr;
  }
}

const resp = (statusCode, obj) => ({
  statusCode,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
});
