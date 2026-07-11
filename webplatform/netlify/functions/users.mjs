// Admin user management.
// GET    /api/users                         -> list users
// POST   /api/users {username,password}     -> create worker (role optional)
// PATCH  /api/users {id,grade|active|password} -> update
// DELETE /api/users?id=N                    -> delete user (tasks are kept)
import { db, hashPw, newSalt, auth, json, deny, bad } from "./_lib.mjs";

export async function handler(event) {
  const me = auth(event, "admin");
  if (!me) return deny();

  if (event.httpMethod === "GET") {
    const users = await db("tl_users?select=id,username,role,grade,active,created_at&order=id");
    return json(200, users);
  }

  if (event.httpMethod === "POST") {
    let b; try { b = JSON.parse(event.body || "{}"); } catch { return bad(); }
    const username = (b.username || "").trim();
    if (!username || !b.password) return bad("Username and password required");
    const salt = newSalt();
    try {
      const rows = await db("tl_users", { method: "POST", body: {
        username, salt, pass_hash: hashPw(b.password, salt),
        role: b.role === "admin" ? "admin" : "worker",
      }});
      return json(200, rows[0]);
    } catch (e) {
      return bad("Username already exists");
    }
  }

  if (event.httpMethod === "PATCH") {
    let b; try { b = JSON.parse(event.body || "{}"); } catch { return bad(); }
    if (!b.id) return bad("id required");
    const patch = {};
    if ("grade" in b) patch.grade = String(b.grade).slice(0, 30);
    if ("active" in b) patch.active = !!b.active;
    if (b.password) {
      patch.salt = newSalt();
      patch.pass_hash = hashPw(b.password, patch.salt);
    }
    if (!Object.keys(patch).length) return bad("Nothing to update");
    const rows = await db(`tl_users?id=eq.${+b.id}`, { method: "PATCH", body: patch });
    return json(200, rows[0] || {});
  }

  if (event.httpMethod === "DELETE") {
    const id = +(event.queryStringParameters?.id || 0);
    if (!id) return bad("id required");
    if (id === me.uid) return bad("You cannot delete your own account");
    await db(`tl_users?id=eq.${id}`, { method: "DELETE" });
    return json(200, { ok: true });
  }

  return bad("Unsupported method");
}
