// 通知文案（Markdown），与 tools/dsh-notify 的本地监听器保持一致。

export function fmtDuration(ms) {
  if (!ms || ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (s < 60) return s + "秒";
  const m = Math.floor(s / 60), sec = s % 60;
  if (m < 60) return m + "分" + (sec ? sec + "秒" : "");
  const h = Math.floor(m / 60), mm = m % 60;
  return h + "小时" + (mm ? mm + "分" : "");
}

export function oneLine(text, max) {
  const t = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max - 1) + "…" : t;
}

export function clip(text, max) {
  const s = String(text == null ? "" : text);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export function turnEndState(reason) {
  const r = reason || {};
  const kind = r.kind || "completed";
  if (kind === "completed") return { icon: "✅", label: "完成" };
  if (kind === "aborted") {
    const inner = (r.reason && r.reason.kind) || "";
    if (inner === "user") return { icon: "⏹", label: "已中断" };
    return { icon: "⏹", label: "中断" + (inner ? "(" + inner + ")" : "") };
  }
  if (kind === "max-tokens") return { icon: "⚠️", label: "达到 token 上限" };
  if (kind === "blocked") return { icon: "⚠️", label: "被阻塞" };
  if (kind === "error" || kind === "failed") return { icon: "❌", label: "出错中断" };
  return { icon: "ℹ️", label: kind };
}

export function buildTurnEndMessage(input) {
  const state = turnEndState(input.reason);
  const lines = [];
  lines.push("## " + state.icon + " DSH 会话" + state.label);
  lines.push("**会话**：" + oneLine(input.title || input.sessionId, 80));
  if (input.cwd) lines.push("**工作区**：" + oneLine(input.cwd, 100));
  const meta = [];
  if (input.turn) meta.push("第 " + input.turn + " 轮");
  if (input.durationMs > 0) meta.push("用时 " + fmtDuration(input.durationMs));
  if (input.steps > 0) meta.push(input.steps + " 步");
  if (meta.length) lines.push("**情况**：" + meta.join(" · "));
  if (input.lastText) lines.push("**内容**：" + clip(oneLine(input.lastText, input.snippetChars || 280), input.snippetChars || 280));
  if (input.link) lines.push("[打开 DSH](" + input.link + ")");
  return {
    title: "DSH 会话" + state.label,
    text: lines.join("\n"),
    plain: "DSH 会话" + state.label + "：" + (input.title || input.sessionId) + (input.lastText ? "\n" + oneLine(input.lastText, input.snippetChars || 280) : ""),
    meta: { sessionId: input.sessionId, kind: "turn-end", turn: input.turn, state: state.label },
  };
}

export function buildApprovalMessage(input) {
  const lines = [];
  lines.push("## 🔐 DSH 等待你审批");
  lines.push("**会话**：" + oneLine(input.title || input.sessionId, 80));
  if (input.toolName) lines.push("**工具**：" + input.toolName);
  if (input.reason) lines.push("**原因**：" + clip(oneLine(input.reason, 500), 500));
  if (input.link) lines.push("[打开 DSH 处理](" + input.link + ")");
  return {
    title: "DSH 等待审批",
    text: lines.join("\n"),
    plain: "DSH 等待审批：" + (input.title || input.sessionId) + "\n" + (input.toolName || "") + "\n" + oneLine(input.reason || "", 300),
    meta: { sessionId: input.sessionId, kind: "approval" },
  };
}

export function buildQuestionMessage(input) {
  const lines = [];
  lines.push("## ❓ DSH 等你回答");
  lines.push("**会话**：" + oneLine(input.title || input.sessionId, 80));
  const qs = Array.isArray(input.questions) ? input.questions : [];
  qs.slice(0, 3).forEach(function (q, idx) {
    const head = q && q.header ? "【" + q.header + "】" : "";
    lines.push("**" + (qs.length > 1 ? "问题" + (idx + 1) + "：" : "问题：") + "**" + head + oneLine(q ? q.question : "", 400));
    if (q && Array.isArray(q.options) && q.options.length) {
      lines.push("选项：" + q.options.slice(0, 6).map(function (o, j) { return (j + 1) + ". " + oneLine(o && o.label, 60); }).join(" / "));
    }
  });
  if (!qs.length) lines.push("（问题内容为空，请打开 DSH 查看）");
  if (input.link) lines.push("[打开 DSH 回答](" + input.link + ")");
  const plain = "DSH 等你回答：" + (input.title || input.sessionId) + "\n" + qs.slice(0, 2).map(function (q) { return oneLine(q && q.question, 300); }).join("\n");
  return {
    title: "DSH 等你回答",
    text: lines.join("\n"),
    plain: plain,
    meta: { sessionId: input.sessionId, kind: "question" },
  };
}
