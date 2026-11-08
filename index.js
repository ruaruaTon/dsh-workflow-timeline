/* @local/workflow-timeline · host 半 v2
 * ① ctx.on("workflow/*") 收引擎事件 → 内存 run 状态
 * ② /api/workflow-timeline/runs 快照（面板轮询）
 * ③ /api/workflow-timeline/settings 读写阶段配置（模型/并发）
 * 路由形态照抄任务看板：WebRoute { kind:'exact', path, handler } + ctx.webServer.register
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const name = "workflow-timeline";
const inject = ["webServer"];

const SETTINGS_DIR = join(homedir(), ".dsh");
const SETTINGS_PATH = join(SETTINGS_DIR, "workflow-timeline-settings.json");
const RUNNAMES_PATH = join(SETTINGS_DIR, "workflow-timeline-runnames.json");

function readRunNames() {
  try {
    const j = JSON.parse(readFileSync(RUNNAMES_PATH, "utf8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}

function writeRunNames(map) {
  try {
    mkdirSync(SETTINGS_DIR, { recursive: true });
    writeFileSync(RUNNAMES_PATH, JSON.stringify(map, null, 2) + "\n", "utf8");
    return true;
  } catch { return false; }
}

const RUNS_PATH = join(SETTINGS_DIR, "workflow-timeline-runs.json");

function readSavedRuns() {
  try {
    const j = JSON.parse(readFileSync(RUNS_PATH, "utf8"));
    return j && Array.isArray(j.runs) ? j.runs.filter((r) => r && r.id) : [];
  } catch { return []; }
}
const DEFAULT_SETTINGS = { phases: [], defaultModel: "", defaultConcurrency: 8 };

function readSettings() {
  try {
    const raw = readFileSync(SETTINGS_PATH, "utf8");
    const j = JSON.parse(raw);
    if (!j || !Array.isArray(j.phases)) return DEFAULT_SETTINGS;
    return j;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function writeSettings(settings) {
  try {
    mkdirSync(SETTINGS_DIR, { recursive: true });
    writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
    return true;
  } catch (e) {
    return false;
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => { data += chunk; if (data.length > 1e6) { req.destroy(); resolve(null); } });
    req.on("end", () => resolve(data));
    req.on("error", () => resolve(null));
  });
}

function apply(ctx) {
  const runs = new Map();
  const order = [];
  const MAX_RUNS = 50;
  let runNames = readRunNames(); // runId -> 自定义名

  // 启动时恢复上次的历史 runs（持久化）
  try {
    for (const r of readSavedRuns().slice(-MAX_RUNS)) { runs.set(r.id, r); order.push(r.id); }
    if (order.length && ctx.logger && ctx.logger.info) ctx.logger.info("workflow-timeline: restored " + order.length + " runs from disk");
  } catch (e) { try { ctx.logger && ctx.logger.warn && ctx.logger.warn("workflow-timeline[restore]: " + String(e)); } catch {} }

  // 防抖持久化：事件后 2 秒写盘
  let saveTimer = undefined;
  const scheduleSave = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      try {
        const list = order.map((id) => runs.get(id)).filter(Boolean);
        mkdirSync(SETTINGS_DIR, { recursive: true });
        writeFileSync(RUNS_PATH, JSON.stringify({ savedAt: Date.now(), runs: list }, null, 2) + "\n", "utf8");
      } catch (e) { logError2("save", e); }
    }, 2000);
  };
  function logError2(where, e) { try { ctx.logger && ctx.logger.warn && ctx.logger.warn("workflow-timeline[" + where + "]: " + String(e)); } catch {} }

  function ensure(info) {
    let run = runs.get(info.id);
    if (!run) {
      run = { id: info.id, name: (info.meta && info.meta.name) || "workflow", startedAt: Date.now(), endedAt: 0, stopReason: "", phases: [], agents: [], logs: [] };
      runs.set(info.id, run);
      order.push(info.id);
      while (order.length > MAX_RUNS) runs.delete(order.shift());
    }
    scheduleSave();
    return run;
  }

  function logError(where, e) {
    try { if (ctx.logger && ctx.logger.warn) ctx.logger.warn("workflow-timeline[" + where + "]: " + String(e)); } catch {}
  }

  ctx.on("workflow/start", (info) => { try { ensure(info); } catch (e) { logError("start", e); } });
  ctx.on("workflow/phase", (info, title) => { try { const r = ensure(info); if (title) r.phases.push({ title, at: Date.now() }); } catch (e) { logError("phase", e); } });
  ctx.on("workflow/log", (info, message) => { try { const r = ensure(info); if (message) r.logs.push(String(message).slice(0, 300)); if (r.logs.length > 40) r.logs.shift(); } catch (e) {} });
  ctx.on("workflow/agent-start", (info, agent) => {
    try {
      const r = ensure(info);
      r.agents.push({ seq: agent.seq, label: agent.label, phase: agent.phase, childId: agent.childId, status: "running", at: Date.now() });
    } catch (e) { logError("agent-start", e); }
  });
  ctx.on("workflow/agent-end", (info, agent) => {
    try {
      const r = ensure(info);
      const a = r.agents.find((x) => x.seq === agent.seq);
      if (a) {
        const s = String(agent.outcome || "").toLowerCase();
        a.status = /fail|error|cancel|abort/.test(s) ? "failed" : "done";
        a.outcome = agent.outcome;
        a.endedAt = Date.now();
      }
    } catch (e) { logError("agent-end", e); }
  });
  ctx.on("workflow/end", (info, payload) => {
    try {
      const r = ensure(info);
      r.endedAt = Date.now();
      r.stopReason = payload && payload.stopReason ? String(payload.stopReason) : "";
      if (payload && payload.agentsStarted !== undefined) r.agentsStarted = payload.agentsStarted;
      r.agents.forEach((a) => { if (a.status === "running") a.status = "done"; });
    } catch (e) { logError("end", e); }
  });

  // 兜底：异常中断的 run（end 事件丢失）30 分钟后标记为中断，避免面板永远转圈
  const SWEEP_MS = 30000, STALE_MS = 30 * 60 * 1000;
  const sweep = setInterval(() => {
    try {
      const now = Date.now();
      for (const id of order) {
        const r = runs.get(id);
        if (r && r.endedAt === 0 && now - r.startedAt > STALE_MS) {
          r.endedAt = now;
          r.stopReason = r.stopReason || "stale-interrupted";
          r.agents.forEach((a) => { if (a.status === "running") a.status = "failed"; });
        }
      }
      scheduleSave();
    } catch {}
  }, SWEEP_MS);
  if (ctx.effect) ctx.effect(() => () => clearInterval(sweep));

  const API = "/api/workflow-timeline";
  try {
    const routes = [
      {
        kind: "exact",
        path: API + "/runs",
        handler: (req, res) => {
          if (req.method !== "GET") { res.writeHead(405); res.end(); return; }
          const list = order.map((id) => runs.get(id)).filter(Boolean).map((r) => Object.assign({}, r, { displayName: runNames[r.id] || "" }));
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ now: Date.now(), runs: list }));
        }
      },
      {
        kind: "exact",
        path: API + "/settings",
        handler: async (req, res) => {
          if (req.method === "GET") {
            res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify(readSettings()));
            return;
          }
          if (req.method === "POST") {
            const body = await readBody(req);
            let j = null;
            try { j = JSON.parse(body || ""); } catch {}
            if (!j || !Array.isArray(j.phases)) {
              res.writeHead(400, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "invalid-settings" }));
              return;
            }
            const ok = writeSettings(j);
            res.writeHead(ok ? 200 : 500, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: ok }));
            return;
          }
          res.writeHead(405); res.end();
        }
      },
      {
        kind: "exact",
        path: API + "/rename",
        handler: async (req, res) => {
          if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
          const body = await readBody(req);
          let j = null;
          try { j = JSON.parse(body || ""); } catch {}
          if (!j || typeof j.runId !== "string" || !runs.has(j.runId) || typeof j.name !== "string" || j.name.length > 60) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "invalid-rename" }));
            return;
          }
          runNames[j.runId] = j.name.trim().slice(0, 60);
          const ok = writeRunNames(runNames);
          res.writeHead(ok ? 200 : 500, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: ok, name: runNames[j.runId] }));
        }
      },
      {
        kind: "exact",
        path: API + "/delete",
        handler: async (req, res) => {
          if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
          const body = await readBody(req);
          let j = null;
          try { j = JSON.parse(body || ""); } catch {}
          if (!j || typeof j.runId !== "string" || !runs.has(j.runId)) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "unknown-run" }));
            return;
          }
          runs.delete(j.runId);
          const i = order.indexOf(j.runId);
          if (i >= 0) order.splice(i, 1);
          if (runNames[j.runId]) { delete runNames[j.runId]; writeRunNames(runNames); }
          scheduleSave();
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        }
      }
    ];
    for (const route of routes) ctx.webServer.register(route);
    if (ctx.logger && ctx.logger.info) ctx.logger.info("workflow-timeline: routes mounted (runs + settings)");
  } catch (error) {
    logError("mount-failed", error);
  }
}

export { apply, inject, name };
