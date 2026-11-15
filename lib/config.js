// 插件配置读取：默认 ~/.dsh/dsh-notify.json，按 mtime 热更新（改配置不用重启 DSH）。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const DEFAULTS = {
  enabled: true,
  notifyTurnEnd: true,
  notifyAborted: false,
  notifyApproval: true,
  notifyQuestion: true,
  snippetChars: 280,
  link: "auto",
  channels: [],
  logFile: null,
};

export function defaultConfigPath() {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, ".dsh", "dsh-notify.json");
}

export function defaultLogFile() {
  const home = process.env.USERPROFILE || process.env.HOME || os.homedir();
  return path.join(home, ".dsh", "dsh-notify.log");
}

export function resolveConfigPath(config) {
  if (config && typeof config.configPath === "string" && config.configPath.trim()) return config.configPath.trim();
  return defaultConfigPath();
}

function mergeConfig(raw) {
  const out = Object.assign({}, DEFAULTS);
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const key of Object.keys(raw)) out[key] = raw[key];
  }
  if (!Array.isArray(out.channels)) out.channels = [];
  return out;
}

export function createConfigReader(config, warn) {
  const cfgPath = resolveConfigPath(config);
  const cache = { mtimeMs: -1, size: -1, value: mergeConfig(null) };
  let warnedMissing = false;
  return function readConfig() {
    let st;
    try { st = fs.statSync(cfgPath); } catch (e) {
      if (!warnedMissing) { warnedMissing = true; if (warn) warn("配置文件不存在: " + cfgPath + "（可在插件目录复制 config.example.json 过去）"); }
      return cache.value;
    }
    if (st.mtimeMs === cache.mtimeMs && st.size === cache.size) return cache.value;
    try {
      const raw = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
      cache.value = mergeConfig(raw);
      cache.mtimeMs = st.mtimeMs;
      cache.size = st.size;
      warnedMissing = false;
    } catch (e) {
      if (warn) warn("配置解析失败（沿用上一次有效配置）: " + String(e && e.message ? e.message : e));
      cache.mtimeMs = st.mtimeMs;
      cache.size = st.size;
    }
    return cache.value;
  };
}
