// DSH host 插件：会话回合结束 / 等待审批 / 等待回答时，把提醒推到手机。
// 入口由 package.json 的 dsh.bundle.patch 指向 cordis.patch.yml 插入；本文件只依赖 Node 与 ctx 事件。
import fs from "node:fs";
import path from "node:path";
import { createConfigReader, defaultLogFile } from "./lib/config.js";
import { buildTurnEndMessage, buildApprovalMessage, buildQuestionMessage, oneLine } from "./lib/format.js";
import { sendOne } from "./lib/channels.js";

export const name = "dsh-notify-webhook";

function eventsOf(session) {
  try {
    if (session && typeof session.snapshotEvents === "function") return session.snapshotEvents();
  } catch (e) { /* 忽略 */ }
  try {
    if (session && Array.isArray(session.log)) return session.log;
  } catch (e) { /* 忽略 */ }
  return [];
}

function textOfAssistant(data) {
  const content = data && data.message && data.message.content;
  if (!Array.isArray(content)) return "";
  const parts = content.filter(function (p) { return p && p.type === "text" && p.text; }).map(function (p) { return p.text; });
  return parts.join("\n").trim();
}

function questionsOf(data) {
  let args = data && data.arguments;
  if (typeof args === "string") {
    try { args = JSON.parse(args); } catch (e) { args = null; }
  }
  if (!args || typeof args !== "object") return [];
  return Array.isArray(args.questions) ? args.questions : [];
}

export function apply(ctx, config) {
  try {
    applyInner(ctx, config);
  } catch (e) {
    try {
      const line = "[" + new Date().toISOString() + "] ERROR apply 失败（插件已跳过，不影响宿主）: " + String(e && e.stack ? e.stack : e) + "\n";
      const home = process.env.USERPROFILE || process.env.HOME || "";
      if (home) {
        const file = home + "\\.dsh\\dsh-notify.log";
        fs.mkdirSync(home + "\\.dsh", { recursive: true });
        fs.appendFileSync(file, line, "utf8");
      }
    } catch (ignore) { /* 连日志都写不了就放弃 */ }
  }
}

function applyInner(ctx, config) {
  const cfgIn = config && typeof config === "object" ? config : {};
  if (cfgIn.enabled === false) return;

  const logger = (function () {
    try { return typeof ctx.logger === "function" ? ctx.logger("dsh-notify") : null; } catch (e) { return null; }
  })();

  let currentCfg = null;
  function readCfg() { return currentCfg(); }

  function log(level, message) {
    const line = "[" + new Date().toISOString() + "] " + String(level).toUpperCase() + " " + message;
    try {
      const cfg = currentCfg();
      const file = (cfg && cfg.logFile) || defaultLogFile();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, line + "\n", "utf8");
    } catch (e) { /* 忽略 */ }
    try {
      if (logger) {
        if (level === "warn" && typeof logger.warn === "function") logger.warn(message);
        else if (typeof logger.info === "function") logger.info(message);
      }
    } catch (e) { /* 忽略 */ }
  }

  currentCfg = createConfigReader(cfgIn, function (m) { log("warn", m); });

  const states = new Map();
  const notified = new Map();

  function markOnce(key) {
    if (notified.has(key)) return false;
    notified.set(key, true);
    if (notified.size > 2000) {
      let removed = 0;
      for (const k of notified.keys()) { notified.delete(k); removed += 1; if (removed >= 500) break; }
    }
    return true;
  }

  function ensureState(session) {
    const id = session && session.id;
    if (!id) return null;
    let st = states.get(id);
    if (st) return st;
    st = { title: "", lastText: "", turn: 0, steps: 0, turnStartedAt: 0 };
    const events = eventsOf(session);
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (ev && ev.type === "session/title" && ev.data && ev.data.title) { st.title = ev.data.title; break; }
    }
    states.set(id, st);
    return st;
  }

  function resolveLink(cfg) {
    const configured = cfg && cfg.link;
    if (configured && configured !== "auto") return configured;
    try {
      if (ctx.webServer && typeof ctx.webServer.getOrigin === "function") return ctx.webServer.getOrigin();
    } catch (e) { /* 端口未绑定等 */ }
    return "";
  }

  function sessionLink(session, cfg) {
    const origin = resolveLink(cfg);
    if (!origin) return "";
    const clean = origin.replace(/\/+$/, "");
    return clean + "/";
  }

  function deliver(msg, cfg) {
    const channels = Array.isArray(cfg && cfg.channels) ? cfg.channels : [];
    log("info", "通知[" + msg.meta.kind + "] " + msg.title + (channels.length ? "" : "（未配置 channels，仅写日志）"));
    if (!channels.length) return;
    Promise.resolve().then(async function () {
      for (const ch of channels) {
        try {
          const r = await sendOne(ch, msg, cfg);
          if (String(r).indexOf("FAIL") === 0) log("warn", "发送[" + (ch.type || "?") + "] 失败: " + r);
          else log("info", "发送[" + (ch.type || "?") + "] " + r);
        } catch (e) {
          log("warn", "发送[" + (ch.type || "?") + "] 异常: " + String(e && e.message ? e.message : e));
        }
      }
    }).catch(function (e) { log("warn", "投递失败: " + String(e && e.message ? e.message : e)); });
  }

  function onTurnEnd(session, st, event, cfg) {
    try {
      const header = session.header || {};
      if (header.origin === "subagent") return;
      if ((header.delegationDepth || 0) > 0) return;
      if (!cfg.notifyTurnEnd) return;
      const data = event.data || {};
      const reason = data.reason || {};
      if (reason.kind === "aborted") {
        const inner = (reason.reason && reason.reason.kind) || "";
        if (!cfg.notifyAborted && inner === "user") return;
      }
      const key = "turn-end:" + session.id + ":" + event.seq;
      if (!markOnce(key)) return;
      const durationMs = st.turnStartedAt && event.time ? event.time - st.turnStartedAt : 0;
      const msg = buildTurnEndMessage({
        title: st.title,
        sessionId: session.id,
        cwd: header.cwd,
        turn: st.turn,
        durationMs: durationMs,
        steps: st.steps,
        lastText: st.lastText,
        reason: reason,
        snippetChars: cfg.snippetChars,
        link: sessionLink(session, cfg),
      });
      st.turn = 0;
      st.steps = 0;
      st.turnStartedAt = 0;
      st.lastText = "";
      deliver(msg, cfg);
    } catch (e) {
      log("warn", "turn/end 处理失败: " + String(e && e.message ? e.message : e));
    }
  }

  function onApproval(session, st, event, cfg) {
    try {
      if (!cfg.notifyApproval) return;
      const d = event.data || {};
      const key = "approval:" + session.id + ":" + (d.id || event.seq);
      if (!markOnce(key)) return;
      const msg = buildApprovalMessage({
        title: st.title,
        sessionId: session.id,
        toolName: d.toolName,
        reason: d.reason,
        link: sessionLink(session, cfg),
      });
      deliver(msg, cfg);
    } catch (e) {
      log("warn", "approval 处理失败: " + String(e && e.message ? e.message : e));
    }
  }

  function onQuestion(session, st, event, cfg) {
    try {
      if (!cfg.notifyQuestion) return;
      const d = event.data || {};
      if (d.name !== "ask_user_question") return;
      const id = d.callId || d.subCallId || d.rootCallId || event.seq;
      const key = "question:" + session.id + ":" + id;
      if (!markOnce(key)) return;
      const questions = questionsOf(d);
      const msg = buildQuestionMessage({
        title: st.title,
        sessionId: session.id,
        questions: questions,
        link: sessionLink(session, cfg),
      });
      deliver(msg, cfg);
    } catch (e) {
      log("warn", "question 处理失败: " + String(e && e.message ? e.message : e));
    }
  }

  function onEvent(session, event) {
    try {
      if (!session || !event || typeof event.type !== "string") return;
      const cfg = currentCfg();
      if (cfg.enabled === false) return;
      const st = ensureState(session);
      if (!st) return;
      const data = event.data || {};
      if (event.type === "session/title") {
        if (data.title) st.title = data.title;
        return;
      }
      if (event.type === "turn/start") {
        st.turn = data.turn || st.turn + 1;
        st.turnStartedAt = event.time || 0;
        st.steps = 0;
        st.lastText = "";
        return;
      }
      if (event.type === "step/end") { st.steps += 1; return; }
      if (event.type === "assistant/message") {
        const text = textOfAssistant(data);
        if (text) st.lastText = text;
        return;
      }
      if (event.type === "approval/asked") { onApproval(session, st, event, cfg); return; }
      if (event.type === "tool/call" || event.type === "tool/ptc-dispatch-start") {
        onQuestion(session, st, event, cfg);
        return;
      }
      if (event.type === "turn/end") { onTurnEnd(session, st, event, cfg); return; }
    } catch (e) {
      log("warn", "事件处理失败: " + String(e && e.message ? e.message : e));
    }
  }

  if (typeof ctx.on === "function") {
    try { ctx.on("session/event", onEvent); } catch (e) { log("warn", "注册 session/event 失败: " + String(e)); }
    try {
      ctx.on("session/disposed", function (session) {
        try { if (session && session.id) states.delete(session.id); } catch (e) { /* 忽略 */ }
      });
    } catch (e) { /* 忽略：老版本可能没有该事件 */ }
  } else {
    log("warn", "ctx.on 不可用，插件未注册事件");
  }

  log("info", "插件已加载 | config=" + ((cfgIn && cfgIn.configPath) || "(默认 ~/.dsh/dsh-notify.json)") + " | channels=" + (Array.isArray(currentCfg().channels) ? currentCfg().channels.map(function (c) { return c && c.type; }).join(",") || "(空)" : "(空)"));
}
