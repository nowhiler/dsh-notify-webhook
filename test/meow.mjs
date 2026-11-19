import http from "node:http";
import { sendOne } from "../lib/channels.js";

const requests = [];
const server = http.createServer(async function (req, res) {
  let body = "";
  for await (const chunk of req) body += chunk;
  requests.push({ method: req.method, url: req.url, body: JSON.parse(body) });
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ status: 200, data: true, msg: "发送成功" }));
});

await new Promise(function (resolve) { server.listen(0, "127.0.0.1", resolve); });
const address = server.address();
const serverUrl = "http://127.0.0.1:" + address.port;

try {
  const msg = {
    title: "DSH 通知测试",
    text: "## 测试\n如果你看到这条消息，说明通道成功。",
    plain: "DSH 通知测试：通道成功。",
  };
  const result = await sendOne({
    type: "meow",
    server: serverUrl,
    nickname: "John Doe",
    category: "DSH",
    msgType: "text",
  }, msg, {});

  if (String(result).indexOf("FAIL") === 0) throw new Error(result);
  const sent = requests[0];
  if (!sent || sent.method !== "POST") throw new Error("未收到 POST 请求");
  if (sent.url !== "/John%20Doe?msgType=text") throw new Error("请求路径错误: " + sent.url);
  if (sent.body.title !== msg.title || sent.body.msg !== msg.plain) throw new Error("JSON 正文错误");
  if (sent.body.category !== "DSH") throw new Error("分类未写入正文");
  console.log("MEOW PASS");
} finally {
  await new Promise(function (resolve) { server.close(resolve); });
}
