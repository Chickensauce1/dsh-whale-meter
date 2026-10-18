# 已知不足与待办（dsh-whale-meter v1.0.0）

按 `~/.dsh/AGENTS.md`「交付前必须产出一份已知不足清单」的要求，逐条列清楚。

---

## 一、需要鸡酱动手的一件事

**本机运行的仍是旧代码，要重启 DSH 才生效。**

- 已就位：`~/.dsh/plugins/dsh-whale-meter/` 里已经是新版（index.js 15,037 B，mtime 23:19）
- 未生效：后端进程 11:20 启动，宿主侧 `index.js` **不热加载**（AGENTS.md「二·补」实测过）
- 证据：`GET /api/whale-meter` 返回的 `health` 只有旧字段（`scannedFiles/lastScanAt/scanMs/firstScanDone`），
  没有新的 `sessionsRoot/zstd/reparsedFiles`
- 客户端 `client.js` 会热更新，但它的新逻辑依赖服务端返回 `scanning` 字段，所以也要重启后才完整

**为什么不自己重启**：AGENTS.md「DSH 重启纪律」明确禁止智能体在任务运行中触发整机重启，
一刀下去会掐停所有会话。这条由你手动执行。

重启后自检一条命令：

```powershell
(Invoke-RestMethod "http://127.0.0.1:62480/api/whale-meter").health
# 期望看到 sessionsRoot / zstd / reparsedFiles / unreadable 四个新字段
```

**回滚**：旧版本完整备份在 `~/.dsh/plugins/dsh-whale-meter.bak-20261018-231755`，
profile 配置备份在 `~/.dsh/profiles/desktop/cordis.patch.yml.bak-whale-20261018-231748`。

---

## 二、没做/做不到的

| 项 | 状态 | 原因 |
|---|---|---|
| **deepseek.stream 上架** | 卡在登录 | 三个接口（`inspect-archive` / `import-github` / `plugins`）全部 401，服务端要求开发者账号登录并绑定归属。材料已备好在 `docs/MARKET-SUBMISSION.md`，你登录后照着填即可 |
| **推送走 Git 协议** | 改走 API | `github.com:443` 本机连不通（TCP 超时），`api.github.com` 可达。已用 Git Data API 推送，`tools/push-via-api.mjs` 可复跑 |
| **多平台实机验证** | 未做 | 只在 Windows x64 + Node 24 上真跑过。Linux/macOS 的路径处理已用断言覆盖（归档无 `\`），但没有真机跑 |
| **DSH 0.1.x 老版本的兼容** | 未验证 | 只对 0.2.1-alpha.1 的 `webServer.register({kind,path,handler})` 契约验证过。老版本若签名不同，路由注册会失败（`apply` 有 try/catch，不会崩整个 profile） |
| **多帧 zstd 的极端场景** | 部分覆盖 | skippable frame 已按规范跳过；字典帧（dictionaryFlag=3）只跳过头部、没做字典解压——实际会话文件不产生这种帧 |
| **供应商归因的边界** | 有已知偏差 | `subagent/descriptor` 里的 provider 会更新「当前值」。若子代理用量打在父会话文件里且 descriptor 之后父会话再调模型，可能把父的调用记到子的供应商标下。实测本机 50 个 subagent 事件未触发 |
| **价目准确性** | 是默认值 | 内置价目是常见公开价，**不是任何人真实账单的复刻**。别人的代理商折扣/套餐不同，需要自己改。查不到的模型会显式列进「未定价」而不是算成 0 |
| **立绘授权** | 已声明，未逐张核对画师 | 图来自开源表情包仓库（ChineseBQB 等）与社区整理站。版权归画师，**不在 MIT 覆盖范围**，已写进 LICENSE 与 `assets/CREDITS.md`。但我**没有**逐张回原作品页核对具体画师署名与授权条款——那需要访问源站，属于你上架前可选一步 |

---

## 三、有意为之的例外

1. **安装包（tgz）不含自检脚本**。`verify`/`install-smoke`/`browser-check`/`live-serve-check`/`market-precheck`/`pack`
   都只在仓库里（zip 有），不进 tgz。理由：它们用 `node:child_process` 和无头浏览器，
   装到用户机器上纯属多余，且会被市场静态扫描当成风险项反复确认。
   仓库里 `npm run verify` 等命令照旧可跑。

2. **`tools/push-via-api.mjs` 留在仓库**。它从 `git credential fill` 读凭据、**不落盘不打印**。
   对本机 github.com 不通的环境是唯一可用推送方式，留着比删掉有用。

3. **`panel.html` 有内联脚本**。这是详情面板在 iframe 里自包含的设计（不依赖宿主打包管线）。
   `verify.mjs` 会把内联脚本抽出来单独 `node --check`，所以不会因为"不在 .js 清单里"而漏检。

4. **价目 POST 上限 64 KB**。面板只需要传几百字节；限制是为了让这个接口不能被当上传通道用。

---

## 四、验证记录（可复跑）

```
npm run verify      # 40 项：语法 / 计费规则 / 真实数据 / 仓库卫生
npm run smoke       # 43 项：tgz 解到干净临时 DSH_HOME 走完整装载与路由
npm run live        # 24 项：真 node:http + 真请求（413/405/穿越/卸载/首轮非阻塞）
npm run ui          # 13 项：真实 Edge 无头渲染，抓 console + 结构断言
npm run precheck    # 30 项：按市场上传口规则预检 zip 与 tgz
npm run pack        # 可复现打包（两次 sha256 一致）
```

本机实测数字：
- 352 个会话文件 / 14,209 条模型调用
- 首轮全量扫描 11–18 秒（取决于磁盘缓存），**首个 HTTP 请求 64 ms 返回占位快照**
- 增量缓存命中后 0–10 ms
- 识别出 5 家供应商，0 条未定价
