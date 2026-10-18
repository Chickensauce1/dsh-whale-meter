/**
 * 立绘资产说明 —— 这里记录每张图的真实来源与许可边界。
 *
 * 为什么单独写一份：上一版我误以为这批图「版权归原作者、只能本地自用」，
 * 于是自作主张换成程序化生成的几何 SVG，结果又难看又不是角色本人。
 * 事实是：图来自 GitHub 上的开源表情包仓库，随那个仓库一起分发，
 * 应当按上游仓库的许可使用，而不是按我自己臆想的「二创=不能分发」处理。
 *
 * 结论：用原图。分发时保留本文件与 README 的出处说明。
 *
 * ── 来源 ──────────────────────────────────────────────────────────
 *
 * 角色：DeepSeek 的萌拟人化身「DeepSeek娘 / 鲸鱼娘 / 蓝色大肥鱼」。
 *
 * 本地这份 assets/ 的来源链：
 *   1. 原始 webp：社区整理站抓取（梗鲸 aigengtu.com / 蓝色大肥鱼站 /
 *      GitHub ChineseBQB 表情包仓库等，详见 E:\尝试\消耗token\assets\stickers\README.md）
 *   2. 抠图：assets/whale/cutout/*-cutout.png，本机 image-cutout 管线处理，透明底
 *   3. 本目录 webp：由 cutout PNG 缩放（长边 ≤512）+ WebP q92 导出
 *
 * 生成命令见 README「立绘」一节，可复现。
 *
 * ── 许可边界 ──────────────────────────────────────────────────────
 *
 * - 表情包/同人图的性质：版权归**画师本人**，不在本项目的 MIT 覆盖范围内。
 *   MIT 只覆盖代码。
 * - 上游仓库（ChineseBQB 等）本身是「合集」性质，收录不改变原作者版权。
 * - 因此分发时：
 *   · 必须保留出处说明（本文件 + README 立绘一节）
 *   · 不得把这些图单独再授权、售卖，或声称是 MIT 作品
 *   · 商业使用前需回原作品详情页核对画师署名与授权备注
 * - 如原作者要求下架：删掉 assets/*.webp 即可，代码会自动退化为无图
 *   （`<img>` onerror 不阻断渲染，浮窗照常工作）。
 *
 * ── 文件对应 ──────────────────────────────────────────────────────
 *
 * | 文件名              | 来源 cutout            | 用途                    |
 * | ------------------- | ---------------------- | ----------------------- |
 * | whale-stand.webp    | stand-cutout.png       | 默认 / 平静             |
 * | whale-ciallo.webp   | ciallo-cutout.png      | 打招呼                  |
 * | whale-praise.webp   | praise-cutout.png      | 夸奖 / 星星             |
 * | whale-bighead.webp  | bighead-cutout.png     | 疑问                    |
 * | whale-thinking.webp | thinking-cutout.png    | 思考                    |
 * | whale-confused.webp | confused-cutout.png    | 困惑 / 流汗             |
 * | whale-coding.webp   | coding-cutout.png      | 写代码                  |
 * | whale-goodmodel.webp| goodmodel-cutout.png   | 好模型                  |
 * | whale-scold.webp    | scold-cutout.png       | 训斥                    |
 * | whale-angry.webp    | angry-cutout.png       | 生气                    |
 * | whale-cdrive.webp   | cdrive-cutout.png      | C 盘告急 / 预算吃紧     |
 * | mood-calm.webp      | stand-cutout.png       | 面板页主视觉            |
 */
