# dsh-notify-webhook

[![npm version](https://img.shields.io/npm/v/dsh-notify-webhook.svg)](https://www.npmjs.com/package/dsh-notify-webhook)
[![license](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/nowhiler/dsh-notify-webhook/blob/main/LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/nowhiler/dsh-notify-webhook?label=release)](https://github.com/nowhiler/dsh-notify-webhook/releases)


DSH 桌面版 host 插件：会话**回合结束**、**等待你审批**、**等你回答问题**时，把提醒推送到手机（钉钉 / 企业微信 / Server酱微信 / PushPlus / MeoW / Bark / 通用 webhook）。

> 权限说明：插件运行在 DSH 宿主进程内，能读会话事件并按配置发 HTTP 请求；除此之外不联网、不上报数据。请只使用你信任来源的插件代码。

## 环境要求

- DeepSeek Harness 桌面版 **0.2.2-rc.1**（其他版本事件接口可能不同，未验证）
- Windows / macOS / Linux 任意平台（本包为纯 JS，无 native 依赖）
- 不需要单独安装 Node：用 DSH 自带的运行时即可

## 仓库

- GitHub: https://github.com/nowhiler/dsh-notify-webhook
- npm: https://www.npmjs.com/package/dsh-notify-webhook
- 本包也可用 git 安装（需要能访问 GitHub）：

  ```powershell
  "<DSH安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add git+https://github.com/nowhiler/dsh-notify-webhook
  ```

## 安装

最快的方式（从 npm 安装，需要能访问 npm registry）：

```powershell
"<DSH安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add dsh-notify-webhook
```

或者用下面任意一种本地方式：

1. 把压缩包解压到任意固定目录（例如 `D:\tools\dsh-notify-webhook`），**之后不要移动/删除该目录**。
2. 用 DSH 自带的 CLI 安装（把 `<DSH安装目录>` 换成你的 DSH 安装路径，把 `<插件目录>` 换成上一步的目录）：

   ```powershell
   "<DSH安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop add -w "<插件目录>"
   ```

   看到 `+ dsh-notify-webhook x.x.x` 即成功。
3. **完全退出并重新打开 DSH 桌面版**（插件只在启动时加载）。
4. 复制配置：把本包的 `config.example.json` 复制到用户目录的 `~/.dsh/dsh-notify.json`（Windows 为 `C:\Users\<你>\.dsh\dsh-notify.json`），按下面“通道配置”填你自己的通道。
5. 发一条测试消息（用 DSH 自带 node 或任意 Node 18+）：

   ```powershell
   "<DSH安装目录>\resources\runtime\primary-runtime\dependencies\node\bin\node.exe" "<插件目录>\test\send-test.mjs"
   ```

   手机上收到「DSH 通知测试」即成功。

安装后 `~/.dsh/profiles/desktop/package.json` 会多出依赖 `dsh-notify-webhook` 和 bundle 项（`link:` 指向你解压的目录）。

## 通道配置

配置在 `~/.dsh/dsh-notify.json`，**改完即时生效，不用重启**（按文件 mtime 热加载）。

```json
{
  "enabled": true,
  "notifyTurnEnd": true,
  "notifyAborted": false,
  "notifyApproval": true,
  "notifyQuestion": true,
  "snippetChars": 280,
  "link": "auto",
  "channels": [
    { "type": "serverchan", "sendKey": "SCTxxxx" },
    { "type": "meow", "nickname": "JohnDoe", "category": "DSH", "msgType": "text" }
  ]
}
```

| 字段 | 默认 | 说明 |
|---|---|---|
| `enabled` | true | 总开关 |
| `notifyTurnEnd` | true | 回合结束提醒 |
| `notifyAborted` | false | 用户主动中断也提醒 |
| `notifyApproval` | true | 等待审批提醒 |
| `notifyQuestion` | true | 等待回答提醒 |
| `snippetChars` | 280 | 摘要字数 |
| `link` | `auto` | `auto`=DSH 当前 web 端口；也可填固定 URL（如远程访问地址）；`""` 不显示链接 |
| `channels` | [] | 推送通道，为空时只写日志 |

### 支持的通道

| type | 参数 | 说明 |
|---|---|---|
| `serverchan` | `sendKey` | Server酱 Turbo，微信服务号接收；免费 5 条/天 |
| `dingtalk` | `webhook` + `secret`（加签）或 `keyword`（关键词） | 钉钉自定义群机器人，免费 20 条/分钟 |
| `wecom` | `webhook` | 企业微信群机器人（需内部群） |
| `pushplus` | `token` | PushPlus（需实名） |
| `bark` | `key`，可选 `server` | iOS |
| `meow` | `nickname`，可选 `server`、`category`、`msgType`、`htmlHeight`、`url`、`imgUrl` | MeoW 消息推送；`msgType` 支持 `text`（默认）或 `html` |
| `generic` | `url`，可选 `headers` | 通用 webhook，POST `{title,text,plain,meta}` |
| `mock` | 可选 `file` | 写本地文件，测试用 |

## 验证与日志

- 插件日志：`~/.dsh/dsh-notify.log`（插件加载、每条通知、每个通道的发送结果都在里面）
- 重启后看到 `INFO 插件已加载 ... channels=...` 说明插件生效
- 任意会话跑完一轮看到 `INFO 通知[turn-end] ...` + `发送[...] ... OK` 说明推送成功

## 通知规则

- 只提醒根会话：`session.header.origin === 'subagent'` 或 `delegationDepth > 0` 的子代理/队友会话不提醒。
- 每轮 `turn/end` 只发一次；审批按 `approval/asked.id` 去重、提问按 callId 去重。
- 默认忽略用户主动中断，避免按了停止还收到通知。

## 卸载

```powershell
"<DSH安装目录>\resources\runtime\cli\bin\dsh.cmd" plugin --profile desktop remove dsh-notify-webhook
```

然后重启 DSH。配置文件与日志可保留。

## 已知限制

- 依赖 DSH 0.2.2-rc.1 的 `session/event` 事件形态；DSH 升级后若接口变化，需要改 `index.js`。
- 插件目录被移动/删除会导致 DSH 加载报错（`link:` 依赖），需要先卸载再重装到新位置。
- 只推不收：钉钉自定义群机器人是单向 webhook，手机上回复消息不会驱动 DSH。

## 许可

MIT License，见 `LICENSE`。无第三方运行时依赖（只使用 Node 内置模块），可自由修改、分发。
