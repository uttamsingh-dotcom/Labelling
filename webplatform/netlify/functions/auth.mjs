// POST /api/auth  {username, password} -> {token, role, username}
// Bootstrap: if no users exist yet, logging in as 'admin' creates the admin
// account with the password supplied (min 8 chars).
import { db, hashPw, newSalt, signToken, json, bad } from "./_lib.mjs";

export async function handler(event) {
  if (event.httpMethod !== "POST") return bad("POST only");
  let body;
  try { body = JSON.parse(event.body || "{}"); } catch { return bad(); }
  const username = (body.username || "").trim();
  const password = body.password || "";
  if (!username || !password) return bad("Username and password required");

  let rows = await db(`tl_users?username=eq.${encodeURIComponent(username)}&select=*`);

  if (!rows.length && username === "admin") {
    const any = await db("tl_users?select=id&limit=1");
    if (!any.length) {
      if (password.length < 8)
        return bad("First-run: choose an admin password of 8+ characters, then log in with it.");
      const salt = newSalt();
      rows = await db("tl_users", { method: "POST", body: {
        username: "admin", salt, pass_hash: hashPw(password, salt), role: "admin",
      }});
    }
  }

  const u = rows[0];
  if (!u || !u.active || hashPw(password, u.salt) !== u.pass_hash)
    return json(401, { error: "Wrong username or password" });

  return json(200, {
    token: signToken({ uid: u.id, role: u.role, username: u.username }),
    role: u.role, username: u.username,
  });
}
