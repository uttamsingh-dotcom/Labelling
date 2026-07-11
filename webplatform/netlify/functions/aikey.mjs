// GET /api/aikey?hint=... -> {key, model, examples}
// Gives a LOGGED-IN user the Claude credentials + the most similar
// QA-approved examples so the browser can call Claude directly.
// Note: any authenticated labeller can technically read the key - acceptable
// for a small trusted team with prepaid credits as the spending cap.
import { db, auth, json, deny } from "./_lib.mjs";

export async function handler(event) {
  const me = auth(event);
  if (!me) return deny("Login required");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json(500, { error: "ANTHROPIC_API_KEY is not configured on the server" });

  const hint = (event.queryStringParameters?.hint || "").toLowerCase();
  let examples = [];
  try {
    const approved = await db(
      "tl_tasks?status=eq.approved&select=title,segments&order=updated_at.desc&limit=30");
    const words = new Set(hint.match(/[a-z]+/g) || []);
    const score = (r) => {
      const tw = (r.title || "").toLowerCase().match(/[a-z]+/g) || [];
      let n = 0;
      for (const w of words)
        if (tw.some((t) => w.length >= 4 && t.length >= 4 &&
          (w.startsWith(t) || t.startsWith(w)))) n++;
      return n;
    };
    examples = approved.sort((a, b) => score(b) - score(a)).slice(0, 2)
      .filter((r) => (r.segments || []).length)
      .map((r) => ({
        title: r.title,
        segments: r.segments.slice(0, 12).map((s) => ({
          start: s.start, end: s.end, label: s.label })),
      }));
  } catch { /* examples are optional */ }

  return json(200, {
    key,
    model: process.env.CLAUDE_MODEL || "claude-sonnet-5",
    examples,
  });
}
