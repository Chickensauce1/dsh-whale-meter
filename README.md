# 大肥鱼用量表 · dsh-whale-meter

> DeepSeek Harness 的跨会话 token 用量面板。界面右下角一枚常驻小药丸，显示今日费用与 token 量，
> 点开是紧凑卡片，再点「详情」是全屏面板。核心差异化在**供应商归因**：同一天里
> DeepSeek 官方、WorkBuddy、各家代理的用量分开算，而不是糊成一个总数。

![whale](assets/whale-stand.webp)

---

## 一眼看完

| | |
|---|---|
| **它做什么** | 只读扫描 `<DSH_HOME>/sessions`，把每次模型调用的 token 折叠成「今日 / 本月 / 各时间窗 / 各供应商 / 各会话」 |
| **它不做什么** | 不联网、不读密钥、不写会话文件、不改 DSH 配置。唯一的写操作是把自己的价目表存到 `<DSH_HOME>/whale-meter-pricing.json` |
| **依赖** | 零运行时依赖。只用 Node 内置模块 |
| **Node** | ≥ 22.15（zstd 会话文件解压需要 `node:zlib` 的 zstd 支持；低于此版本插件仍能启动，但会明确告诉你读不了） |
| **许可** | 代码 MIT；立绘版权归画师（见 `assets/CREDITS.md`） |

---

## 安装

### 图形界面

DSH → 设置 → 插件 → 安装本地包，选 `dsh-whale-meter-1.0.0.tgz`，重启对应 profile。

### 命令行

```bash
dsh plugin --profile web add /绝对路径/dsh-whale-meter-1.0.0.tgz
```

安装完成后重启 DSH（桌面端会在几秒内自动重启并重载窗口）。侧边栏/右下角出现药丸即成功。

### 卸载

DSH → 设置 → 插件 → 停用并移除；或删掉 profile 里的这一条 insert 后重启。

---

## 面板里看什么

**浮窗卡片**：今日费用（大字）+ token 总量 + 请求次数；输入/输出/缓存命中率一行；今日预算进度条；
供应商分布（堆叠色条 + 各家费用与占比）；全部代理商累计；未定价模型告警。

**详情面板**（浮窗底部「详情 →"）：四档 token 卡片、日/月预算条、供应商可展开的模型明细、
六个时间窗口（3h / 12h / 7d / 30d / 本月 / 全部）、近 24 小时折线（橙色带标峰时）、
近 14 天柱状、今日会话榜、环境自检区。

---

## 计费怎么算

单位：元 / 百万 token。四档价格：`uncachedInputPerMillion`、`cacheReadPerMillion`、
`cacheWritePerMillion`、`outputPerMillion`。

**峰谷**：北京时间工作日 `09:00-12:00`、`14:00-18:00` 为峰，其余为谷，**周末全天为谷**。
分档模型按**记录发生的时刻**取价 —— 历史记录不会因为你现在改了峰谷表而变动。

**查价顺序**：精确命中 → 别名规则 → 前缀族回退。三级都没有，金额返回 `undefined`，
面板显示「—」并把它计入「未定价模型」，**不会当成 0 混进总和**。

**内置价目只是常见默认值**，不是任何真实账单的复刻。你用的代理商、折扣、套餐都可能不同，
所以面板右上「价目」可以直接改，改完写入 `<DSH_HOME>/whale-meter-pricing.json`，重启不丢。

### 改价目

```json
{
  "currency": "CNY",
  "budget": { "day": 30, "month": 70 },
  "peakSchedule": {
    "weekendOffpeak": true,
    "intervals": [{ "start": "09:00", "end": "12:00" }, { "start": "14:00", "end": "18:00" }]
  },
  "pricing": {
    "my-model": {
      "peak":    { "uncachedInputPerMillion": 9, "cacheReadPerMillion": 0.3, "outputPerMillion": 27 },
      "offpeak": { "uncachedInputPerMillion": 4.5, "cacheReadPerMillion": 0.15, "outputPerMillion": 13.5 }
    }
  }
}
```

不带 `peak` / `offpeak` 的写法就是全天统一价。

---

## 数据从哪来

只读扫描 `<DSH_HOME>/sessions/<项目>/<会话>/session*.jsonl(.zstd)`，不写任何会话文件。

- **`<DSH_HOME>` 优先**，没设才回落到 `~/.dsh`。便携版、改过 `DSH_HOME` 的机器同样能扫到。
- 会话文件可能是**多帧拼接的 zstd**（也可能夹 skippable frame），`src/zstd-frames.js`
  先扫帧边界再逐帧解压。
- 折叠这些事件：`request/header`、`request/context`、`model/selection`、`llm/retry`、
  `compaction/summary`、`subagent/descriptor` 更新当前 provider/model；
  `assistant/chunk(usage)` 与 `assistant/message(usage)` 记用量；`assistant/message` 计一次请求。
- 同一次模型调用会在 chunk 与 message 各报一次 usage，用 `${sessionId}:${turn}:${step}`
  **覆盖去重**，不会重复计数。
- 单个会话只取最新一代文件（按 `v3 > v2 > v1` 的代数比较，不是字典序）。
- **增量缓存**：逐文件按 `mtime+size` 记版本号，没变过的会话不重新解压。
  首轮全量（本机 350 个会话约 12 秒）之后，刷新基本是毫秒级；会话被删除时缓存条目同步回收。

---

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/whale-meter` | 面板页（自包含，无外部 CDN） |
| GET | `/api/whale-meter` | 聚合快照 JSON；`?force=1` 强制重扫 |
| GET | `/api/whale-meter/config` | 当前价目、峰时、预算 |
| POST | `/api/whale-meter/config` | 更新价目、峰时、预算（请求体上限 64 KB） |
| GET | `/whale-meter/art/<name>.webp` | 立绘资源（仅 assets/ 下的直接文件名，拒绝路径穿越） |

---

## 关于「换台电脑还能不能跑」

这一版专门为此做过加固，下面每一条都对应一个真实踩过的坑：

| 坑 | 后果 | 现在的做法 |
| --- | --- | --- |
| 归档里混进 `src\aggregate.js` 这种反斜杠路径 | Windows 解压正常，Linux/macOS 展开成一个平铺文件，`import` 全断 | 打包时统一转成 `/`，`install-smoke.mjs` 里有断言 |
| 写死 `~/.dsh/sessions` | 自定义 `DSH_HOME` / 便携版上一律 0 用量，且不报错 | `resolveSessionsRoot()` 优先读 `DSH_HOME`，面板页脚显示真实数据目录 |
| 旧 Node 没有 zstd | 静默返回空串，看起来像「你没有用量」 | 导出 `zstdSupported`，面板与环境自检区明说 |
| 只认 `model/selection` | 中途换供应商（`llm/retry`）的用量记到上一家头上 | 五个事件源都更新当前 provider，另有模型名反推兜底 |
| 打包时间戳不固定 | 每次 `sha256` 都不同，别人没法核对 | tar/zip 手写，mtime/uid/gid 归零、条目排序，**同源码两次打包字节一致** |
| 立绘的授权边界 | 同人图不能被当成 MIT 代码一起授权，否则对画师不公平 | 保留原图，但 LICENSE 与 `assets/CREDITS.md` 明确写清：MIT 只覆盖代码 |

---

## 自检

```bash
node scripts/verify.mjs          # 语法 / 计费规则 / 真实数据 / 仓库卫生，40+ 项断言
node scripts/install-smoke.mjs   # 把 tgz 解到全新临时 DSH_HOME，走一遍真实装载与路由
node scripts/pack.mjs            # 出 dist/*.tgz + *.zip + MANIFEST.json
```

`install-smoke.mjs` 值得单独说：它把发行物解包到一个干净的临时目录，用假 `ctx` / 假 `webServer`
走完整装载路径，断言四条路由都注册上、路径穿越被拒、空会话目录返回零值快照而不是抛错、
以及「会话中途换供应商」时用量归到正确的那家。**在自己机器上绿不算数，这一层才算。**

---

## 目录

```
dsh-whale-meter/
├── index.js              宿主半：扫描、聚合、缓存、路由
├── client.js             客户端半：shell.overlay 悬浮窗（IIFE，无需构建）
├── panel.html            详情面板页模板（自包含）
├── src/
│   ├── aggregate.js      采集与聚合（纯函数，含 DSH_HOME 解析）
│   ├── pricing.js        价目、峰谷与计费
│   └── zstd-frames.js    多帧 zstd 解压 + JSONL 解析
├── assets/               12 张鲸鱼娘立绘（webp）+ CREDITS.md
└── scripts/
    ├── verify.mjs        自检
    ├── install-smoke.mjs 安装冒烟测试
    └── pack.mjs          可复现打包
```

---

## 立绘与许可

`assets/` 下是 DeepSeek 萌拟人化身「鲸鱼娘 / 大肥鱼」的同人立绘，
从开源表情包仓库（`ChineseBQB` 等）与社区整理站的公开集合中取用，
本机经抠图管线处理成透明底 PNG，再导出为 WebP。

**版权边界（重要）**：这些图像的版权归**画师本人**，
**不在本项目 MIT 的覆盖范围内**。MIT 只覆盖代码。

- 不得将 `assets/` 下的图单独再授权、售卖或声称为 MIT 作品；
- 二次分发请保留 `assets/CREDITS.md` 的出处说明；
- 商业使用前回原作品详情页核对画师署名与授权；
- 若画师要求下架：删除 `assets/*.webp` 即可，代码会退化为无图而不崩。

逐张来源对应表在 [`assets/CREDITS.md`](assets/CREDITS.md)。

## 主题适配

`client.js` 跑在应用文档里，能读到 `body` 上的 `--dsw-*` token；详情面板在 iframe 里读不到，
所以客户端在 iframe 的 `onLoad` 时把关键 token 的计算值用 `postMessage` 投递进去
（`{ type: 'whale-meter:theme', tokens }`），面板把它们映射成自己的 `--ink/--bg/--brand` 等变量。
深色判定同时用宿主投递的 `__dark` 标记与 `prefers-color-scheme` 兜底，因此不会闪白。
