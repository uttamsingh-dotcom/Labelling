// Shared helpers for all LabelDesk functions. Zero npm dependencies.
import crypto from "node:crypto";

const SB_URL = process.env.SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const SECRET = process.env.AUTH_SECRET || "change-me";

// ---------------- Supabase PostgREST helpers ----------------
export async function db(path, { method = "GET", body, headers = {} } = {}) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "" : "return=representation",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`db ${method} ${path}: ${r.status} ${t.slice(0, 200)}`);
  }
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ---------------- password hashing ----------------
export function hashPw(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}
export function newSalt() {
  return crypto.randomBytes(8).toString("hex");
}

// ---------------- signed auth tokens ----------------
export function signToken(payload, days = 14) {
  const body = Buffer.from(JSON.stringify({
    ...payload, exp: Date.now() + days * 86400e3,
  })).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
export function verifyToken(token) {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
  const p = JSON.parse(Buffer.from(body, "base64url").toString());
  if (!p.exp || p.exp < Date.now()) return null;
  return p; // {uid, role, username}
}
export function auth(event, role = null) {
  const h = event.headers.authorization || event.headers.Authorization || "";
  const p = verifyToken(h.replace(/^Bearer\s+/i, ""));
  if (!p) return null;
  if (role && p.role !== role) return null;
  return p;
}

// ---------------- responses ----------------
export const json = (status, data) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
export const deny = (msg = "Not allowed") => json(403, { error: msg });
export const bad = (msg = "Bad request") => json(400, { error: msg });

// ---------------- labelling prompt (guidelines + client audit) ----------------
export const GUIDELINES = `You are an expert egocentric-video action annotator. You receive contact
sheets of video frames sampled at 2 fps; each frame shows its timestamp. Segment
the video and label the ego person's hand-object interactions, in the exact
chronological order actions occur.

SEGMENT RULES - all mandatory:
- Every segment MUST be 10.0 seconds or SHORTER. Split long activities.
- Cover the whole timeline contiguously from 0.0 to the end. Do NOT stop early.
- A segment starts when hands engage an object or the goal changes; it ends when
  hands disengage or the goal changes.
- Label "no action" ONLY when hands touch nothing for MORE than 5 continuous
  seconds (rare). Shorter idle moments are absorbed into neighbouring segments.
- If a short action cycle repeats 5+ times, one label may cover up to 10 s.
- NEVER return one giant segment or identical uniform blocks. Activities CHANGE -
  place boundaries at real changes. Watch to the very end.
- Watch BOTH hands separately - they usually do different things at the same
  time (one anchors/places while the other picks/plucks).
- Do not invent steps. Do not label walking, looking, camera/face touches.

OBJECT NAMING - critical: name every object precisely and consistently. If
annotator context supplies object names, use exactly those. NEVER use vague
words: item, thing, stuff, material, something.
NO HALLUCINATION: name ONLY objects you can clearly see. If uncertain, describe
by colour and shape (e.g. 'white round container') instead of guessing.

LABEL RULES: imperative, under 20 words, 1-3 atomic actions, max two separators,
actions in the order they happen. Always name the specific object and ALWAYS
state the hand: with left hand / with right hand / with both hands, or
'with <tool> in right hand'. Comma separates a left-hand action from a
right-hand action; 'and' only joins actions by the same hand.
FORBIDDEN words: the, a, an, it, them, they, -ing verb forms, adjust, manipulate,
move, transfer, reach, inspect, check, examine, handover, give, tool, object,
utensil, cutlery, silverware. Object leaves surface = 'pick up'; set down = 'place'.

CLIENT AUDIT LESSONS - the exact mistakes the client rejects most. Obey strictly:
1. LABEL BOTH HANDS. WRONG: "pick up and place vegetables in bun with tong in
   right hand" -> RIGHT: "hold bun with left hand, pick up and place vegetables
   in bun with tong in right hand".
2. NEVER write "hold X" when that hand is actively doing something. WRONG:
   "hold pan handle with left hand, hold spatula with right hand" -> RIGHT:
   "hold pan handle with left hand, stir food in pan with spatula in right hand".
3. CAPTURE MICRO-ACTIONS: shift, pass, pick up, place, pour, scoop, flip, turn, wipe.
4. ACTIONS IN EXACT TEMPORAL ORDER within the label.
5. ONE CONSISTENT OBJECT NAME across ALL segments (not "rice bag" then
   "plastic bag"; not "floor" when it is "stair step").
6. TOOL PHRASING: "<action> <object> with <tool> in <hand>".
7. VERB CONSISTENCY: one verb per repeated activity (iron not press/smooth).

OUTPUT: return ONLY valid JSON:
{"segments":[{"start":0.0,"end":2.0,"label":"...","confidence":"high|medium|low",
"note":"what to verify, only if uncertain"}]}
Times in seconds, one decimal. Verify every segment is <=10.0 s and every label
names hand + specific action + specific object.`;
