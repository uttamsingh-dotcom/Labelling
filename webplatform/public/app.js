/* LabelDesk SPA - videos stay on the labeller's computer; only labels are stored. */
"use strict";
const APP_VER = "v4";

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
        <div style="margin-bottom:8px">${me.role} &middot; ${APP_VER}</div>
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
        <button class="ghost" onclick="toggleImport()">&#128229; Paste AI result</button>
        <button class="ghost" onclick="testFrames()">&#128269; Test frames</button>
        <button class="ghost" onclick="copyDebug()">&#128203; Copy AI debug</button></div>
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
    d.onclick = (e) => { e.stopPropagation(); ED.sel = i; V().currentTime = a;
      if (el("loopchk")?.checked) V().play();
      renderRows(); };
    box.appendChild(d);
  });
}
async function testFrames() {
  // zero-cost check: show exactly what Claude would see from mid-video
  try {
    const v = V();
    if (!v || !v.duration) { el("msg").textContent = "Load the video first."; return; }
    el("msg").textContent = "Capturing test frames…";
    const mid = v.duration / 2;
    const sheets = await extractSheets(v, null,
      { fps: 1, cols: 2, rows: 2, tileW: 720, tileH: 405, quality: 0.6,
        from: mid, to: mid + 4 });
    const div = document.createElement("div");
    div.className = "modalbg";
    div.innerHTML = `<div class="modal" style="width:min(860px,95vw)">
      <h3>This is what Claude sees (4 frames from mid-video)</h3>
      <img src="data:image/jpeg;base64,${sheets[0]}" style="width:100%;border-radius:8px">
      <p class="hint">If this image is black/blank or unrecognisable, frame capture
      is failing in your browser - tell your admin. If you can see the video
      content clearly here, frames ARE reaching Claude.</p>
      <div style="text-align:right;margin-top:10px">
        <button onclick="this.closest('.modalbg').remove()">Close</button></div></div>`;
    document.body.appendChild(div);
    el("msg").textContent = "";
  } catch (e) { el("msg").textContent = "Test frames failed: " + e.message; }
}
function copyDebug() {
  const d = window._draftDebug;
  if (!d) { el("msg").textContent = "No AI draft has run yet in this session."; return; }
  const txt = JSON.stringify(d, null, 1);
  try { navigator.clipboard.writeText(txt); el("msg").textContent =
    "Debug report copied - paste it to your admin / support chat."; }
  catch { console.log(txt); el("msg").textContent =
    "Copy failed - debug printed to browser console (F12)."; }
}
function loopPlay(i) {
  // called when a label textarea gets focus: select + loop that segment
  ED.sel = i; const s = ED.segs[i]; const v = V();
  if (!s || !v || !v.duration) return;
  if (v.currentTime < s.start - 0.05 || v.currentTime >= s.end) v.currentTime = s.start;
  if (el("loopchk")?.checked) v.play();
  renderTL();   // highlight only - no row re-render, keeps the textarea focused
  const li = el("loopinfo");
  if (li) li.textContent = `segment ${i + 1} of ${ED.segs.length} selected`;
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
      ED.sel = i; V().currentTime = s.start;
      if (el("loopchk")?.checked) V().play();
      renderRows(); } };
    tr.innerHTML = `
      <td class="hint">${i + 1}</td>
      <td><input type="number" step="0.1" value="${s.start}" ${dis}
        onchange="updSeg(${i},'start',this.value)" style="width:72px">${step("start")}</td>
      <td><input type="number" step="0.1" value="${s.end}" ${dis}
        onchange="updSeg(${i},'end',this.value)" style="width:72px">${step("end")}</td>
      <td style="color:#6b7280">${dur.toFixed(1)}s</td>
      <td><textarea ${dis} style="width:100%;min-height:34px;font-size:13px"
        onfocus="loopPlay(${i})" oninput="ED.segs[${i}].label=this.value;liveWm(${i},this)"
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
  let gaps = 0, overs = 0;
  const srt = [...ED.segs].sort((a, b) => a.start - b.start);
  for (let k = 1; k < srt.length; k++) {
    const d = srt[k].start - srt[k - 1].end;
    if (d > 0.31) gaps++; else if (d < -0.31) overs++;
  }
  el("summary").innerHTML = `<b>${ED.segs.length}</b> segments &middot; ` +
    (errs ? `<b style="color:#dc2626">${errs} issue(s) to fix</b>`
          : `<b style="color:#16a34a">all checks clear</b>`) +
    (inc.length ? `<div style="font-size:12px;color:#d97706;margin-top:3px">&#9888;
     same object, different names: ${esc(inc.join(" · "))} - pick ONE name</div>` : "") +
    ((gaps || overs) ? `<div style="font-size:12px;color:#d97706;margin-top:3px">&#9888;
     timeline not contiguous: ${gaps ? gaps + " gap(s)" : ""}${gaps && overs ? ", " : ""}
     ${overs ? overs + " overlap(s)" : ""} between segments - fix starts/ends</div>` : "");
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
const GUIDELINES = `You are an expert egocentric-video action annotator. You receive contact
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
5. ONE CONSISTENT OBJECT NAME across ALL segments.
6. TOOL PHRASING: "<action> <object> with <tool> in <hand>".
7. VERB CONSISTENCY: one verb per repeated activity.

OUTPUT: return ONLY valid JSON:
{"segments":[{"start":0.0,"end":2.0,"label":"...","confidence":"high|medium|low",
"note":"what to verify, only if uncertain"}]}
Times in seconds, one decimal. Verify every segment is <=10.0 s and every label
names hand + specific action + specific object.`;

function showDraftForm(taskId) {
  return new Promise((res) => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem("ld_df_" + taskId) || "{}"); } catch {}
    const div = document.createElement("div");
    div.className = "modalbg";
    div.innerHTML = `<div class="modal"><h3>AI draft - tell Claude what it is seeing</h3>
      <p class="hint">Watch the video once first. What you type here becomes the
      ground truth - the AI is not allowed to invent anything beyond it.</p>
      <p style="margin:10px 0 4px"><b>Activity</b> (one line)</p>
      <input id="dfact" style="width:100%"
        placeholder="e.g. packing earbuds into small plastic pouches"
        value="${esc(saved.activity || "")}">
      <p style="margin:12px 0 4px"><b>Objects</b> - EXACT names to use in labels, comma separated</p>
      <input id="dfobj" style="width:100%"
        placeholder="e.g. earbuds, plastic pouch, tray, scissors"
        value="${esc(saved.objects || "")}">
      <p class="hint" style="margin-top:6px">Claude may ONLY use these object names,
      exactly as written. Anything else it sees gets a colour+shape description,
      never an invented name. No extra adjectives will be added to your names.</p>
      <p style="margin:12px 0 4px"><b>Draft quality</b></p>
      <label class="hint" style="display:block;cursor:pointer">
        <input type="radio" name="dfq" value="std" ${saved.quality !== "high" ? "checked" : ""}>
        Standard (~Rs 8-10) - fast, hands may need more fixing</label>
      <label class="hint" style="display:block;cursor:pointer">
        <input type="radio" name="dfq" value="high" ${saved.quality === "high" ? "checked" : ""}>
        High accuracy (~Rs 18-25) - stronger model watches the frames; better hands & atomic actions</label>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">
        <button class="ghost" id="dfcancel">Cancel</button>
        <button id="dfgo">Start draft</button></div></div>`;
    document.body.appendChild(div);
    div.querySelector("#dfcancel").onclick = () => { div.remove(); res(null); };
    div.querySelector("#dfgo").onclick = () => {
      const val = { activity: el("dfact").value.trim(), objects: el("dfobj").value.trim(),
        quality: div.querySelector('input[name="dfq"]:checked')?.value || "std" };
      try { localStorage.setItem("ld_df_" + taskId, JSON.stringify(val)); } catch {}
      div.remove(); res(val);
    };
  });
}

async function aiDraft() {
  if (window._readonly) return;
  if (ED.segs.length && !confirm("Replace current segments with AI draft?")) return;
  const form = await showDraftForm(ED.task.id);
  if (!form) return;
  const hint = form.activity ? `Activity: ${form.activity}.` : "";
  const objects = (form.objects || "").split(",").map((t) => t.trim()).filter(Boolean);
  const high = form.quality === "high";
  const btn = el("aibtn"); btn.disabled = true;
  try {
    el("msg").textContent = "Preparing…";
    const cfg = await api("aikey?hint=" +
      encodeURIComponent(hint + " " + ED.task.title));
    const v = V();
    // high-resolution sheets (2x2, 1 fps) - hands clearly visible
    const hiSheets = await extractSheets(v, (p) =>
      el("msg").textContent = `Extracting high-res frames… ${Math.round(p * 100)}%`,
      { fps: 1, cols: 2, rows: 2, tileW: high ? 854 : 720, tileH: high ? 480 : 405,
        quality: 0.6 });
    // standard sheets (4x3, 2 fps) - fine time resolution for action order
    const stdSheets = await extractSheets(v, (p) =>
      el("msg").textContent = `Extracting 2fps frames… ${Math.round(p * 100)}%`,
      { fps: 2, cols: 4, rows: 3, tileW: high ? 384 : 288, tileH: high ? 216 : 162,
        quality: 0.5 });
    const { segs, cost } = await callClaude(cfg, hiSheets, stdSheets, v.duration,
      hint, objects, high);
    ED.segs = splitMax10(segs).map((s) => ({
      start: +s.start, end: +s.end, label: s.label || "",
      confidence: s.confidence || "", note: s.note || "" }));
    ED.sel = -1; renderRows(); saveSegs();
    el("msg").textContent = `AI draft loaded (cost ~Rs ${cost.toFixed(1)}) - ` +
      "verify every segment against playback.";
  } catch (e) { el("msg").textContent = "AI draft failed: " + e.message; }
  btn.disabled = false;
}

const RATES = {   // USD per million tokens {in, out}
  sonnet: { i: 3, o: 15 }, haiku: { i: 1, o: 5 } };
function modelRate(m) { return /haiku/i.test(m) ? RATES.haiku : RATES.sonnet; }

async function callClaude(cfg, hiSheets, stdSheets, duration, hint, objects = [], high = false) {
  let usd = 0;
  const vm = high ? cfg.model : (cfg.visionModel || cfg.model);

  async function ask(model, text, sheets, maxTokens) {
    const content = [{ type: "text", text }];
    for (const s of (sheets || []))
      content.push({ type: "image", source: {
        type: "base64", media_type: "image/jpeg", data: s } });
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model, max_tokens: maxTokens,
        messages: [{ role: "user", content }] }),
    });
    if (!r.ok) {
      let msg = "";
      try { msg = (await r.json())?.error?.message || ""; } catch {}
      throw new Error("Claude API error " + r.status + (msg ? ": " + msg.slice(0, 200) : ""));
    }
    const data = await r.json();
    const u = data.usage || {}, rate = modelRate(model);
    usd += (u.input_tokens || 0) / 1e6 * rate.i + (u.output_tokens || 0) / 1e6 * rate.o;
    return (data.content || []).map((p) => p.text || "").join("");
  }

  function parseSegs(text) {
    text = text.replace(/```(json)?/g, "");
    const s = text.indexOf("{"), e2 = text.lastIndexOf("}");
    try { return JSON.parse(text.slice(s, e2 + 1)); }
    catch {
      const m = text.match(/\{[^{}]*"label"[^{}]*\}/g) || [];
      const arr = [];
      for (const o of m) { try { arr.push(JSON.parse(o)); } catch {} }
      if (!arr.length) throw new Error("Claude reply could not be parsed - try again");
      return { segments: arr };
    }
  }

  const HANDRULE =
`HAND IDENTIFICATION (critical - never assume): this is an egocentric (first
person) view. The person's LEFT hand/arm enters from the LOWER-LEFT of the
frame, the RIGHT hand/arm from the LOWER-RIGHT. Track each arm from its side
across consecutive frames. When arms cross, follow the arm, not the position.
If you cannot clearly see which hand acts in a frame, check the adjacent
frames of the same sheet. Never write a hand you did not verify visually.`;

  const OBJRULE = objects.length ?
`ALLOWED OBJECT NAMES - these are the ONLY object names permitted anywhere in
your output, written EXACTLY as given (letter for letter, no additions):
${objects.join("; ")}.
- Do NOT invent, rename, or guess any other object name.
- If hands touch something not in this list, describe it by colour + shape
  (e.g. 'white round container') - never a guessed name.
- Do NOT add descriptors (colour, material, size, position) to these names.
  Use the bare name exactly as listed.` :
`OBJECT NAMES: name only objects you can clearly see. If uncertain, describe
by colour + shape instead of guessing. No descriptors unless two similar
objects must be told apart.`;

  const LENRULE =
`SEGMENT LENGTH: typical segments are 2-8 seconds. A segment close to 10 s is
allowed ONLY for a genuinely repeated cycle (5+ repetitions of the same short
action). NEVER produce uniform equal-length segments - boundaries must sit at
visible moments where hands engage/disengage or the goal changes.`;

  const ATOMRULE =
`ATOMIC ACTION COMPLETENESS (mandatory): every time an object leaves a surface
there is a 'pick up'; every time an object is set down there is a 'place'.
Include shift, pass, flip, turn, pour, wipe when they happen. A segment
description that skips these actions is WRONG. List actions in the exact
order they occur - never reorder.`;

  const NOFAKE =
`REALITY CHECK FIRST: confirm you can actually see photographic video frames
attached to this message. If there are no images, or they are blank/black/
unreadable, respond with EXACTLY {"error":"no frames"} and NOTHING else.
NEVER describe, guess, or infer video content you cannot literally see -
fabricated output is the worst possible failure.`;

  function assertFrames(reply, stage) {
    if (/"error"\s*:\s*"no frames"/i.test(reply))
      throw new Error("Claude reports the frames were blank/unreadable (stage " +
        stage + "). Play the video for a second, keep the tab visible, then try again.");
  }

  // ---- STAGE 1 (vision model, HIGH-RES 1 fps): see objects, phases, hands, draft
  el("msg").textContent = "Stage 1/3: reviewing video in high resolution…";
  const s1 = await ask(vm,
`${NOFAKE}
Watch ALL frames of this egocentric video start to finish (timestamps on
frames; total ${duration.toFixed(1)} s). Frames are high resolution, 1 per second.
${hint ? "Annotator context (trust it): " + hint : ""}
${HANDRULE}
${OBJRULE}
${LENRULE}
${ATOMRULE}
Return ONLY JSON:
{"activity":"one line",
 "phases":[{"start":0.0,"end":0.0,"what":"goal in this span"}],
 "hand_pattern":"exactly what LEFT hand does vs RIGHT hand, and when roles change",
 "segments":[{"start":0.0,"end":0.0,"actions":"plain description of what happens,
  in order, naming which hand does each thing"}]}
Segment rules: max 10 s each, cover 0.0 to ${duration.toFixed(1)} contiguously,
boundaries where hands engage/disengage or goal changes, max 3 actions inside
one segment - split if more. Watch to the very end - activities change.`,
    hiSheets, 3500);
  assertFrames(s1, 1);

  // ---- STAGE 2 (vision model, 2 fps): verify ORDER + hands against time
  el("msg").textContent = "Stage 2/3: verifying action order and hands at 2 fps…";
  const s2 = await ask(vm,
`${NOFAKE}
These frames are sampled at 2 per second (timestamps on frames; total
${duration.toFixed(1)} s). Below is a draft analysis made from 1 fps frames.
${HANDRULE}
${OBJRULE}
${LENRULE}
DRAFT:\n${s1}\n
Your job - verify every draft segment against these 2 fps frames:
1. ORDER: are the actions inside each segment in the exact order they happen?
   Fix any wrong order.
2. HANDS: is each action assigned to the correct hand? Fix any wrong hand.
3. BOUNDARIES: adjust start/end to where the engagement really changes;
   segments must stay contiguous, max 10 s, and cover the full
   ${duration.toFixed(1)} s. Split any segment that mixes different goals.
4. MISSED ACTIONS: ${ATOMRULE}
Return ONLY JSON: {"segments":[{"start":0.0,"end":0.0,"actions":"corrected
plain description, in order, with verified hands"}]}`,
    stdSheets, 3500);
  assertFrames(s2, 2);

  // ---- STAGE 3 (text model, NO images): write SOP-grammar labels
  el("msg").textContent = "Stage 3/3: writing labels in client grammar…";
  let ctx =
`Video length: EXACTLY ${duration.toFixed(1)} s. Below are verified segment
descriptions from frame analysis (order and hands already checked - do NOT
change hands, order, or timings; only rewrite wording into label grammar):
${s2}
${OBJRULE}
Convert each segment description into ONE label following every rule above.
If a description contains more than 3 atomic actions, split that segment.
Keep segments contiguous and <=10 s. Do not drop any action that is in the
description - every pick up, place, shift, pass must appear in the label,
in the same order.`;
  if (hint) ctx += `\nAnnotator context: ${hint}`;
  if (cfg.examples && cfg.examples.length)
    ctx += "\nMatch the style of these human-verified examples:" +
      cfg.examples.map((x) => `\nQA-APPROVED EXAMPLE from '${x.title}':\n` +
        JSON.stringify({ segments: x.segments })).join("");
  const s3 = await ask(cfg.model, GUIDELINES + "\n\n" + ctx, null, 4000);

  window._draftDebug = {
    ver: APP_VER, when: new Date().toISOString(),
    visionModel: vm, textModel: cfg.model,
    hiSheets: hiSheets.length, stdSheets: stdSheets.length,
    hiBytes: hiSheets.reduce((a, s) => a + s.length, 0),
    stage1: s1.slice(0, 1500), stage2: s2.slice(0, 1500), stage3: s3.slice(0, 1500),
  };
  console.log("LabelDesk draft debug", window._draftDebug);

  // ---- MECHANICAL ENFORCEMENT: limits are guaranteed by code, not trust
  let segs = (parseSegs(s3).segments || [])
    .filter((x) => isFinite(+x.start) && isFinite(+x.end))
    .map((x) => ({ ...x, start: Math.max(0, +x.start),
      end: Math.min(duration, +x.end) }))
    .filter((x) => x.end - x.start >= 0.2)
    .sort((a, b) => a.start - b.start);

  // repair pass: any label breaking word/action limits goes back once, text-only
  const broken = [];
  segs.forEach((x, i) => {
    const bad = lintLabel(x.label, x.end - x.start)
      .some((y) => y[0] === "err" && /words|separators/.test(y[1]));
    if (bad) broken.push({ i, start: x.start, end: x.end, label: x.label });
  });
  if (broken.length) {
    el("msg").textContent = "Fixing labels that break word/action limits…";
    try {
      const rep = await ask(cfg.model,
`These labels violate limits (max 20 words; max 3 atomic actions = max 2
separators, comma between different-hand actions, 'and' only same-hand).
Rewrite each to comply WITHOUT changing hands, actions, order, objects or
timings. Drop filler words first; if a label truly contains more than 3 atomic
actions, split it into consecutive segments inside the same time range.
${JSON.stringify({ broken })}
Return ONLY JSON: {"fixes":[{"i":0,"segments":[{"start":0.0,"end":0.0,"label":"..."}]}]}`,
        null, 1500);
      const fixes = parseSegs(rep).fixes || JSON.parse(
        rep.replace(/```(json)?/g, "").trim()).fixes || [];
      const map = {};
      for (const f of fixes) map[f.i] = f.segments || [];
      const merged = [];
      segs.forEach((x, i) => {
        if (map[i] && map[i].length) merged.push(...map[i].map((n) => ({
          ...x, ...n })));
        else merged.push(x);
      });
      segs = merged;
    } catch { /* keep originals; checker flags them for the labeller */ }
  }
  return { segs, cost: usd * 90 };  // rough USD->INR
}

async function extractSheets(mainVid, onProgress, opt = {}) {
  // sample the LOCAL video into contact sheets with timestamps
  const v = document.createElement("video");
  v.muted = true; v.preload = "auto"; v.src = mainVid.currentSrc || ED.url;
  await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
  // force the decoder awake - some browsers deliver black frames until playback
  try { await v.play(); await new Promise((r) => setTimeout(r, 150)); v.pause(); } catch {}
  if (v.readyState < 2)
    await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
  const D = v.duration, stepT = 1 / (opt.fps || 2), cols = opt.cols || 4;
  const per = cols * (opt.rows || 3);
  const TW = opt.tileW || 480, TH = opt.tileH || 270;
  const from = opt.from || 0, to = Math.min(D, opt.to || D);
  const times = []; for (let t2 = from; t2 < to; t2 += stepT) times.push(t2);
  const nSheets = Math.ceil(times.length / per);
  let quality = opt.quality || (nSheets > 16 ? 0.45 : 0.55);
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
    if (canvasBlank(canvas)) {
      // one retry for this sheet after nudging the decoder
      try { await v.play(); await new Promise((r) => setTimeout(r, 200)); v.pause(); } catch {}
      const retryCtx = canvas.getContext("2d");
      for (let i = 0; i < chunk.length; i++) {
        await seekTo(v, chunk[i]);
        retryCtx.drawImage(v, (i % cols) * TW, Math.floor(i / cols) * TH, TW, TH);
      }
      if (canvasBlank(canvas))
        throw new Error("Frame capture failed (blank frames from your browser). " +
          "Use Chrome or Edge, keep this tab visible during extraction, play the " +
          "video for a second first, then try AI draft again.");
    }
    sheets.push(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
  }
  // frames go straight to the Claude API (no Netlify size cap);
  // stay comfortably under Anthropic's request limit
  for (let pass = 0; pass < 3; pass++) {
    const total = sheets.reduce((a, s) => a + s.length, 0);
    if (total <= 1.8e7) break;
    const scale = Math.max(0.45, Math.sqrt(1.6e7 / total));
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
    let finished = false;
    const finish = () => { if (!finished) { finished = true; res(); } };
    const onSeek = () => {
      v.removeEventListener("seeked", onSeek);
      // wait for the frame to actually be painted, not just the seek to land
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(() => finish());
      else setTimeout(finish, 50);
    };
    v.addEventListener("seeked", onSeek);
    v.currentTime = Math.min(Math.max(0, t), Math.max(0, v.duration - 0.05));
    setTimeout(finish, 2000);            // safety net
  });
}
function canvasBlank(canvas) {
  // sample pixels; near-zero average luminance = capture failed (black frames)
  const ctx2 = canvas.getContext("2d");
  const d = ctx2.getImageData(0, 0, canvas.width, canvas.height).data;
  let sum = 0, n = 0;
  for (let p = 0; p < d.length; p += 4 * 601) { sum += d[p] + d[p + 1] + d[p + 2]; n++; }
  return (sum / (n * 3)) < 8;
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
