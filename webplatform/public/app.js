/* LabelDesk SPA - videos stay on the labeller's computer; only labels are stored. */
"use strict";

// ---------------------------------------------------------------- state & api
const store = {
  get token() { return localStorage.getItem("ld_token") || ""; },
  set token(v) { v ? localStorage.setItem("ld_token", v) : localStorage.removeItem("ld_token"); },
  get me() { try { return JSON.parse(localStorage.getItem("ld_me") || "null"); } catch { return null; } },
  set me(v) { v ? localStorage.setItem("ld_me", JSON.stringify(v)) : localStorage.removeItem("ld_me"); },
};

async function api(path, opts = {}) {
  const r = await fetch("/api/" + path, {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(store.token ? { Authorization: "Bearer " + store.token } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = null;
  try { data = await r.json(); } catch {}
  if (r.status === 401 || r.status === 403) {
    if ((data?.error || "").includes("Login")) { logout(); throw new Error("Session expired - log in again"); }
  }
  if (!r.ok) throw new Error(data?.error ||
    (r.status === 413 ? "Frames too large for upload - try again (auto-compress will kick in)"
                      : "HTTP " + r.status));
  return data;
}
function logout() { store.token = ""; store.me = null; location.hash = "#/login"; render(); }

// ---------------------------------------------------------------- helpers
const esc = (t) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
const fmt = (t) => { if (!isFinite(t)) return "-"; const m = Math.floor(t / 60), s = t - m * 60;
  return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); };
const el = (id) => document.getElementById(id);

const FORBIDDEN = ["the","a","an","it","them","they","adjust","adjusts","manipulate",
  "manipulates","move","moves","transfer","transfers","handover","give","gives","reach",
  "reaches","inspect","inspects","check","checks","examine","examines","tool","tools",
  "object","objects","utensil","utensils","cutlery","silverware"];
const ING_OK = ["string","ring","spring","wing","thing","earring","icing","ceiling","during"];

function lintLabel(label, dur) {
  const issues = []; const raw = (label || "").trim();
  if (!raw) { issues.push(["warn", "empty label"]); return issues; }
  if (raw.toLowerCase() === "no action") {
    if (dur <= 5) issues.push(["warn", "'no action' only for idle > 5s"]); return issues; }
  const words = raw.toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean);
  if (words.length > 20) issues.push(["err", words.length + " words (max 20)"]);
  for (const w of words) {
    if (FORBIDDEN.includes(w)) issues.push(["err", 'forbidden: "' + w + '"']);
    else if (w.endsWith("ing") && !ING_OK.includes(w)) issues.push(["err", '-ing: "' + w + '"']); }
  if (!/\bhand(s)?\b/.test(raw.toLowerCase())) issues.push(["err", "no hand annotation"]);
  const seps = (raw.match(/,/g) || []).length + (raw.toLowerCase().match(/\band\b/g) || []).length;
  if (seps > 2) issues.push(["err", seps + " separators (max 2) / " + (seps + 1) + " actions (max 3)"]);
  if (dur > 10.01) issues.push(["err", dur.toFixed(1) + "s (max 10s)"]);
  if (dur <= 0) issues.push(["err", "end must be after start"]);
  const holds = (raw.toLowerCase().match(/\bhold\b/g) || []).length;
  if (holds >= 2) issues.push(["warn",
    "two 'hold's - is one hand really just holding? name its real action"]);
  const lower = raw.toLowerCase();
  const hasL = /\bleft hand\b/.test(lower), hasR = /\bright hand\b/.test(lower),
        hasB = /\bboth hands\b/.test(lower);
  if ((hasL ^ hasR) && !hasB) issues.push(["warn",
    "only one hand mentioned - check what other hand does"]);
  return issues;
}
function consistencyWarnings(segs) {
  const map = {};
  segs.forEach((s) => {
    const l = (s.label || "").toLowerCase();
    const re = /(?:pick up|place|hold|pluck|press|shape|wrap|attach|fix|spread|fold|cut|pour|stir|dip|put|shift|pass|flip|turn|wipe|roll|iron|scoop)\s+([a-z][a-z ]{2,28}?)(?:\s+(?:with|in|on|into|from|to|onto)\b|,|$)/g;
    let m; while ((m = re.exec(l)) !== null) {
      const phrase = m[1].trim(); const wp = phrase.split(/\s+/);
      const head = wp[wp.length - 1];
      if (head.length < 3 || ["hand", "hands"].includes(head)) continue;
      (map[head] = map[head] || new Set()).add(phrase); } });
  const out = [];
  for (const h in map) if (map[h].size > 1) out.push([...map[h]].join(" / "));
  return out;
}
function splitMax10(list) {
  const out = [];
  for (const s of list) {
    let a = +s.start, b = +s.end; if (isNaN(a) || isNaN(b)) continue;
    while (b - a > 10) { out.push({ ...s, start: +a.toFixed(1), end: +(a + 10).toFixed(1) }); a += 10; }
    out.push({ ...s, start: +a.toFixed(1), end: +b.toFixed(1) }); }
  return out;
}

// ---------------------------------------------------------------- shell
function shell(title, bodyHTML, active) {
  const me = store.me;
  const items = me.role === "admin"
    ? [["#/admin", "Dashboard"], ["#/admin", "Tasks"], ["#/admin", "Team"]]
    : [["#/home", "My tasks"]];
  const seen = new Set();
  const nav = items.filter(([h]) => !seen.has(h) && seen.add(h)).map(([h, l]) =>
    `<a class="${h === active ? "on" : ""}" href="${h}">${l}</a>`).join("");
  return `
  <div class="shell">
    <div class="sidebar">
      <div class="logo"><span class="dot">L</span>LabelDesk</div>
      <div class="nav">${nav}</div>
      <div class="sb-foot"><div class="who">${esc(me.username)}</div>
        <div style="margin-bottom:8px">${me.role}</div>
        <a onclick="logout()">Sign out</a></div>
    </div>
    <div class="content">
      <div class="topbar"><span class="t">${esc(title)}</span>
        <span class="hint">Egocentric video labelling workspace</span></div>
      <main id="main">${bodyHTML}</main>
    </div>
  </div>`;
}

// ---------------------------------------------------------------- login
function viewLogin(msg = "") {
  document.getElementById("root").innerHTML = `
  <div class="loginwrap"><div class="loginbox">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
      <span style="width:34px;height:34px;border-radius:10px;flex:none;
      background:linear-gradient(135deg,#6366f1,#8b5cf6);display:inline-flex;
      align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:16px">L</span>
      <span style="font-size:19px;font-weight:700">LabelDesk</span></div>
    <p class="hint" style="margin:0 0 22px">Egocentric video labelling workspace</p>
    ${msg ? `<p class="err" style="margin:0 0 12px;font-size:13px">${esc(msg)}</p>` : ""}
    <input id="lu" placeholder="Username" autofocus>
    <input id="lp" type="password" placeholder="Password">
    <button onclick="doLogin()">Sign in</button>
    <p class="hint" style="margin-top:18px;text-align:center">First run: sign in as
    <b>admin</b> with a new password (8+ chars) to create the admin account.</p>
  </div></div>`;
  el("lp").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
}
async function doLogin() {
  try {
    const r = await api("auth", { method: "POST",
      body: { username: el("lu").value, password: el("lp").value } });
    store.token = r.token; store.me = { username: r.username, role: r.role };
    location.hash = r.role === "admin" ? "#/admin" : "#/home"; render();
  } catch (e) { viewLogin(e.message); }
}

// ---------------------------------------------------------------- worker home
async function viewHome() {
  const { tasks } = await api("tasks");
  const n = (s) => tasks.filter((t) => t.status === s).length;
  const rows = tasks.map((t) => `
    <tr><td class="hint">${t.id}</td><td><b>${esc(t.title)}</b>
      <div class="hint">${esc(t.filename)}</div></td>
    <td>${(t.segments || []).length}</td>
    <td><span class="tag ${t.status}">${t.status}</span></td>
    <td class="hint">${t.status === "rework" ? `<span class="err">${esc(t.review_note)}</span>` : esc(t.review_note || "")}</td>
    <td><a class="btn ghost" href="#/task/${t.id}">${["new","rework"].includes(t.status) ? "Continue" : "Open"}</a></td></tr>`).join("");
  document.getElementById("root").innerHTML = shell("My tasks", `
    <div class="stats">
      <div class="stat"><div class="n">${n("new") + n("rework")}</div><div class="l">To label</div></div>
      <div class="stat"><div class="n">${n("submitted")}</div><div class="l">Waiting for QA</div></div>
      <div class="stat"><div class="n">${n("approved")}</div><div class="l">Approved</div></div>
    </div>
    <div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0">My tasks</h3>
        <button onclick="newTaskModal()">+ New task</button></div>
      <table><tr><th style="width:36px">#</th><th>Video</th><th>Segments</th>
      <th>Status</th><th>Reviewer note</th><th style="width:96px"></th></tr>
      ${rows || `<tr><td colspan=6 class="hint">No tasks yet - click "+ New task", pick the video you downloaded from the client platform, and start labelling.</td></tr>`}
      </table></div>`, "#/home");
}

function newTaskModal() {
  const div = document.createElement("div");
  div.className = "modalbg";
  div.innerHTML = `<div class="modal">
    <h3>New labelling task</h3>
    <p class="hint">Select the video you downloaded from the client platform.
    It stays on your computer - it is never uploaded.</p>
    <div class="filedrop" onclick="el('ntfile').click()" id="ntdrop">
      Click to choose the video file</div>
    <input type="file" id="ntfile" accept="video/*" style="display:none">
    <p style="margin:14px 0 6px"><input id="nttitle" placeholder="Activity title, e.g. chilli destemming" style="width:100%"></p>
    <p class="hint">Descriptive titles help AI drafts name objects correctly.</p>
    <div id="ntinfo" class="hint"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
      <button class="ghost" onclick="this.closest('.modalbg').remove()">Cancel</button>
      <button onclick="createTask()" id="ntgo" disabled>Create task</button></div>
  </div>`;
  document.body.appendChild(div);
  el("ntfile").addEventListener("change", async () => {
    const f = el("ntfile").files[0]; if (!f) return;
    el("ntdrop").textContent = f.name;
    const d = await fileDuration(f).catch(() => null);
    window._ntMeta = { name: f.name, duration: d, file: f };
    el("ntinfo").textContent = d ? `Duration: ${fmt(d)} ${d > 125 ? "- WARNING: over 2 minutes!" : ""}` :
      "Could not read duration - you can still create the task.";
    el("ntgo").disabled = false;
  });
}
function fileDuration(file) {
  return new Promise((res, rej) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { const d = v.duration; URL.revokeObjectURL(v.src); res(d); };
    v.onerror = () => rej(new Error("bad video"));
    v.src = URL.createObjectURL(file);
  });
}
async function createTask() {
  const m = window._ntMeta; const title = el("nttitle").value.trim();
  if (!m || !title) { el("ntinfo").textContent = "Pick a file and enter a title."; return; }
  const r = await api("tasks", { method: "POST", body: {
    title, filename: m.name, duration: m.duration ? +m.duration.toFixed(2) : null } });
  document.querySelector(".modalbg")?.remove();
  if (r.duplicates?.length) {
    alert("Note: a similar video may already be labelled:\n" +
      r.duplicates.map((d) => `#${d.id} ${d.title} (${d.filename}) - ${d.status}`).join("\n") +
      "\nCheck with your admin if unsure.");
  }
  sessionFiles[r.task.id] = m.file;      // reuse without re-picking
  location.hash = "#/task/" + r.task.id;
}
const sessionFiles = {};                  // taskId -> File (this browser session)

// ---------------------------------------------------------------- admin
async function viewAdmin() {
  const { tasks, users } = await api("tasks");
  const uname = (id) => users.find((u) => u.id === id)?.username || "-";
  const by = (s) => tasks.filter((t) => t.status === s).length;
  const total = tasks.length, pct = total ? Math.round(by("approved") / total * 100) : 0;

  const perf = users.filter((u) => u.role !== "admin").map((u) => {
    const wt = tasks.filter((t) => t.owner === u.id);
    const ap = wt.filter((t) => t.status === "approved").length;
    const rw = wt.filter((t) => t.status === "rework").length;
    const rate = (ap + rw) ? Math.round(ap / (ap + rw) * 100) : null;
    return { ...u, ntasks: wt.length, ap, rw, rate };
  });
  const zones = { red: 0, amber: 0, green: 0 };
  perf.forEach((p) => { if (p.rate === null) return;
    zones[p.rate >= 95 ? "green" : p.rate >= 80 ? "amber" : "red"]++; });
  const zmax = Math.max(zones.red, zones.amber, zones.green, 1);
  const zoneRow = (lbl, n, col) => `<div class="zone"><span>${lbl}</span>
    <div class="zb"><i style="width:${Math.round(n / zmax * 100)}%;background:${col}"></i></div>
    <span>${n}</span></div>`;

  const perfRows = perf.map((p) => {
    const col = p.rate === null ? "" : p.rate >= 95 ? "#16a34a" : p.rate >= 80 ? "#d97706" : "#dc2626";
    const rate = p.rate === null ? '<span class="hint">no QA data</span>' :
      `<div style="display:flex;align-items:center;gap:8px">
       <div class="pbar" style="flex:1;max-width:110px"><i style="width:${p.rate}%;background:${col}"></i></div>
       <b style="color:${col}">${p.rate}%</b></div>`;
    return `<tr><td><b>${esc(p.username)}</b>${p.active ? "" : ' <span class="tag rework">disabled</span>'}</td>
      <td><input value="${esc(p.grade)}" style="width:70px;padding:4px 8px"
        onchange="setGrade(${p.id},this.value)" placeholder="tier"></td>
      <td>${p.ntasks}</td><td>${p.ap}</td><td>${p.rw}</td><td>${rate}</td>
      <td style="white-space:nowrap">
        <button class="ghost" style="padding:3px 8px" onclick="resetPw(${p.id},'${esc(p.username)}')">Reset pw</button>
        <button class="ghost" style="padding:3px 8px" onclick="toggleActive(${p.id},${!p.active})">${p.active ? "Disable" : "Enable"}</button>
        <button class="danger" style="padding:3px 8px" onclick="delUser(${p.id},'${esc(p.username)}')">Delete</button>
      </td></tr>`;
  }).join("");

  const taskRows = tasks.map((t) => {
    const key = `${t.id} ${t.title} ${uname(t.owner)} ${t.status} ${t.filename}`.toLowerCase();
    return `<tr data-t="${esc(key)}"><td class="hint">${t.id}</td>
      <td><b>${esc(t.title)}</b><div class="hint">${esc(t.filename)}</div></td>
      <td>${uname(t.owner)}</td><td>${(t.segments || []).length}</td>
      <td><span class="tag ${t.status}">${t.status}</span></td>
      <td style="white-space:nowrap"><a class="btn ghost" href="#/task/${t.id}">Open</a>
      <button class="ghost" onclick="exportCsv(${t.id})">CSV</button>
      <button class="danger" style="padding:3px 8px" onclick="delTask(${t.id})">Del</button></td></tr>`;
  }).join("");

  document.getElementById("root").innerHTML = shell("Dashboard", `
    <div class="stats">
      <div class="stat"><div class="n">${total}</div><div class="l">Total tasks</div></div>
      <div class="stat"><div class="n">${by("new")}</div><div class="l">In labelling</div></div>
      <div class="stat"><div class="n">${by("submitted")}</div><div class="l">Awaiting QA</div></div>
      <div class="stat"><div class="n">${by("rework")}</div><div class="l">In rework</div></div>
      <div class="stat"><div class="n">${by("approved")}</div><div class="l">Approved</div>
        <div class="bar"><i style="width:${pct}%"></i></div></div>
    </div>

    <div class="grid2">
    <div class="card"><h3>Team performance</h3>
      ${zoneRow("&lt;80%", zones.red, "#dc2626")}
      ${zoneRow("80-95%", zones.amber, "#d97706")}
      ${zoneRow("95%+", zones.green, "#16a34a")}
      <p class="hint">QA approval-rate zones (approved vs rework). Grade column is
      your manual tier - type anything (T1/T2/T3, A/B/C) and press Enter.</p>
      <table><tr><th>Labeller</th><th>Grade</th><th>Tasks</th><th>Appr.</th>
      <th>Rework</th><th>Approval rate</th><th></th></tr>
      ${perfRows || '<tr><td colspan=7 class="hint">No labellers yet.</td></tr>'}</table>
    </div>
    <div class="card"><h3>Add labeller</h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
        <input id="nuName" placeholder="Username" style="flex:1;min-width:120px">
        <input id="nuPw" placeholder="Password" style="flex:1;min-width:120px">
        <button onclick="addUser()">Add</button></div>
      <p class="hint">Share the username and password with your labeller. They log
      in at this same address. You can reset passwords, disable, or delete accounts
      in the table - deleting keeps their past tasks.</p>
      <div id="numsg" class="hint"></div>
    </div>
    </div>

    <div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0">All tasks</h3>
      <input placeholder="Filter tasks…" style="width:220px" oninput="
        for(const r of document.querySelectorAll('#atable tr[data-t]'))
        r.style.display=r.dataset.t.includes(this.value.toLowerCase())?'':'none'"></div>
      <table id="atable"><tr><th style="width:36px">#</th><th>Video</th><th>Labeller</th>
      <th>Segs</th><th>Status</th><th style="width:190px">Actions</th></tr>
      ${taskRows || '<tr><td colspan=6 class="hint">No tasks yet - labellers create them when they start a video.</td></tr>'}</table>
    </div>`, "#/admin");
  window._admTasks = tasks;
}
async function addUser() {
  try {
    await api("users", { method: "POST",
      body: { username: el("nuName").value, password: el("nuPw").value } });
    render();
  } catch (e) { el("numsg").textContent = e.message; }
}
async function setGrade(id, grade) { await api("users", { method: "PATCH", body: { id, grade } }); }
async function toggleActive(id, active) { await api("users", { method: "PATCH", body: { id, active } }); render(); }
async function resetPw(id, name) {
  const p = prompt(`New password for ${name}:`); if (!p) return;
  await api("users", { method: "PATCH", body: { id, password: p } });
  alert("Password updated.");
}
async function delUser(id, name) {
  if (!confirm(`Delete user ${name}? Their past tasks are kept.`)) return;
  await api("users?id=" + id, { method: "DELETE" }); render();
}
async function delTask(id) {
  if (!confirm(`Delete task #${id} and its labels?`)) return;
  await api("tasks?id=" + id, { method: "DELETE" }); render();
}
function exportCsv(id) {
  const t = (window._admTasks || []).find((x) => x.id === id); if (!t) return;
  const lines = ["start,end,label"];
  for (const s of t.segments || [])
    lines.push(`${(+s.start).toFixed(1)},${(+s.end).toFixed(1)},"${String(s.label || "").replace(/"/g, '""')}"`);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
  a.download = `${t.filename.replace(/\.[^.]+$/, "")}_labels.csv`;
  a.click();
}

// ---------------------------------------------------------------- editor
let ED = null;   // editor state: {task, segs, sel, dirty, url}

async function viewTask(id) {
  const t = await api("tasks?id=" + id);
  ED = { task: t, segs: t.segments || [], sel: -1, loopEnd: null };
  const me = store.me, isAdmin = me.role === "admin";
  const readonly = t.status === "approved";
  const reviewBar = (isAdmin && t.status === "submitted") ? `
    <div class="card"><h3>QA review</h3>
      <input id="rvnote" placeholder="Note to labeller (for rework)" style="width:50%">
      <button onclick="reviewTask('approved')">Approve</button>
      <button class="danger" onclick="reviewTask('rework')">Send back for rework</button></div>` : "";
  document.getElementById("root").innerHTML = shell(t.title, `
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">
    <div style="display:flex;align-items:center;gap:12px">
      <a class="btn ghost" href="${isAdmin ? "#/admin" : "#/home"}">&larr; Back</a>
      <span style="font-size:16px;font-weight:600">${esc(t.title)}</span>
      <span class="tag ${t.status}">${t.status}</span></div>
    <div style="display:flex;align-items:center;gap:10px">
      <span class="hint" id="savestate"></span>
      <button class="ghost" onclick="saveSegs(true)">Save</button>
      ${(!isAdmin && !readonly) ? '<button onclick="submitTask()">Submit for QA</button>' : ""}</div>
  </div>
  <div class="card" id="filegate">
    <h3>Load the video file</h3>
    <p class="hint">This task was created for <b>${esc(t.filename)}</b>
    (${t.duration ? fmt(t.duration) : "?"}). Select your local copy - it plays
    from your computer and is never uploaded.</p>
    <div class="filedrop" onclick="el('gfile').click()">Click to choose ${esc(t.filename)}</div>
    <input type="file" id="gfile" accept="video/*" style="display:none">
    <p class="hint err" id="gwarn"></p>
  </div>
  <div class="edgrid" id="edgrid" style="display:none">
    <div class="card player">
      <video id="vid"></video>
      <div class="tlwrap"><div class="tl" id="tl">
        <div class="ruler" id="ruler"></div><div id="tlsegs"></div>
        <div class="ph" id="ph" style="left:0"></div></div></div>
      <div class="transport">
        <button class="ghost" id="playbtn" onclick="togglePlay()" style="width:42px;justify-content:center">&#9654;</button>
        <button class="ghost" onclick="V().currentTime-=0.1">&minus;0.1s</button>
        <button class="ghost" onclick="V().currentTime+=0.1">+0.1s</button>
        <button class="ghost" onclick="V().playbackRate=0.5">0.5&times;</button>
        <button class="ghost" onclick="V().playbackRate=1">1&times;</button>
        <button class="ghost" onclick="V().playbackRate=2">2&times;</button>
        <span style="margin-left:auto" class="timebig"><span id="cur">0:00.0</span>
        <span style="color:var(--mut);font-weight:400"> / <span id="dur">-</span></span></span>
      </div>
      <div class="transport" style="margin-top:8px">
        <label class="hint" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">
        <input type="checkbox" id="loopchk" checked style="accent-color:var(--brand-d)">
        Loop selected segment</label>
        <span class="hint" id="loopinfo" style="margin-left:auto"></span></div>
      <div class="transport">
        <button onclick="markStart()">Start here <span class="kbd" style="background:rgba(255,255,255,.2);color:#fff;border-color:transparent">S</span></button>
        <button onclick="markEnd()">End here <span class="kbd" style="background:rgba(255,255,255,.2);color:#fff;border-color:transparent">E</span></button>
        <button onclick="newSeg()">New segment <span class="kbd" style="background:rgba(255,255,255,.2);color:#fff;border-color:transparent">N</span></button>
        <button class="ghost" onclick="playSel()">Play selected <span class="kbd">P</span></button></div>
      <div class="transport">
        <button class="ghost" id="aibtn" onclick="aiDraft()">&#10024; AI draft (Claude)</button>
        <button class="ghost" onclick="toggleImport()">&#128229; Paste AI result</button></div>
      <div id="importbox" style="display:none;margin-top:10px">
        <textarea id="importtxt" rows="5" style="width:100%;font-size:12px"
          placeholder="Paste a JSON segments reply here"></textarea>
        <button onclick="importDraft()" style="margin-top:6px">Import segments</button></div>
      <p class="hint" id="msg" style="min-height:18px;margin-bottom:0"></p>
      <p class="hint" style="margin-bottom:0"><span class="kbd">Space</span> play/pause &middot;
      <span class="kbd">S</span>/<span class="kbd">E</span> start/end &middot;
      <span class="kbd">N</span> new &middot; <span class="kbd">P</span> play selected &middot;
      <span class="kbd">&larr;</span><span class="kbd">&rarr;</span> &plusmn;0.1s &middot;
      max 10s per segment. AI draft is a starting point - always verify against playback.</p>
    </div>
    <div class="card">
      <div id="summary" style="margin-bottom:10px"></div>
      <table class="seglist"><thead><tr><th style="width:26px">#</th>
      <th style="width:86px">Start</th><th style="width:86px">End</th>
      <th style="width:46px">Dur</th><th>Label</th><th style="width:104px"></th></tr></thead>
      <tbody id="rows"></tbody></table>
      <div style="margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <button class="ghost" onclick="addRow()">+ Add segment</button>
        <span class="hint">&#9986; split at playhead &middot; &#8595; merge with next
        &middot; &minus;/+ nudge 0.1s</span></div>
    </div>
  </div>
  ${reviewBar}`, isAdmin ? "#/admin" : "#/home");

  window._readonly = readonly;
  el("gfile").addEventListener("change", () => loadLocalFile(el("gfile").files[0]));
  const cached = sessionFiles[t.id];
  if (cached) loadLocalFile(cached);
}
const V = () => el("vid");

async function loadLocalFile(f) {
  if (!f) return;
  const t = ED.task;
  let warn = "";
  if (f.name !== t.filename) warn = `Filename differs (task: ${t.filename}, you chose: ${f.name}). `;
  try {
    const d = await fileDuration(f);
    if (t.duration && Math.abs(d - t.duration) > 0.5)
      warn += `Duration differs (task: ${fmt(t.duration)}, file: ${fmt(d)}) - this may be the WRONG video.`;
  } catch {}
  el("gwarn").textContent = warn;
  if (warn && !confirm(warn + "\nLoad this file anyway?")) return;
  sessionFiles[t.id] = f;
  ED.url && URL.revokeObjectURL(ED.url);
  ED.url = URL.createObjectURL(f);
  el("filegate").style.display = "none";
  el("edgrid").style.display = "";
  const v = V();
  v.src = ED.url;
  bindEditor();
}

function bindEditor() {
  const v = V();
  v.addEventListener("timeupdate", () => {
    el("cur").textContent = fmt(v.currentTime);
    if (v.duration) el("ph").style.left = (v.currentTime / v.duration * 100) + "%";
    if (!v.paused && el("loopchk")?.checked && ED.sel >= 0 && ED.segs[ED.sel]) {
      const s = ED.segs[ED.sel];
      if (v.currentTime >= s.end || v.currentTime < s.start - 0.3) v.currentTime = s.start;
    } else if (ED.loopEnd !== null && v.currentTime >= ED.loopEnd) { v.pause(); ED.loopEnd = null; }
  });
  v.addEventListener("loadedmetadata", () => { el("dur").textContent = fmt(v.duration); renderTL(); });
  v.addEventListener("click", togglePlay);
  v.addEventListener("play", () => el("playbtn").innerHTML = "&#10074;&#10074;");
  v.addEventListener("pause", () => el("playbtn").innerHTML = "&#9654;");
  el("tl").addEventListener("click", (e) => {
    if (!v.duration) return;
    const r = el("tl").getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * v.duration;
  });
  document.onkeydown = (e) => {
    if (!el("vid")) return;
    const tag = document.activeElement.tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); togglePlay(); }
    else if (k === "s") markStart(); else if (k === "e") markEnd();
    else if (k === "n") newSeg(); else if (k === "p") playSel();
    else if (k === "arrowleft") { e.preventDefault(); v.currentTime -= 0.1; }
    else if (k === "arrowright") { e.preventDefault(); v.currentTime += 0.1; }
  };
  renderRows(); el("savestate").textContent = "";
}
function togglePlay() { const v = V(); v.paused ? v.play() : v.pause(); }

function renderTL() {
  const v = V(); if (!v?.duration || !isFinite(v.duration)) return;
  const D = v.duration, step = D > 90 ? 15 : D > 40 ? 10 : 5;
  let html = "";
  for (let t2 = 0; t2 <= D; t2 += step)
    html += `<div class="tickline" style="left:${t2 / D * 100}%"></div>` +
            `<div class="tick" style="left:${t2 / D * 100}%">${t2}s</div>`;
  el("ruler").innerHTML = html;
  const box = el("tlsegs"); box.innerHTML = "";
  ED.segs.forEach((s, i) => {
    const a = +s.start, b = +s.end;
    if (isNaN(a) || isNaN(b) || b <= a) return;
    const bad = lintLabel(s.label, b - a).some((x) => x[0] === "err");
    const d = document.createElement("div");
    d.className = "seg" + (i === ED.sel ? " sel" : "") + (bad ? " bad" : "");
    d.style.left = (a / D * 100) + "%";
    d.style.width = Math.max((b - a) / D * 100, .4) + "%";
    d.innerHTML = `<span>${esc(s.label || "")}</span>`;
    d.title = `${a.toFixed(1)}-${b.toFixed(1)}s ${s.label || ""}`;
    d.onclick = (e) => { e.stopPropagation(); ED.sel = i; V().currentTime = a; renderRows(); };
    box.appendChild(d);
  });
}

function renderRows() {
  const R = window._readonly;
  const rowsEl = el("rows"); rowsEl.innerHTML = "";
  ED.segs.forEach((s, i) => {
    const dur = s.end - s.start, issues = lintLabel(s.label, dur);
    const wc = (s.label || "").toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean).length;
    const wcls = wc > 20 ? "over" : wc >= 17 ? "close" : "ok";
    const dis = R ? "disabled" : "";
    const step = (k) => R ? "" : `<div class="stepbtns">
      <button onclick="nudge(${i},'${k}',-0.1)">&minus;</button>
      <button onclick="nudge(${i},'${k}',0.1)">+</button></div>`;
    const tr = document.createElement("tr");
    if (i === ED.sel) tr.style.background = "#eef0ff";
    tr.onclick = (e) => { if (!["TEXTAREA","INPUT","BUTTON"].includes(e.target.tagName)) {
      ED.sel = i; V().currentTime = s.start; renderRows(); } };
    tr.innerHTML = `
      <td class="hint">${i + 1}</td>
      <td><input type="number" step="0.1" value="${s.start}" ${dis}
        onchange="updSeg(${i},'start',this.value)" style="width:72px">${step("start")}</td>
      <td><input type="number" step="0.1" value="${s.end}" ${dis}
        onchange="updSeg(${i},'end',this.value)" style="width:72px">${step("end")}</td>
      <td style="color:#6b7280">${dur.toFixed(1)}s</td>
      <td><textarea ${dis} style="width:100%;min-height:34px;font-size:13px"
        onfocus="ED.sel=${i}" oninput="ED.segs[${i}].label=this.value;liveWm(${i},this)"
        onchange="updSeg(${i},'label',this.value)">${esc(s.label)}</textarea>
        <div style="font-size:11.5px;margin-top:2px">
          <span class="wm ${wcls}" id="wm${i}">${wc}/20 words</span>${issues.length ?
          issues.map((x) => `<span style="padding:1px 7px;border-radius:10px;margin-right:3px;
            background:${x[0] === "err" ? "#fee2e2" : "#fef3c7"};color:${x[0] === "err" ? "#dc2626" : "#d97706"}">
            ${esc(x[1])}</span>`).join("") :
          '<span style="color:#16a34a">&#10003; ok</span>'}
          ${s.note ? '<div style="color:#d97706">AI note: ' + esc(s.note) + "</div>" : ""}</div></td>
      <td style="white-space:nowrap">
        <button class="ghost" style="padding:2px 6px" title="play" onclick="ED.sel=${i};playSel()">&#9654;</button>
        ${R ? "" : `<button class="ghost" style="padding:2px 6px" title="split" onclick="splitRow(${i})">&#9986;</button>
        <button class="ghost" style="padding:2px 6px" title="merge with next" onclick="mergeRow(${i})">&#8595;</button>
        <button class="ghost" style="padding:2px 6px" title="delete" onclick="delRow(${i})">&#128465;</button>`}</td>`;
    rowsEl.appendChild(tr);
  });
  let errs = 0;
  ED.segs.forEach((s) => errs += lintLabel(s.label, s.end - s.start).filter((x) => x[0] === "err").length);
  const inc = consistencyWarnings(ED.segs);
  el("summary").innerHTML = `<b>${ED.segs.length}</b> segments &middot; ` +
    (errs ? `<b style="color:#dc2626">${errs} issue(s) to fix</b>`
          : `<b style="color:#16a34a">all checks clear</b>`) +
    (inc.length ? `<div style="font-size:12px;color:#d97706;margin-top:3px">&#9888;
     same object, different names: ${esc(inc.join(" · "))} - pick ONE name</div>` : "");
  const li = el("loopinfo");
  if (li) li.textContent = ED.sel >= 0 ? `segment ${ED.sel + 1} of ${ED.segs.length} selected` : "";
  renderTL();
  if (!window._readonly) {
    el("savestate").textContent = "unsaved changes…";
    clearTimeout(window._as); window._as = setTimeout(() => saveSegs(false), 1200);
  }
}
function updSeg(i, k, v) { ED.segs[i][k] = k === "label" ? v : parseFloat(v); renderRows(); }
function nudge(i, k, d) { ED.segs[i][k] = +(Math.max(0, (+ED.segs[i][k] || 0) + d)).toFixed(1);
  ED.sel = i; renderRows(); }
function liveWm(i, ta) {
  const e2 = el("wm" + i); if (!e2) return;
  const wc = (ta.value || "").toLowerCase().replace(/,/g, " ").split(/\s+/).filter(Boolean).length;
  e2.textContent = wc + "/20 words";
  e2.className = "wm " + (wc > 20 ? "over" : wc >= 17 ? "close" : "ok");
}
function addRow() { const p = ED.segs.length ? ED.segs[ED.segs.length - 1].end : 0;
  ED.segs.push({ start: +(+p).toFixed(1), end: +(+p + 2).toFixed(1), label: "" });
  ED.sel = ED.segs.length - 1; renderRows(); }
function delRow(i) { ED.segs.splice(i, 1); if (ED.sel >= ED.segs.length) ED.sel = ED.segs.length - 1; renderRows(); }
function splitRow(i) { const s = ED.segs[i];
  let m = V().duration ? +V().currentTime.toFixed(1) : +((s.start + s.end) / 2).toFixed(1);
  if (m <= s.start || m >= s.end) m = +((s.start + s.end) / 2).toFixed(1);
  ED.segs.splice(i + 1, 0, { ...s, start: m }); s.end = m; renderRows(); }
function mergeRow(i) {
  if (i >= ED.segs.length - 1) { el("msg").textContent = "No next segment to merge with."; return; }
  const a = ED.segs[i], b = ED.segs[i + 1];
  if ((b.end - a.start) > 10.01 && !confirm(
    `Merged segment will be ${(b.end - a.start).toFixed(1)}s (over 10s). Merge anyway?`)) return;
  a.end = b.end; if (!a.label && b.label) a.label = b.label;
  ED.segs.splice(i + 1, 1); ED.sel = i; renderRows();
}
function markStart() { if (window._readonly) return; if (ED.sel < 0) addRow();
  ED.segs[ED.sel].start = +V().currentTime.toFixed(1); renderRows(); }
function markEnd() { if (window._readonly) return; if (ED.sel < 0) addRow();
  ED.segs[ED.sel].end = +V().currentTime.toFixed(1); renderRows(); }
function newSeg() { if (window._readonly) return; const t = +V().currentTime.toFixed(1);
  ED.segs.push({ start: t, end: +(t + 2).toFixed(1), label: "" });
  ED.sel = ED.segs.length - 1; renderRows(); }
function playSel() { if (ED.sel < 0) return; const s = ED.segs[ED.sel];
  V().currentTime = s.start; ED.loopEnd = s.end; V().play(); }

async function saveSegs(manual) {
  if (window._readonly) return;
  try {
    await api("tasks", { method: "PATCH", body: { id: ED.task.id, segments: ED.segs } });
    el("savestate").textContent = "saved ✓";
  } catch (e) { el("savestate").textContent = "save failed: " + e.message; }
}
async function submitTask() {
  await saveSegs(true);
  if (!confirm("Submit for QA review?")) return;
  await api("tasks", { method: "PATCH", body: { id: ED.task.id, action: "submit" } });
  location.hash = "#/home"; render();
}
async function reviewTask(status) {
  await api("tasks", { method: "PATCH", body: {
    id: ED.task.id, action: "review", status, note: el("rvnote")?.value || "" } });
  location.hash = "#/admin"; render();
}

// ---------------------------------------------------------------- AI draft
async function aiDraft() {
  if (window._readonly) return;
  if (ED.segs.length && !confirm("Replace current segments with AI draft?")) return;
  const hint = prompt("Describe activity + objects so the AI names them correctly.\n" +
    "Example: person plucks stems off green chillies and drops chillies into clay bowl\n" +
    "(leave empty to skip)") || "";
  const btn = el("aibtn"); btn.disabled = true;
  try {
    el("msg").textContent = "Extracting frames from your local video…";
    const v = V();
    const sheets = await extractSheets(v, (p) =>
      el("msg").textContent = `Extracting frames… ${Math.round(p * 100)}%`);
    el("msg").textContent = "Sending frames to Claude - the video itself is not uploaded…";
    await api("aidraft-background", { method: "POST", body: {
      id: ED.task.id, hint, duration: v.duration, sheets } });
    el("msg").textContent = "Claude is studying the frames (1-3 minutes). Keep this page open…";
    const t0 = Date.now();
    while (Date.now() - t0 < 8 * 60e3) {
      await new Promise((r) => setTimeout(r, 5000));
      const d = await api("draft?id=" + ED.task.id);
      if (d.draft_status === "done") {
        ED.segs = splitMax10(d.draft.segments || []).map((s) => ({
          start: +s.start, end: +s.end, label: s.label || "",
          confidence: s.confidence || "", note: s.note || "" }));
        ED.sel = -1; renderRows();
        el("msg").textContent = "AI draft loaded - verify every segment against playback.";
        btn.disabled = false; return;
      }
      if (d.draft_status === "error") throw new Error(d.draft?.error || "draft failed");
    }
    throw new Error("Timed out - try again.");
  } catch (e) { el("msg").textContent = "AI draft failed: " + e.message; }
  btn.disabled = false;
}

async function extractSheets(mainVid, onProgress) {
  // sample the LOCAL video at 2 fps into 4x3 contact sheets with timestamps
  const v = document.createElement("video");
  v.muted = true; v.preload = "auto"; v.src = mainVid.currentSrc || ED.url;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
  const D = v.duration, stepT = 0.5, per = 12, cols = 4;
  const TW = 480, TH = 270;
  const times = []; for (let t2 = 0; t2 < D; t2 += stepT) times.push(t2);
  const nSheets = Math.ceil(times.length / per);
  let quality = nSheets > 16 ? 0.45 : 0.55;
  const sheets = [];
  for (let si = 0; si < nSheets; si++) {
    const canvas = document.createElement("canvas");
    canvas.width = TW * cols; canvas.height = TH * Math.ceil(per / cols);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const chunk = times.slice(si * per, (si + 1) * per);
    for (let i = 0; i < chunk.length; i++) {
      await seekTo(v, chunk[i]);
      const x = (i % cols) * TW, y = Math.floor(i / cols) * TH;
      ctx.drawImage(v, x, y, TW, TH);
      ctx.fillStyle = "#000"; ctx.fillRect(x, y, 96, 22);
      ctx.fillStyle = "#ff0"; ctx.font = "bold 15px monospace";
      const tt = chunk[i], mm = Math.floor(tt / 60), ss = (tt - mm * 60);
      ctx.fillText(`${mm}:${ss < 10 ? "0" : ""}${ss.toFixed(1)}`, x + 4, y + 16);
      onProgress?.((si * per + i + 1) / times.length);
    }
    sheets.push(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
  }
  // keep total request under ~3.4 MB of base64 text (Netlify limit is ~6 MB
  // and base64 + JSON overhead roughly doubles raw bytes)
  for (let pass = 0; pass < 3; pass++) {
    const total = sheets.reduce((a, s) => a + s.length, 0);
    if (total <= 3.4e6) break;
    const scale = Math.max(0.45, Math.sqrt(3.2e6 / total));
    for (let i = 0; i < sheets.length; i++) {
      const img = new Image();
      img.src = "data:image/jpeg;base64," + sheets[i];
      await new Promise((r) => img.onload = r);
      const c2 = document.createElement("canvas");
      c2.width = Math.round(img.width * scale); c2.height = Math.round(img.height * scale);
      c2.getContext("2d").drawImage(img, 0, 0, c2.width, c2.height);
      sheets[i] = c2.toDataURL("image/jpeg", 0.45).split(",")[1];
    }
  }
  return sheets;
}
function seekTo(v, t) {
  return new Promise((res) => {
    const done = () => { v.removeEventListener("seeked", done); res(); };
    v.addEventListener("seeked", done); v.currentTime = t;
  });
}

// ---------------------------------------------------------------- import
function toggleImport() { const d = el("importbox");
  d.style.display = d.style.display === "none" ? "block" : "none"; }
function importDraft() {
  if (window._readonly) return;
  let txt = el("importtxt").value.trim();
  if (!txt) { el("msg").textContent = "Paste the JSON reply first."; return; }
  txt = txt.replace(/```(json)?/g, "").replace(/[\r\n]+/g, " ");
  let list = null;
  try { const s = txt.indexOf("{"), e = txt.lastIndexOf("}");
    list = JSON.parse(txt.slice(s, e + 1)).segments; }
  catch { const m = txt.match(/\{[^{}]*"label"[^{}]*\}/g) || [];
    list = []; for (const o of m) { try { list.push(JSON.parse(o)); } catch {} } }
  if (!list || !list.length) { el("msg").textContent =
    "Could not read segments - copy the FULL JSON reply."; return; }
  if (ED.segs.length && !confirm("Replace current segments with imported draft?")) return;
  ED.segs = splitMax10(list).map((s) => ({ start: +s.start, end: +s.end,
    label: (s.label || "").replace(/\s+/g, " ").trim(),
    confidence: s.confidence || "", note: s.note || "" }));
  ED.sel = -1; renderRows(); saveSegs();
  el("importtxt").value = ""; toggleImport();
  el("msg").textContent = `Imported ${ED.segs.length} segments - verify against playback.`;
}

// ---------------------------------------------------------------- router
async function render() {
  const h = location.hash || "#/login";
  if (!store.token || !store.me) return viewLogin();
  try {
    if (h.startsWith("#/task/")) return await viewTask(+h.split("/")[2]);
    if (h === "#/admin" && store.me.role === "admin") return await viewAdmin();
    if (store.me.role === "admin") { location.hash = "#/admin"; return; }
    return await viewHome();
  } catch (e) {
    document.getElementById("root").innerHTML =
      `<div style="padding:40px"><p class="err">${esc(e.message)}</p>
       <a class="btn" href="#/${store.me?.role === "admin" ? "admin" : "home"}"
       onclick="render()">Back</a></div>`;
  }
}
window.addEventListener("hashchange", render);
render();
