/* @local/workflow-timeline · host 半 v4
 * ① ctx.on("workflow/*") 收引擎事件 → 内存 run 状态（含 meta.phases 声明透传）
 * ② /api/workflow-timeline/runs 快照（面板轮询）
 * ③ /api/workflow-timeline/settings 读写阶段配置（并发等面板私有项）
 * ④ /api/workflow-timeline/overrides 读写 ~/.dsh/workflow-overrides.json
 *    （phase 模型覆盖约定文件：{ workflowName: { phaseTitle: { provider, model } } }，
 *      Router 下发 workflow 时读它转 args.modelOverrides → 脚本按阶段套用 → 真生效）
 * ⑤ /api/workflow-timeline/delete-all 清空全部 runs：内存+改名映射清零并【立即落盘】，
 *    不走 2 秒防抖——断电/秒重启都不会复活旧记录（面板头部「🗑 清空全部」走这里）
 * 路由形态照抄任务看板：WebRoute { kind:'exact', path, handler } + ctx.webServer.register
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const name = "workflow-timeline";
const inject = ["webServer"];

const SETTINGS_DIR = process.env.WORKFLOW_TIMELINE_HOME || join(homedir(), ".dsh"); // 环境变量仅供冒烟测试隔离落盘
const SETTINGS_PATH = join(SETTINGS_DIR, "workflow-timeline-settings.json");
const RUNNAMES_PATH = join(SETTINGS_DIR, "workflow-timeline-runnames.json");
const OVERRIDES_PATH = join(SETTINGS_DIR, "workflow-overrides.json");

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

/* ═══ phase 模型覆盖（workflow-overrides.json）═══
 * 结构：{ "<workflowName>": { "<phaseTitle>": { "provider": "...", "model": "..." } } }
 * 约定以 default-workspace/docs/plugin-workflow-overrides-需求书.md 为准；改键名双方同步。
 */
function readOverrides() {
  try {
    const j = JSON.parse(readFileSync(OVERRIDES_PATH, "utf8"));
    return j && typeof j === "object" && !Array.isArray(j) ? j : {};
  } catch { return {}; }
}

function writeOverridesMap(map) {
  mkdirSync(SETTINGS_DIR, { recursive: true });
  writeFileSync(OVERRIDES_PATH, JSON.stringify(map, null, 2) + "\n", "utf8");
}

/** 上/下传一条覆盖：provider+model 全空 = 删除该键（回到继承/声明值）。返回 {ok, error?, overrides?} */
function setOverride(workflowName, phaseTitle, provider, model) {
  const wf = String(workflowName || "").trim();
  const ph = String(phaseTitle || "").trim();
  if (!wf || wf.length > 120) return { ok: false, error: "invalid-workflow-name" };
  if (!ph || ph.length > 120) return { ok: false, error: "invalid-phase-title" };
  const p = String(provider || "").trim().slice(0, 80);
  const m = String(model || "").trim().slice(0, 120);
  let map;
  try {
    map = readOverrides();
    const entries = map[wf] && typeof map[wf] === "object" && !Array.isArray(map[wf]) ? map[wf] : {};
    if (!p && !m) delete entries[ph];
    else entries[ph] = { provider: p, model: m };
    if (Object.keys(entries).length === 0) delete map[wf];
    else map[wf] = entries;
    writeOverridesMap(map);
  } catch (e) {
    return { ok: false, error: "write-failed" };
  }
  return { ok: true, overrides: map };
}

/** 从 workflow/start 的 meta 里取 phases 声明（title 必有；provider/model 可选），供面板显示「声明值」 */
function extractMetaPhases(meta) {
  try {
    if (meta && Array.isArray(meta.phases)) {
      return meta.phases
        .filter((p) => p && typeof p.title === "string")
        .map((p) => Object.assign({ title: String(p.title).slice(0, 120) },
          typeof p.provider === "string" && p.provider ? { provider: p.provider.slice(0, 80) } : {},
          typeof p.model === "string" && p.model ? { model: p.model.slice(0, 120) } : {}));
    }
  } catch {}
  return [];
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

  // 持久化：事件后 2 秒防抖写盘；删除类操作用 writeRunsNow 立即落盘（秒重启/断电也不复活）
  let saveTimer = undefined;
  function writeRunsNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = undefined; }
    try {
      const list = order.map((id) => runs.get(id)).filter(Boolean);
      mkdirSync(SETTINGS_DIR, { recursive: true });
      writeFileSync(RUNS_PATH, JSON.stringify({ savedAt: Date.now(), runs: list }, null, 2) + "\n", "utf8");
      return true;
    } catch (e) { logError2("save", e); return false; }
  }
  const scheduleSave = () => {
    if (saveTimer) return;
    saveTimer = setTimeout(() => { saveTimer = undefined; writeRunsNow(); }, 2000);
  };
  function logError2(where, e) { try { ctx.logger && ctx.logger.warn && ctx.logger.warn("workflow-timeline[" + where + "]: " + String(e)); } catch {} }

  function ensure(info) {
    let run = runs.get(info.id);
    if (!run) {
      run = { id: info.id, name: (info.meta && info.meta.name) || "workflow", startedAt: Date.now(), endedAt: 0, stopReason: "", phases: [], agents: [], logs: [], metaPhases: extractMetaPhases(info.meta) };
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
      let swept = false;
      for (const id of order) {
        const r = runs.get(id);
        if (r && r.endedAt === 0 && now - r.startedAt > STALE_MS) {
          r.endedAt = now;
          r.stopReason = r.stopReason || "stale-interrupted";
          r.agents.forEach((a) => { if (a.status === "running") a.status = "failed"; });
          swept = true;
        }
      }
      if (swept) scheduleSave(); // 只有真收割了僵尸 run 才落盘，避免每 30 秒空写
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
        path: API + "/overrides",
        handler: async (req, res) => {
          if (req.method === "GET") {
            res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
            res.end(JSON.stringify({ now: Date.now(), overrides: readOverrides() }));
            return;
          }
          if (req.method === "POST") {
            const body = await readBody(req);
            let j = null;
            try { j = JSON.parse(body || ""); } catch {}
            if (!j || typeof j.workflowName !== "string" || typeof j.phaseTitle !== "string") {
              res.writeHead(400, { "content-type": "application/json" });
              res.end(JSON.stringify({ ok: false, error: "invalid-override" }));
              return;
            }
            const out = setOverride(j.workflowName, j.phaseTitle, j.provider, j.model);
            res.writeHead(out.ok ? 200 : 400, { "content-type": "application/json" });
            res.end(JSON.stringify(out));
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
      },
      {
        kind: "exact",
        path: API + "/delete-all",
        handler: (req, res) => {
          if (req.method !== "POST") { res.writeHead(405); res.end(); return; }
          const n = order.length;
          runs.clear();
          order.length = 0;
          runNames = {};      // 记录没了，改名映射一并清掉（settings/overrides 是配置，保留）
          writeRunNames(runNames);
          writeRunsNow();     // 立即落盘（不走 2 秒防抖），重启/断电都不会复活旧记录
          res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
          res.end(JSON.stringify({ ok: true, deleted: n }));
          try { if (ctx.logger && ctx.logger.info) ctx.logger.info("workflow-timeline: delete-all cleared " + n + " runs"); } catch {}
        }
      }
    ];
    for (const route of routes) ctx.webServer.register(route);
    if (ctx.logger && ctx.logger.info) ctx.logger.info("workflow-timeline: routes mounted (runs + settings + overrides + rename + delete + delete-all)");
  } catch (error) {
    logError("mount-failed", error);
  }
}

export { apply, inject, name };
