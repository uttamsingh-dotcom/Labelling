// GET /api/draft?id=N -> {draft_status, draft} - polled while Claude works.
import { db, auth, json, deny, bad } from "./_lib.mjs";

export async function handler(event) {
  const me = auth(event);
  if (!me) return deny("Login required");
  const id = +(event.queryStringParameters?.id || 0);
  if (!id) return bad("id required");
  const rows = await db(`tl_tasks?id=eq.${id}&select=owner,draft_status,draft`);
  const t = rows[0];
  if (!t) return bad("No such task");
  if (me.role !== "admin" && t.owner !== me.uid) return deny();
  return json(200, { draft_status: t.draft_status, draft: t.draft });
}
