# 市场上架清单 · dsh-whale-meter v1.0.0

> 打开 <https://deepseek.stream/upload> → 登录 → 上传 `dist/dsh-whale-meter-1.0.0.zip`
> 下面每个字段直接复制粘贴。带 ⚠️ 的是服务端会校验格式、填错会被打回的。

---

## 上传文件

| 项 | 值 |
|---|---|
| 文件 | `dist/dsh-whale-meter-1.0.0.zip` |
| 大小 | 105,153 B（远低于 64 MiB 上限）|
| SHA-256 | `c7c3dc2792a1858c93ad8af58091792bf26c60e10b9363a0db8674cda7a53427` |
| 条目数 | 32（含仓库侧自检脚本与 KNOWN-GAPS.md；安装包只取其中 23 个） |

**终端安装用的 tgz**（给「下载包安装」的用户核对）

| 项 | 值 |
|---|---|
| 文件 | `dsh-whale-meter-1.0.0.tgz` |
| 大小 | 54,791 B |
| SHA-256 | `addeb2a2e7b34978cf029c08d0392ecf138e84fecf1ef974f69687f4e9e3d792` |
| 目录结构 | 根目录下为 `package/`，manifest 在 `package/package.json` |

⚠️ 上传的 zip 必须是**这个**而不是 tgz。站点上传口 `accept=".zip"`，tgz 会被前端挡掉。
（tgz 是给 `dsh plugin add` 在终端安装用的，两个都在 Release 里。）

---

## 基本字段

**插件名**
```
dsh-whale-meter
```

**显示名**
```
大肥鱼用量表
```

**版本**
```
1.0.0
```

**作者显示名**（1–240 字符、单行，见站点校验）
```
Chickensauce1
```

**分类**
```
tools
```

**平台**
```
all
```

**入口**
```
./index.js
```

**Bundle patch**
```
./cordis.patch.yml
```

**图标**（站点用内置图标名，不是图片文件）
```
Sparkles
```

---

## 简介（中文，短）

```
DeepSeek Harness 跨会话 token 用量面板：今日/本月费用、峰谷计费、预算进度环，并把 DeepSeek 官方、各代理商、第三方模型的用量分开归因。
```

## 详细描述（中文长版）

```
装上之后 DSH 右下角多一枚药丸，显示今日花费和 token 量，点开是紧凑卡片，再点「详情」是全屏面板。

核心是把「钱花在谁身上」说清楚：一次会话里换了供应商（官方 → 代理商 → 第三方），
用量会分别记到对应的那家，而不是糊成一个总数。面板里能看今日/本月/近 3h/12h/7d/30d/全部
六个时间窗，近 24 小时折线（橙色带标峰时）、近 14 天柱状、今日会话榜。

计费按峰谷分档：北京时间工作日 09:00-12:00、14:00-18:00 为峰，其余为谷，周末全天谷。
历史记录按调用当时所处的档位算，不会因为你现在改峰谷表而变动。
内置价目只是常见默认值，面板里可以直接改，改完写进 <DSH_HOME>/whale-meter-pricing.json。

查不到价目的模型不会被当成 0 元，而是列进「未定价模型」并显式告警，
让你知道金额为什么偏低——这比一个漂亮但错的数字有用。

只读扫描 <DSH_HOME>/sessions，零运行时依赖，不联网、不读密钥、不写会话文件。
唯一的写操作是它自己的价目表。
```

## 详细描述（英文长版）

```
A cross-session token usage dashboard for DeepSeek Harness. A small pill sits in the bottom-right
corner showing today's cost and token count; click to expand a compact card, click again for a full panel.

The differentiating part is provider attribution: when a session switches between the official API,
a reseller, or a third-party model mid-conversation, usage is attributed to the right provider instead
of being lumped into one number. Six time windows (3h / 12h / 7d / 30d / month / all), a 24-hour line
chart with peak bands, a 14-day bar chart, and a per-session leaderboard.

Billing follows peak/off-peak tiers (Beijing time, weekday 09:00-12:00 and 14:00-18:00 are peak,
weekends are always off-peak). Historical records are priced at the tier in effect at call time.
Built-in prices are common defaults, not a replica of anyone's invoice — edit them in the panel and
they persist to <DSH_HOME>/whale-meter-pricing.json.

Models without a price are never counted as free: they are listed explicitly so you know why a total
looks low. Read-only scan of <DSH_HOME>/sessions. Zero runtime dependencies, no network, no credentials,
no writes to session files.
```

---

## 权限（站点会展示给用户，写清楚比写少好）

```
只读扫描会话日志（<DSH_HOME>/sessions）
注册面板路由 /whale-meter 与 JSON 接口
读写自身价目文件 <DSH_HOME>/whale-meter-pricing.json
```

## 标签

```
dsh, dsh-plugin, deepseek-harness, token, usage, cost, dashboard
```

---

## README

上传时如果站点要求填 README，**整份复制仓库里的 `README.md`**：
<https://github.com/Chickensauce1/dsh-whale-meter/blob/main/README.md>

（用 GitHub 那个「从仓库导入」入口的话，README 和清单会自动读，不用手填。）

---

## 提交后会看到什么

站点流程（从上传页前端代码读出）：

1. `POST /api/plugins/inspect-archive` — 服务端解析 zip，回 manifest 与 `artifactUploadId`
2. 你核对/补齐表单字段
3. `POST /api/plugins` — 提交，带 `manifest` + `readme` + `artifactUploadId` + `source`
4. 进入管理员审核

⚠️ `artifactUploadId` 是 48 位 hex、**与本次上传绑定**，别复制粘贴到另一次会话里用。

---

## 审核前自查（我都已经跑过，可直接引述）

| 检查 | 命令 | 结果 |
|---|---|---|
| 语法 + 计费规则 + 真实数据 + 仓库卫生 | `npm run verify` | 40 项全过 |
| 解包到干净临时 DSH_HOME 走完整装载 | `npm run smoke` | 43 项全过 |
| 真实 Edge 无头渲染面板 | `npm run ui` | 13 项全过，无 console 报错 |
| 打包可复现 | `npm run pack` ×2 | 两次 sha256 完全一致 |

---

## 如果审核问「为什么和 dsh-token-usage-stats 重复」

两者的差别在**供应商归因**和**跨机器健壮性**，不是又画一遍折线图：

- `dsh-token-usage-stats` 按会话/时间聚合总量；
- 这个把一次会话里换过的供应商分开算，并且专门处理了非默认 `DSH_HOME`、
  缺 zstd 运行时、归档跨平台路径这些「别人机器上会静默出 0」的情况。

装两个不冲突：路由前缀不同（`/whale-meter` vs 它自己的），客户端插槽 id 也不同。
