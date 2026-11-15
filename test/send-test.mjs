// 用插件同一套通道配置发一条测试消息：node test/send-test.mjs [配置文件路径]
import { createConfigReader, defaultConfigPath } from "../lib/config.js";
import { sendOne } from "../lib/channels.js";

const args = process.argv.slice(2);
const cfgPath = args[0] || defaultConfigPath();
const read = createConfigReader({ configPath: cfgPath }, function (m) { console.error("[config] " + m); });
const cfg = read();
const channels = Array.isArray(cfg.channels) ? cfg.channels : [];

const msg = {
  title: "DSH 通知测试",
  text: "## 🔔 DSH 通知测试\n**时间**：" + new Date().toLocaleString("zh-CN") + "\n如果你在手机上看到这条消息，说明通道配置成功。",
  plain: "DSH 通知测试：如果你在手机上看到这条消息，说明通道配置成功。",
  meta: { kind: "test" },
};

console.log("配置文件: " + cfgPath);
console.log("通道: " + (channels.map(function (c) { return c.type; }).join(", ") || "(空)"));
if (!channels.length) { console.log("没有配置 channels，退出"); process.exit(1); }

let failed = 0;
for (const ch of channels) {
  try {
    const r = await sendOne(ch, msg, cfg);
    console.log("[" + (ch.type || "?") + "] " + r);
    if (String(r).indexOf("FAIL") === 0) failed += 1;
  } catch (e) {
    failed += 1;
    console.log("[" + (ch.type || "?") + "] 异常: " + String(e && e.message ? e.message : e));
  }
}
process.exit(failed ? 1 : 0);
