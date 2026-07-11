// POST /api/aidraft-background  {id, hint, duration, sheets:[base64 jpeg,...]}
// Netlify background function (15-min limit): returns 202 immediately, then
// calls Claude with the frames + guidelines + client-audit lessons + the most
// similar QA-approved examples, and writes the draft into the task row.
// The browser polls /api/draft?id=N for the result.
import { db, auth, json, deny, bad, GUIDELINES } from "./_lib.mjs";

const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5";

export async function handler(event) {
  const me = auth(event);
  if (!me) return deny("Login required");
  if (event.httpMethod !== "POST") return bad("POST only");
  let b;
  try { b = JSON.parse(event.body || "{}"); } catch { return bad(); }
  const id = +b.id;
  const sheets = Array.isArray(b.sheets) ? b.sheets : [];
  const duration = +b.duration || 0;
  if (!id || !sheets.length || !duration) return bad("id, duration, sheets required");

  const rows = await db(`tl_tasks?id=eq.${id}&select=id,owner,title,status`);
  const t = rows[0];
  if (!t) return bad("No such task");
  if (me.role !== "admin" && t.owner !== me.uid) return deny();

  await db(`tl_tasks?id=eq.${id}`, { method: "PATCH",
    body: { draft_status: "working", draft: null } });

  try {
    const segs = await draftWithClaude(t, duration, b.hint || "", sheets);
    await db(`tl_tasks?id=eq.${id}`, { method: "PATCH",
      body: { draft_status: "done", draft: { segments: segs } } });
  } catch (e) {
    await db(`tl_tasks?id=eq.${id}`, { method: "PATCH",
      body: { draft_status: "error", draft: { error: String(e.message || e).slice(0, 400) } } });
  }
  return json(200, { ok: true });
}

async function draftWithClaude(task, duration, hint, sheets) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not configured on the server.");

  // learning loop: most similar approved tasks as few-shot examples
  const approved = await db(
    "tl_tasks?status=eq.approved&select=title,segments&order=updated_at.desc&limit=30");
  const words = new Set((hint + " " + task.title).toLowerCase().match(/[a-z]+/g) || []);
  const score = (r) => {
    const tw = (r.title || "").toLowerCase().match(/[a-z]+/g) || [];
    let n = 0;
    for (const w of words)
      if (tw.some((t2) => w.length >= 4 && t2.length >= 4 &&
        (w.startsWith(t2) || t2.startsWith(w)))) n++;
    return n;
  };
  const examples = approved.sort((a, c) => score(c) - score(a)).slice(0, 2)
    .filter((r) => (r.segments || []).length)
    .map((r) => `\nQA-APPROVED EXAMPLE from '${r.title}':\n` + JSON.stringify({
      segments: r.segments.slice(0, 12).map((s) => ({
        start: s.start, end: s.end, label: s.label })) }));

  let ctx = `The video is EXACTLY ${duration.toFixed(1)} seconds long. ` +
    `Cover 0.0 to ${duration.toFixed(1)} contiguously - your last segment must ` +
    `end at ${duration.toFixed(1)}.`;
  if (hint) ctx += `\nANNOTATOR CONTEXT (trust for objects/activity): ${hint}. ` +
    `Use these exact object names.`;
  if (examples.length) ctx += "\nMatch the style of these human-verified examples:" +
    examples.join("\n");

  const content = [{ type: "text", text: GUIDELINES + "\n\n" + ctx }];
  for (const s of sheets)
    content.push({ type: "image", source: {
      type: "base64", media_type: "image/jpeg", data: s } });

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL, max_tokens: 8000,
      messages: [{ role: "user", content }],
    }),
  });
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 300);
    throw new Error(`Claude API error ${r.status}: ${detail}`);
  }
  const data = await r.json();
  let text = (data.content || []).map((p) => p.text || "").join("");
  text = text.replace(/^```(json)?|```$/gm, "").trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  let parsed;
  try {
    parsed = JSON.parse(text.slice(s, e + 1));
  } catch {
    const objs = text.match(/\{[^{}]*"label"[^{}]*\}/g) || [];
    const segs = [];
    for (const o of objs) { try { segs.push(JSON.parse(o)); } catch {} }
    if (!segs.length) throw new Error("Claude reply could not be parsed - try again.");
    parsed = { segments: segs };
  }
  // enforce the 10 s rule server-side
  const out = [];
  for (const seg of parsed.segments || []) {
    let a = +seg.start, bb = +seg.end;
    if (isNaN(a) || isNaN(bb) || bb <= a) continue;
    while (bb - a > 10) {
      out.push({ ...seg, start: +a.toFixed(1), end: +(a + 10).toFixed(1) });
      a += 10;
    }
    out.push({ ...seg, start: +a.toFixed(1), end: +bb.toFixed(1) });
  }
  return out;
}
