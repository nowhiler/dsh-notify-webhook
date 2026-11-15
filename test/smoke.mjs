// 冒烟测试：用假 ctx 驱动插件，验证 4 类事件 → 通知的生成与过滤（不连真实通道）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apply } from "../index.js";

const tmp = path.join(os.tmpdir(), "dsh-notify-plugin-smoke");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
const mockFile = path.join(tmp, "mock.log");
const pluginLog = path.join(tmp, "plugin.log");
const cfgPath = path.join(tmp, "cfg.json");
fs.writeFileSync(cfgPath, JSON.stringify({
  enabled: true,
  channels: [{ type: "mock", file: mockFile }],
  logFile: pluginLog,
  notifyAborted: false,
  link: "",
}, null, 2));

const handlers = {};
const ctx = {
  on: function (n, f) { handlers[n] = f; },
  logger: function () { return { info: function () {}, warn: function () {}, debug: function () {} }; },
};
apply(ctx, { enabled: true, configPath: cfgPath });

function ev(type, data, time) { return { type: type, seq: ++seq, time: time || Date.now(), data: data }; }
let seq = 0;
const root = { id: "s1", header: { cwd: "C:\\work", delegationDepth: 0 }, snapshotEvents: function () { return []; } };
const sub = { id: "s2", header: { cwd: "C:\\work", delegationDepth: 1, origin: "subagent" }, snapshotEvents: function () { return []; } };
const emit = function (session, event) { handlers["session/event"](session, event); };

emit(root, ev("session/title", { title: "测试会话" }));
emit(root, ev("turn/start", { turn: 1 }, Date.now() - 65000));
emit(root, ev("step/start", { turn: 1, step: 1 }));
emit(root, ev("assistant/message", { turn: 1, step: 1, message: { role: "assistant", content: [{ type: "reasoning", text: "思考…" }, { type: "text", text: "活儿干完了，请回来确认下一步。" }] } }));
emit(root, ev("step/end", { turn: 1, step: 1 }));
emit(root, ev("turn/end", { turn: 1, reason: { kind: "completed" } }));

// 用户主动中断 → 默认不通知
emit(root, ev("turn/start", { turn: 2 }));
emit(root, ev("turn/end", { turn: 2, reason: { kind: "aborted", reason: { kind: "user" } } }));

// 等待审批
emit(root, ev("approval/asked", { id: "ap1", toolName: "pwsh", reason: "需要提权写 DSH 配置目录" }));

// 等待回答（PTC 形态）
emit(root, ev("tool/ptc-dispatch-start", { name: "ask_user_question", subCallId: "x1", arguments: { questions: [{ id: "q1", header: "确认", question: "要不要继续下一步？", options: [{ label: "继续" }, { label: "先停" }] }] } }));

// 子代理会话 → 不通知
emit(sub, ev("turn/start", { turn: 1 }));
emit(sub, ev("turn/end", { turn: 1, reason: { kind: "completed" } }));

await new Promise(function (r) { setTimeout(r, 800); });

const lines = fs.existsSync(mockFile) ? fs.readFileSync(mockFile, "utf8").split("\n").filter(Boolean).map(JSON.parse) : [];
const kinds = lines.map(function (l) { return l.message.meta.kind; });
console.log("MOCK COUNT:", lines.length);
console.log("KINDS:", JSON.stringify(kinds));
for (const l of lines) {
  console.log("--- " + l.message.meta.kind + " | " + l.message.title);
  console.log(l.message.text);
}

const errors = [];
if (lines.length !== 3) errors.push("预期 3 条通知，实际 " + lines.length);
if (kinds[0] !== "turn-end") errors.push("第 1 条应为 turn-end，实际 " + kinds[0]);
if (kinds[1] !== "approval") errors.push("第 2 条应为 approval");
if (kinds[2] !== "question") errors.push("第 3 条应为 question");
const turnText = lines[0] ? lines[0].message.text : "";
if (turnText.indexOf("测试会话") < 0) errors.push("turn-end 缺少会话标题");
if (turnText.indexOf("第 1 轮") < 0) errors.push("turn-end 缺少轮次");
if (turnText.indexOf("1分5秒") < 0) errors.push("turn-end 缺少用时，实际: " + turnText);
if (turnText.indexOf("1 步") < 0) errors.push("turn-end 缺少步数");
if (turnText.indexOf("活儿干完了") < 0) errors.push("turn-end 缺少回答摘要");
if (lines[1] && lines[1].message.text.indexOf("需要提权") < 0) errors.push("approval 缺少原因");
if (lines[2] && lines[2].message.text.indexOf("要不要继续下一步") < 0) errors.push("question 缺少问题文本");
if (!fs.existsSync(pluginLog)) errors.push("插件日志文件未生成");

if (errors.length) {
  console.log("\nSMOKE FAIL:");
  for (const e of errors) console.log(" - " + e);
  process.exit(1);
}
console.log("\nSMOKE PASS");
