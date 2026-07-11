// Task lifecycle.
// GET    /api/tasks              -> worker: own tasks; admin: all (+usernames)
// GET    /api/tasks?id=N         -> one task (owner or admin)
// POST   /api/tasks {title,filename,duration} -> worker creates own task;
//                                  returns {task, duplicates:[...]} for warning
// PATCH  /api/tasks {id,segments}          -> save labels (owner, not approved)
// PATCH  /api/tasks {id,action:"submit"}   -> owner submits for QA
// PATCH  /api/tasks {id,action:"review",status,note} -> admin approve/rework
// DELETE /api/tasks?id=N         -> admin only
import { db, auth, json, deny, bad } from "./_lib.mjs";

const touch = () => ({ updated_at: new Date().toISOString() });

export async function handler(event) {
  const me = auth(event);
  if (!me) return deny("Login required");
  const isAdmin = me.role === "admin";

  if (event.httpMethod === "GET") {
    const id = +(event.queryStringParameters?.id || 0);
    if (id) {
      const rows = await db(`tl_tasks?id=eq.${id}&select=*`);
      const t = rows[0];
      if (!t) return bad("No such task");
      if (!isAdmin && t.owner !== me.uid) return deny();
      return json(200, t);
    }
    const filter = isAdmin ? "" : `&owner=eq.${me.uid}`;
    const tasks = await db(
      `tl_tasks?select=id,title,filename,duration,owner,status,review_note,` +
      `segments,created_at,updated_at${filter}&order=id.desc`);
    let users = [];
    if (isAdmin) users = await db("tl_users?select=id,username,grade&order=id");
    return json(200, { tasks, users });
  }

  if (event.httpMethod === "POST") {
    let b; try { b = JSON.parse(event.body || "{}"); } catch { return bad(); }
    const title = (b.title || "").trim();
    const filename = (b.filename || "").trim();
    const duration = +b.duration || null;
    if (!title || !filename) return bad("Title and video file required");
    // duplicate check: same filename, or same duration within 0.3 s
    const dups = await db(
      `tl_tasks?or=(filename.eq.${encodeURIComponent(filename)}` +
      (duration ? `,and(duration.gte.${(duration - 0.3).toFixed(2)},duration.lte.${(duration + 0.3).toFixed(2)})` : "") +
      `)&select=id,title,filename,owner,status&limit=5`);
    const rows = await db("tl_tasks", { method: "POST", body: {
      title, filename, duration, owner: me.uid,
    }});
    return json(200, { task: rows[0], duplicates: dups });
  }

  if (event.httpMethod === "PATCH") {
    let b; try { b = JSON.parse(event.body || "{}"); } catch { return bad(); }
    const id = +b.id;
    if (!id) return bad("id required");
    const rows = await db(`tl_tasks?id=eq.${id}&select=*`);
    const t = rows[0];
    if (!t) return bad("No such task");

    if (b.action === "review") {
      if (!isAdmin) return deny();
      if (!["approved", "rework"].includes(b.status)) return bad("Bad status");
      await db(`tl_tasks?id=eq.${id}`, { method: "PATCH", body: {
        status: b.status, review_note: (b.note || "").slice(0, 500), ...touch() }});
      return json(200, { ok: true });
    }

    if (!isAdmin && t.owner !== me.uid) return deny();
    if (t.status === "approved") return bad("Task already approved");

    if (b.action === "submit") {
      await db(`tl_tasks?id=eq.${id}`, { method: "PATCH",
        body: { status: "submitted", ...touch() }});
      return json(200, { ok: true });
    }

    if (Array.isArray(b.segments)) {
      await db(`tl_tasks?id=eq.${id}`, { method: "PATCH",
        body: { segments: b.segments, ...touch() }});
      return json(200, { ok: true });
    }
    return bad("Nothing to update");
  }

  if (event.httpMethod === "DELETE") {
    if (!isAdmin) return deny();
    const id = +(event.queryStringParameters?.id || 0);
    if (!id) return bad("id required");
    await db(`tl_tasks?id=eq.${id}`, { method: "DELETE" });
    return json(200, { ok: true });
  }

  return bad("Unsupported method");
}
