// 推送通道适配器（与 tools/dsh-notify/watch.mjs 同一套协议）。
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export function dingtalkSign(secret) {
  const timestamp = Date.now();
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(timestamp + "\n" + secret);
  return "&timestamp=" + timestamp + "&sign=" + encodeURIComponent(hmac.digest("base64"));
}

export function checkResp(text) {
  try {
    const o = JSON.parse(text);
    if (o.errcode !== undefined) return o.errcode === 0 ? "OK" : "FAIL errcode=" + o.errcode + " " + (o.errmsg || "");
    if (o.code !== undefined) return (o.code === 0 || o.code === 200) ? "OK" : "FAIL code=" + o.code + " " + (o.message || o.msg || "");
    return "OK";
  } catch (e) { return "OK(非JSON响应)"; }
}

export async function postJson(url, body, headers) {
  const res = await fetch(url, {
    method: "POST",
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8" }, headers || {}),
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  return { status: res.status, text: text };
}

function clip(text, max) {
  const s = String(text == null ? "" : text);
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export async function sendOne(ch, msg, cfg) {
  const type = String((ch && ch.type) || "").toLowerCase();
  if (type === "mock" || type === "console") {
    const home = process.env.USERPROFILE || process.env.HOME || "";
    const file = (ch && ch.file) || path.join(home, ".dsh", "dsh-notify-mock.log");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify({ time: new Date().toISOString(), channel: type, message: msg }) + "\n", "utf8");
    return type + ": OK";
  }
  if (type === "dingtalk") {
    let url = ch.webhook;
    if (ch.secret) url += dingtalkSign(ch.secret);
    const text = ch.keyword ? msg.text + "\n\n" + ch.keyword : msg.text;
    const r = await postJson(url, { msgtype: "markdown", markdown: { title: msg.title, text: text } });
    return "dingtalk: " + r.status + " " + checkResp(r.text) + " " + clip(r.text, 120);
  }
  if (type === "wecom" || type === "qywx") {
    const r = await postJson(ch.webhook, { msgtype: "markdown", markdown: { content: msg.text } });
    return "wecom: " + r.status + " " + checkResp(r.text) + " " + clip(r.text, 120);
  }
  if (type === "serverchan" || type === "server-chan") {
    const url = "https://sctapi.ftqq.com/" + ch.sendKey + ".send";
    const r = await postJson(url, { title: msg.title, desp: msg.text });
    return "serverchan: " + r.status + " " + checkResp(r.text) + " " + clip(r.text, 120);
  }
  if (type === "pushplus") {
    const r = await postJson("https://www.pushplus.plus/send", { token: ch.token, title: msg.title, content: msg.text, template: "markdown" });
    return "pushplus: " + r.status + " " + checkResp(r.text) + " " + clip(r.text, 120);
  }
  if (type === "bark") {
    const base = ch.server || "https://api.day.app";
    const url = base + "/" + ch.key + "/" + encodeURIComponent(msg.title) + "/" + encodeURIComponent(msg.plain);
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    return "bark: " + res.status + " " + clip(await res.text(), 120);
  }
  if (type === "generic" || type === "webhook") {
    const r = await postJson(ch.url, { title: msg.title, text: msg.text, plain: msg.plain, meta: msg.meta }, ch.headers);
    return "generic: " + r.status + " " + checkResp(r.text) + " " + clip(r.text, 120);
  }
  return "FAIL 未知通道类型: " + type;
}
