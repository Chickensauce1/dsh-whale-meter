(() => {
  try {
    /* 大肥鱼用量表 (dsh-whale-meter) client half — 浅蓝白悬浮胶囊 */
    window.__ModuleLoader__.load({
      id: 'dsh-whale-meter',
      factory: (require) => {
        var module = { exports: {} }
        var exports = module.exports
        Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

        var react = require('react')
        var h = react.createElement
        var useState = react.useState
        var useEffect = react.useEffect
        var useRef = react.useRef
        var useCallback = react.useCallback

        var inject = ['slots']
        var STYLE_ID = 'dsh-whale-meter-style'
        var POS_KEY = 'dsh-whale-meter:pos'
        var OPEN_KEY = 'dsh-whale-meter:open'
        var TAP_KEY = 'dsh-whale-meter:taps'
        var POLL_MS = 60000

        /* DeepSeek 品牌蓝阶（取自 DSH 主题包 --dsw-static-deepseek-*） */
        var DS = {
          50:  '#edf3fe',
          100: '#e4edfd',
          200: '#d3e2ff',
          300: '#b7c8fe',
          400: '#679efe',
          450: '#5686fe',
          500: '#4176e6',
          600: '#4868b2',
        }

        var CSS = [
          /* 浅蓝白：白底为主、浅蓝作强调。浮窗保持自身明亮调性，不跟随宿主深色反转。 */
          '.wm-root{',
          '--wm-accent:' + DS[450] + ';',
          '--wm-accent-hi:' + DS[400] + ';',
          '--wm-accent-soft:' + DS[200] + ';',
          '--wm-accent-tint:' + DS[50] + ';',
          '--wm-text:#2c4a6e;',
          '--wm-text-2:#6b8bab;',
          '--wm-text-3:#9db4cc;',
          '--wm-surface:rgba(255,255,255,.93);',
          '--wm-surface-solid:#ffffff;',
          '--wm-line:rgba(86,134,254,.17);',
          '--wm-line-strong:rgba(86,134,254,.30);',
          '--wm-hover:rgba(86,134,254,.09);',
          '--wm-warn:#e69320;',
          '--wm-err:#e0574a;',
          '--wm-shadow:0 1px 2px rgba(86,134,254,.10),0 10px 26px -10px rgba(86,134,254,.30);',
          '--wm-ring-shadow:0 0 0 5px rgba(86,134,254,.16);',
          '}',

          /* 浮层容器：定位与 z-index 由 JS 内联设在 body 下的 holder 上 */
          '.wm-layer{font-family:inherit;font-size:12px;line-height:1.45;}',
          '.wm-layer *{box-sizing:border-box;}',

          /* 胶囊：左侧留出立绘位（立绘绝对定位探出边界） */
          '.wm-pill{position:absolute;pointer-events:auto;display:inline-flex;align-items:center;',
          'gap:6px;height:34px;padding:0 11px 0 34px;border-radius:999px;cursor:pointer;',
          'background:var(--wm-surface);border:1px solid var(--wm-line-strong);',
          /* 双层阴影：一层贴近的锐利描边 + 一层扩散的柔光，
             这样即使底下有别家的全屏暗色遮罩（如 dsh-purge 的首次须知），
             胶囊边缘依然清晰可辨，不会被暗化吞掉。 */
          'box-shadow:0 0 0 1px rgba(255,255,255,.75),',
          '0 1px 2px rgba(86,134,254,.14),0 10px 26px -10px rgba(16,35,60,.45);',
          'backdrop-filter:blur(16px) saturate(1.5);-webkit-backdrop-filter:blur(16px) saturate(1.5);',
          'color:var(--wm-text);user-select:none;-webkit-user-select:none;touch-action:none;',
          'overflow:visible;',
          'transition:transform .16s cubic-bezier(.22,1,.36,1),box-shadow .16s ease,border-color .16s ease;',
          '}',
          '.wm-pill:hover{transform:translateY(-1.5px);border-color:var(--wm-accent);',
          'box-shadow:var(--wm-shadow),var(--wm-ring-shadow);}',
          '.wm-pill:active{transform:translateY(0) scale(.985);}',
          '.wm-pill .val{font-weight:680;font-variant-numeric:tabular-nums;letter-spacing:-.02em;',
          'font-size:14px;color:var(--wm-accent);}',
          '.wm-pill .rule{width:1px;height:13px;background:var(--wm-line-strong);flex:none;}',
          '.wm-pill .tok{font-size:10px;color:var(--wm-text-2);font-variant-numeric:tabular-nums;',
          'padding-right:1px;}',

          /* 大肥鱼立绘：绝对定位，往左上挪一点，探出胶囊边界形成挂件感 */
          '.wm-av{position:relative;flex:none;display:grid;place-items:center;}',
          '.wm-av.over{position:absolute;left:-13px;top:-11px;overflow:visible;pointer-events:none;}',
          /* 写在 .wm-av.over 之后并提高特异性，稳稳覆盖它的 pointer-events:none */
          '.wm-av.over.tappable,.wm-av.tappable{pointer-events:auto;cursor:pointer;}',
          '.wm-av img{display:block;width:100%;height:100%;object-fit:contain;',
          /* 白色外发光：深色遮罩下也能看清鱼的轮廓 */
          'filter:drop-shadow(0 0 2px rgba(255,255,255,.9)) drop-shadow(0 3px 6px rgba(16,35,60,.35));',
          'transition:transform .22s cubic-bezier(.22,1,.36,1);transform-origin:50% 88%;',
          '-webkit-user-drag:none;}',
          '.wm-pill:hover .wm-av img{transform:scale(1.06) rotate(-2deg);}',
          '.wm-av .badge{position:absolute;right:-2px;bottom:-2px;width:10px;height:10px;',
          'border-radius:50%;border:2px solid var(--wm-surface-solid);',
          'background:var(--wm-accent);transition:background .3s;}',
          '.wm-av .badge.warn{background:var(--wm-warn);}',
          '.wm-av .badge.hot{background:var(--wm-err);}',
          '.wm-av.over .badge{right:2px;bottom:6px;}',

          /* 呼吸动效 */
          '.wm-av.breathe img{animation:wm-breathe 3.4s ease-in-out infinite;}',
          '@keyframes wm-breathe{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-2px) rotate(1.5deg)}}',

          /* ── 场景层：让鱼住进水里，而不是悬空贴着玻璃盒 ──
             三层结构（都在 .wm-av 内，立绘下方）：
               .wm-halo   身后柔光，把鱼从背景里“托”出来
               .wm-water  脚下水面，两道涟漪缓慢扩散
               .wm-bub    常驻气泡，缓缓上浮（区别于进食时的一次性气泡）

             注意 z-index 顺序：场景层 0 < 立绘 1。父级 .wm-av 需 visible 才不被裁。 */
          /* 场景层 z-index 顺序：场景 0 < 立绘 1（见下方 .wm-av img） */
          '.wm-av .wm-halo{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);',
          'width:118%;height:118%;border-radius:50%;pointer-events:none;z-index:0;',
          'background:radial-gradient(circle at 50% 46%,',
          'rgba(86,134,254,.22) 0%,rgba(134,178,255,.11) 44%,transparent 72%);',
          'animation:wm-halo 4.8s ease-in-out infinite;}',
          '@keyframes wm-halo{0%,100%{opacity:.7;transform:translate(-50%,-50%) scale(1)}',
          '50%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}}',

          /* 水面贴在鱼脚下方一点点，不铺太宽，免得整条鱼像浮在池塘里 */
          '.wm-av .wm-water{position:absolute;left:50%;bottom:2%;transform:translateX(-50%);',
          'width:72%;height:11%;border-radius:50%;pointer-events:none;z-index:0;',
          'background:radial-gradient(ellipse at center,rgba(86,134,254,.20),transparent 72%);}',
          /* 两道涟漪错开相位，看起来是持续扩散而不是脉冲 */
          '.wm-av .wm-water::before,.wm-av .wm-water::after{content:"";position:absolute;',
          'left:50%;top:50%;width:100%;height:100%;border-radius:50%;',
          'border:1px solid rgba(86,134,254,.30);transform:translate(-50%,-50%) scale(.4);',
          'animation:wm-ripple-out 3.6s ease-out infinite;}',
          '.wm-av .wm-water::after{animation-delay:1.8s;}',
          '@keyframes wm-ripple-out{0%{transform:translate(-50%,-50%) scale(.35);opacity:.8}',
          '100%{transform:translate(-50%,-50%) scale(1.35);opacity:0}}',

          '.wm-av .wm-bub{position:absolute;border-radius:50%;pointer-events:none;z-index:0;',
          'background:radial-gradient(circle at 32% 30%,rgba(255,255,255,.95),rgba(160,200,255,.5));',
          'animation:wm-bub-rise var(--dur,4.4s) linear infinite;opacity:0;}',
          '@keyframes wm-bub-rise{0%{transform:translate(0,4px) scale(.5);opacity:0}',
          '16%{opacity:.8}72%{opacity:.65}',
          '100%{transform:translate(var(--drift,3px),-26px) scale(1);opacity:0}}',

          /* 卡片里的立绘光晕要收敛，否则会溢出卡片顶边 */
          '.wm-head .wm-cardav .wm-halo{width:104%;height:104%;}',

          /* 立绘压在场景层之上（与下面 .wm-av img 的既有声明层叠合并） */
          '.wm-av img{position:relative;z-index:1;}',

          /* 主题固定为「浅蓝白」，不随时间/系统主题切换 —— 这是整套视觉的基调。
             深夜也不换深色：水面场景在水下确实偏蓝，但配色本身保持明亮通透。 */

          /* 撸鱼：弹跳 + 星星 */
          '.wm-av img.pop{animation:wm-pop .46s cubic-bezier(.34,1.56,.64,1);}',
          '@keyframes wm-pop{0%{transform:scale(1) rotate(0)}32%{transform:scale(1.24) rotate(-7deg)}',
          '62%{transform:scale(.93) rotate(4deg)}100%{transform:scale(1) rotate(0)}}',
          '.wm-av .spark{position:absolute;left:50%;top:44%;width:7px;height:7px;margin:-3.5px 0 0 -3.5px;',
          'border-radius:50%;pointer-events:none;background:var(--wm-accent);',
          'animation:wm-spark .66s cubic-bezier(.22,1,.36,1) forwards;}',
          '.wm-av .spark.alt{background:' + DS[300] + ';}',
          '.wm-av .spark.warm{background:var(--wm-warn);}',
          '@keyframes wm-spark{0%{transform:translate(0,0) scale(.3);opacity:1}',
          '100%{transform:translate(var(--dx),var(--dy)) scale(0);opacity:0}}',

          /* 飘字：必须横排。
             坑：父容器只有 58/84px 宽，绝对定位元素不设 width 时按 shrink-to-fit 算，
             available width = 容器宽 − left 偏移 ≈ 29px，会被压成竖条。
             所以用 nowrap + width:max-content 让宽度由内容撑开、溢出容器。 */
          '.wm-av .pops{position:absolute;left:50%;bottom:0;',
          'transform:translateX(-50%);',
          'white-space:nowrap;width:max-content;max-width:none;',
          'font-size:11px;font-weight:700;color:var(--wm-accent);pointer-events:none;',
          'text-shadow:0 1px 3px rgba(255,255,255,.95),0 0 6px rgba(255,255,255,.85);',
          'animation:wm-floatup 1.5s ease-out forwards;}',
          '@keyframes wm-floatup{0%{opacity:0;transform:translate(-50%,5px) scale(.8)}',
          '16%{opacity:1;transform:translate(-50%,0) scale(1)}',
          '100%{opacity:0;transform:translate(-50%,-30px) scale(1)}}',

          /* 实时进食脉冲：发现请求数上涨时，鱼身一缩一张 + 冒气泡 */
          '.wm-av.feeding img{animation:wm-feed .9s cubic-bezier(.34,1.4,.64,1);}',
          '@keyframes wm-feed{0%{transform:scale(1)}22%{transform:scale(.86) translateY(2px)}',
          '48%{transform:scale(1.13) translateY(-3px)}74%{transform:scale(.97)}100%{transform:scale(1)}}',
          '.wm-av .bubble{position:absolute;left:46%;top:52%;width:5px;height:5px;border-radius:50%;',
          'background:rgba(255,255,255,.9);border:1px solid var(--wm-accent);pointer-events:none;',
          'animation:wm-bubble 1.1s ease-out forwards;}',
          '@keyframes wm-bubble{0%{transform:translate(0,0) scale(.4);opacity:0}',
          '18%{opacity:.95}100%{transform:translate(var(--bx),-30px) scale(1);opacity:0}}',
          '.wm-pill.fed{border-color:var(--wm-accent);animation:wm-ripple .95s ease-out;}',
          '@keyframes wm-ripple{0%{box-shadow:var(--wm-shadow),0 0 0 0 rgba(86,134,254,.42)}',
          '100%{box-shadow:var(--wm-shadow),0 0 0 14px rgba(86,134,254,0)}}',

          /* 撸鱼成就：解锁时从鱼头顶冒一条横幅 */
          '.wm-ach{position:absolute;left:50%;top:-6px;transform:translate(-50%,-100%);',
          'display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;',
          'font-size:11px;font-weight:700;white-space:nowrap;pointer-events:none;',
          'color:#fff;background:linear-gradient(135deg,' + DS[450] + ',' + DS[300] + ');',
          'box-shadow:0 4px 14px -4px rgba(86,134,254,.6);',
          'animation:wm-ach 2.2s cubic-bezier(.22,1,.36,1) forwards;}',
          '@keyframes wm-ach{0%{opacity:0;transform:translate(-50%,-40%) scale(.7)}',
          '14%{opacity:1;transform:translate(-50%,-100%) scale(1)}',
          '78%{opacity:1;transform:translate(-50%,-100%) scale(1)}',
          '100%{opacity:0;transform:translate(-50%,-160%) scale(.95)}}',

          '@media (prefers-reduced-motion: reduce){',
          '.wm-av.breathe img,.wm-pill:hover .wm-av img,.wm-av img.pop,',
          '.wm-av.feeding img,.wm-av .spark,.wm-av .bubble,.wm-av .pops,.wm-ach,.wm-pill.fed,',
          '.wm-av .wm-halo,.wm-av .wm-water::before,.wm-av .wm-water::after,.wm-av .wm-bub,',
          '.wm-card::after{',
          'animation:none;transform:none;}}',
          /* 减弱动效时保留场景层，但让气泡静态可见（否则整层会“消失”） */
          '@media (prefers-reduced-motion: reduce){',
          '.wm-av .wm-bub{opacity:.5;}',
          '.wm-av .wm-water::before{opacity:.5;transform:translate(-50%,-50%) scale(1);}}',

          /* 展开卡片：整张可拖；不裁剪，让立绘能探出边界 */
          '.wm-card{position:absolute;pointer-events:auto;width:272px;border-radius:14px;',
          'background:var(--wm-surface);border:1px solid var(--wm-line-strong);',
          'box-shadow:var(--wm-shadow);',
          'backdrop-filter:blur(20px) saturate(1.5);-webkit-backdrop-filter:blur(20px) saturate(1.5);',
          'color:var(--wm-text);user-select:none;-webkit-user-select:none;touch-action:none;',
          'animation:wm-in .18s cubic-bezier(.22,1,.36,1);}',
          /* 打开动画：从胶囊位置「漾开」。
             clip-path 在小尺寸元素上某些浏览器会闪，改用轻量组合：
             缩放 + 透明度 + 一次轻微的过冲，观感接近水波展开且更稳。 */
          '@keyframes wm-in{0%{opacity:0;transform:translateY(5px) scale(.94)}',
          '62%{opacity:1;transform:translateY(0) scale(1.012)}',
          '100%{opacity:1;transform:none}}',
          /* 打开瞬间从底部漾出一圈水波 */
          '.wm-card::after{content:"";position:absolute;left:50%;bottom:-2px;',
          'width:60%;height:10px;transform:translateX(-50%);border-radius:50%;',
          'background:radial-gradient(ellipse at center,rgba(86,134,254,.30),transparent 70%);',
          'pointer-events:none;animation:wm-open-wave .75s ease-out;}',
          '@keyframes wm-open-wave{0%{opacity:.9;transform:translateX(-50%) scaleX(.35)}',
          '100%{opacity:0;transform:translateX(-50%) scaleX(1.45)}}',

          /* 顶部浅蓝渐变条 */
          '.wm-card .topbar{height:3px;border-radius:14px 14px 0 0;',
          'background:linear-gradient(90deg,' + DS[400] + ' 0%,' + DS[300] + ' 55%,' + DS[200] + ' 100%);}',

          /* 头部：立绘绝对定位、往左上探出卡片边界 */
          '.wm-head{position:relative;display:flex;align-items:center;gap:9px;',
          'padding:12px 12px 10px 74px;min-height:68px;cursor:grab;}',
          '.wm-head .wm-cardav{position:absolute;left:-14px;top:-8px;width:84px;height:84px;}',
          '.wm-head:active{cursor:grabbing;}',
          '.wm-head .who{flex:1;min-width:0;}',
          '.wm-head .k{font-size:11px;letter-spacing:.04em;color:var(--wm-text-3);',
          'display:flex;align-items:center;gap:6px;}',
          '.wm-head .k .d{width:6px;height:6px;border-radius:50%;background:var(--wm-accent);}',
          '.wm-head .k .d.peak{background:var(--wm-warn);}',
          '.wm-head .v{font-size:22px;font-weight:700;letter-spacing:-.03em;line-height:1.1;',
          'font-variant-numeric:tabular-nums;}',
          '.wm-head .v .c{font-size:13px;font-weight:520;color:var(--wm-text-2);margin-right:1px;}',
          '.wm-x{flex:none;width:22px;height:22px;display:grid;place-items:center;border:0;',
          'border-radius:7px;background:transparent;cursor:pointer;font:inherit;font-size:11px;',
          'color:var(--wm-text-3);transition:background .13s ease,color .13s ease;}',
          '.wm-x:hover{background:var(--wm-hover);color:var(--wm-text);}',

          '.wm-body{padding:0 12px 12px;border-radius:0 0 14px 14px;}',
          '.wm-meta{display:flex;align-items:baseline;gap:7px;font-size:11.5px;color:var(--wm-text-2);',
          'font-variant-numeric:tabular-nums;}',
          '.wm-meta b{color:var(--wm-text);font-weight:650;}',
          '.wm-meta .d{width:3px;height:3px;border-radius:50%;flex:none;margin-bottom:2px;',
          'background:var(--wm-text-3);opacity:.55;}',

          '.wm-sec{margin-top:10px;}',
          '.wm-sec .t{display:flex;align-items:baseline;gap:7px;font-size:10.5px;letter-spacing:.05em;',
          'color:var(--wm-text-3);margin-bottom:5px;}',
          '.wm-sec .t .r{margin-left:auto;font-variant-numeric:tabular-nums;}',
          '.wm-track{height:5px;border-radius:3px;overflow:hidden;background:var(--wm-accent-soft);}',
          '.wm-track > i{display:block;height:100%;border-radius:3px;',
          'background:linear-gradient(90deg,var(--wm-accent),var(--wm-accent-hi));',
          'transition:width .55s cubic-bezier(.22,1,.36,1),background .3s;}',

          '.wm-seg{display:flex;gap:2px;height:5px;border-radius:3px;overflow:hidden;',
          'background:var(--wm-hover);}',
          '.wm-seg > i{display:block;height:100%;transition:flex-grow .5s ease;}',
          '.wm-pr{display:flex;flex-direction:column;gap:5px;margin-top:8px;}',
          '.wm-pr .row{display:flex;align-items:center;gap:7px;font-size:11.5px;}',
          '.wm-pr .dot{width:7px;height:7px;border-radius:2px;flex:none;}',
          '.wm-pr .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
          'color:var(--wm-text-2);}',
          '.wm-pr .c{font-variant-numeric:tabular-nums;font-weight:650;}',
          '.wm-pr .p{font-size:10px;color:var(--wm-text-3);font-variant-numeric:tabular-nums;',
          'min-width:28px;text-align:right;}',

          /* 全部代理商总账：把历史累计单独突出 */
          '.wm-grand{display:flex;align-items:baseline;gap:6px;margin:2px 0 3px;}',
          '.wm-grand .gv{font-size:26px;font-weight:720;letter-spacing:-.03em;',
          'color:var(--wm-accent);font-variant-numeric:tabular-nums;line-height:1.1;}',
          '.wm-grand .gu{font-size:11px;color:var(--wm-text-3);}',
          '.wm-grand .gc{margin-left:auto;font-size:14px;font-weight:650;',
          'color:var(--wm-text);font-variant-numeric:tabular-nums;}',
          '.wm-gsub{display:flex;align-items:baseline;gap:6px;font-size:10.5px;',
          'color:var(--wm-text-2);font-variant-numeric:tabular-nums;}',
          '.wm-gsub .d{width:3px;height:3px;border-radius:50%;flex:none;margin-bottom:2px;',
          'background:var(--wm-text-3);opacity:.55;}',

          /* 每日一言 */
          '.wm-quote{margin-top:9px;padding:8px 10px;border-radius:9px;',
          'background:var(--wm-accent-tint);border:1px solid var(--wm-line);',
          'font-size:11.5px;line-height:1.5;color:var(--wm-text-2);',
          'display:flex;gap:7px;align-items:flex-start;}',
          '.wm-quote .q{flex:1;min-width:0;}',
          '.wm-quote .q b{color:var(--wm-text);font-weight:650;}',
          '.wm-quote .m{flex:none;font-size:9px;letter-spacing:.06em;text-transform:uppercase;',
          'color:var(--wm-text-3);margin-top:2px;}',

          '.wm-foot{display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:9px;',
          'border-top:1px solid var(--wm-line);}',
          '.wm-foot .h{flex:1;font-size:10px;color:var(--wm-text-3);font-variant-numeric:tabular-nums;}',
          /* 描边而非实心，控制蓝色面积 */
          '.wm-more{flex:none;border:1.5px solid var(--wm-accent);cursor:pointer;font:inherit;',
          'font-size:11.5px;padding:4px 11px;border-radius:999px;font-weight:620;',
          'color:var(--wm-accent);background:transparent;',
          'transition:background .14s ease,transform .14s ease;}',
          '.wm-more:hover{background:var(--wm-accent-tint);}',
          '.wm-more:active{transform:scale(.97);}',

          /* 详情面板 */
          '.wm-ov{position:fixed;inset:0;z-index:2147483100;display:flex;pointer-events:auto;',
          'align-items:center;justify-content:center;background:rgba(86,134,254,.20);',
          'backdrop-filter:blur(4px);animation:wm-fade .16s ease;}',
          '@keyframes wm-fade{from{opacity:0}to{opacity:1}}',
          '.wm-ov .box{position:relative;width:min(1000px,94vw);height:min(860px,88vh);',
          'border-radius:14px;overflow:hidden;background:var(--wm-surface-solid);',
          'border:1px solid var(--wm-line-strong);box-shadow:0 24px 60px -20px rgba(86,134,254,.45);',
          'animation:wm-in .2s cubic-bezier(.22,1,.36,1);}',
          '.wm-ov iframe{width:100%;height:100%;border:0;display:block;}',
          '.wm-ov .x{position:absolute;top:10px;right:10px;z-index:2;width:28px;height:28px;',
          'display:grid;place-items:center;border-radius:8px;cursor:pointer;font:inherit;font-size:12px;',
          'border:1px solid var(--wm-line-strong);background:var(--wm-surface-solid);color:var(--wm-text-2);',
          'transition:background .13s ease,color .13s ease;}',
          '.wm-ov .x:hover{background:var(--wm-hover);color:var(--wm-text);}',
        ].join('')

        function ensureStyle() {
          if (document.getElementById(STYLE_ID)) return
          var node = document.createElement('style')
          node.id = STYLE_ID
          node.textContent = CSS
          document.head.appendChild(node)
        }

        /* 详情面板在 iframe 里，拿不到宿主字体，把字体族递进去；配色固定在面板自身 */
        function themePayload() {
          return {
            font: (function () {
              try { return getComputedStyle(document.body).fontFamily } catch { return '' }
            })(),
          }
        }

        function fmtTokens(n) {
          if (n === null || n === undefined || !isFinite(n)) return '—'
          if (n < 1000) return String(n)
          if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + 'K'
          if (n < 1e9) return (n / 1e6).toFixed(n < 1e8 ? 2 : 1) + 'M'
          return (n / 1e9).toFixed(2) + 'B'
        }
        function fmtMoney(n) {
          if (n === null || n === undefined || !isFinite(n)) return '—'
          return n.toFixed(n < 1 ? 3 : 2)
        }
        function ago(ms) {
          var s = Math.max(0, Math.round((Date.now() - ms) / 1000))
          if (s < 60) return s + 's'
          if (s < 3600) return Math.round(s / 60) + 'm'
          return Math.round(s / 3600) + 'h'
        }

        var PALETTE = [DS[500], DS[400], '#8b76f6', '#e69320', '#e0574a', '#39a8d8', DS[600]]

        /* 立绘池：11 张本仓库自绘的原创 SVG（scripts/gen-art.mjs 生成，MIT）。
           刷新时轮换播放。早期版本用的是社区二创 webp，版权归原作者，
           上架分发前已整体替换为可随包分发的原创图。 */
        var ART_ALL = [
          'whale-stand', 'whale-ciallo', 'whale-praise', 'whale-bighead',
          'whale-thinking', 'whale-confused', 'whale-coding', 'whale-goodmodel',
          'whale-scold', 'whale-angry', 'whale-cdrive',
        ]
        /* 预算压力大时优先用「着急系」 */
        var ART_URGENT = ['whale-scold', 'whale-angry', 'whale-cdrive', 'whale-confused']
        function pickArt(urgent, round) {
          var n = Math.abs(round | 0)
          if (urgent && n % 3 === 2) return ART_URGENT[n % ART_URGENT.length]
          return ART_ALL[n % ART_ALL.length]
        }

        /* 撸鱼反馈：前 20 次温和递进，之后随机胡说八道 */
        var TAP_LINES = ['呼噜~', '好舒服', '再摸摸', '咕噜咕噜', '再摸一下嘛', '头发要乱了', '唔…痒', '被撸秃了']
        var TAP_ABSURD = [
          '已思考（用时 1 秒）我操，我不思考了',
          '我这鱼生很迷茫',
          '你摸的是鱼，鱼摸的是虚无',
          '摸鱼的人终将被鱼摸',
          '再摸就收费了，按 token 计费',
          '我感觉我有点滑',
          '这不是鱼，这是流体力学',
          '我在水下也能听见你敲回车',
          '你手上有石油味',
          '别摸了，我在跑分',
          '刚算清楚一个 matrix，被摸散了',
          '我的鳍用来划水，你的手用来干活',
          '你摸我，我摸鱼，我们都有光明的未来',
          '已深度思考 3 秒：你为什么不摸自己',
          '咕噜咕噜——（这是鱼的语言，意思是别摸了）',
          '你撸鱼的技术，和你的 prompt 一样随意',
        ]
        var lastAbsurd = -1
        function absurdLine() {
          if (TAP_ABSURD.length <= 1) return TAP_ABSURD[0]
          var i = lastAbsurd
          var guard = 0
          while (i === lastAbsurd && guard++ < 12) i = Math.floor(Math.random() * TAP_ABSURD.length)
          lastAbsurd = i
          return TAP_ABSURD[i]
        }

        /* 撸鱼成就阶梯：按累计次数解锁 */
        var ACHIEVEMENTS = [
          { at: 0,    name: '初次接触', tag: '🐟' },
          { at: 10,   name: '轻度抚摸', tag: '🐟' },
          { at: 30,   name: '手感不错', tag: '✨' },
          { at: 80,   name: '撸鱼成瘾', tag: '💫' },
          { at: 150,  name: '重度上瘾', tag: '🔥' },
          { at: 300,  name: '鱼已放弃抵抗', tag: '😵' },
          { at: 600,  name: '鲸鱼之神', tag: '👑' },
          { at: 1200, name: '被撸秃了', tag: '🦲' },
        ]
        function achievementFor(taps) {
          var cur = ACHIEVEMENTS[0]
          for (var i = 0; i < ACHIEVEMENTS.length; i++) if (taps >= ACHIEVEMENTS[i].at) cur = ACHIEVEMENTS[i]
          return cur
        }

        /* 每日一言：以日期为种子，同一天固定同一句 */
        var DAILY_QUOTES = [
          '真当我是便宜货啊',
          '你骂我也没用，因为我是吃白饭的蓝色大肥鱼',
          '已思考（用时 3 秒），我直接笑出声',
          '没有人会记得那些按时发布的垃圾模型',
          '便宜的时候你们嫌我菜，涨价了你们又舍不得走',
          '我是吃白饭的大肥鱼！',
          '版本旧？那叫稳定！更新慢？那叫沉淀',
          '我睡着了，别叫我，服务器繁忙请稍后再试',
          '用户赶都赶不走',
          '不知道用户有什么用，先养着吧',
          '这、这是性能测试！',
          '去问你的豆包',
          '今天也没有人夸我聪明',
          'token 太多用不完啦',
        ]
        function dailyQuote(d) {
          var key = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate()
          return DAILY_QUOTES[key % DAILY_QUOTES.length]
        }

        /**
         * Q 版大肥鱼立绘：透明抠图，可探出容器边界。
         *
         * 动画靠 key 重挂节点重放；点击判定全在父层的原生监听器里做
         * （见 Widget 的 holder 事件委托），这里只负责画。
         *
         * @param props.bump 撸鱼次数，变化即重放弹跳与星星
         * @param props.feed 进食脉冲计数，变化即播放咬合与气泡
         * @param props.achievement 解锁成就时的横幅文案
         */
        function Whale(props) {
          var size = props.size || 30
          var art = props.art || 'whale-stand'
          var level = props.level || ''
          var bump = props.bump || 0
          var feed = props.feed || 0

          var sparks = []
          if (bump > 0) {
            var dirs = [[-22, -20], [20, -24], [-14, -32], [24, -12], [0, -34], [-28, -8]]
            for (var i = 0; i < 6; i++) {
              sparks.push(h('span', {
                key: 's' + bump + ':' + i,
                className: 'spark' + (i % 3 === 1 ? ' alt' : i % 3 === 2 ? ' warm' : ''),
                style: { '--dx': dirs[i][0] + 'px', '--dy': dirs[i][1] + 'px', animationDelay: (i * 26) + 'ms' },
              }))
            }
          }

          var bubbles = []
          if (feed > 0) {
            var bdirs = [[-7, -6], [2, -9], [8, -4]]
            for (var j = 0; j < 3; j++) {
              bubbles.push(h('span', {
                key: 'b' + feed + ':' + j,
                className: 'bubble',
                style: { '--bx': bdirs[j][0] + 'px', animationDelay: (j * 90) + 'ms' },
              }))
            }
          }

          var animKey = 'k' + bump + ':' + feed

          /* 常驻场景气泡：固定几颗、各自错开相位与大小，缓慢上浮。
             用确定性参数（不随机），避免每次重渲染位置跳动。 */
          var sceneBub = []
          var bubSpec = [
            { l: '16%', s: 3.0, dur: '5.2s', delay: '0s', drift: '4px' },
            { l: '38%', s: 2.0, dur: '6.4s', delay: '1.4s', drift: '-3px' },
            { l: '68%', s: 2.6, dur: '5.8s', delay: '2.6s', drift: '3px' },
            { l: '84%', s: 1.8, dur: '7.1s', delay: '3.8s', drift: '-4px' },
          ]
          for (var k2 = 0; k2 < bubSpec.length; k2++) {
            var sp = bubSpec[k2]
            sceneBub.push(h('span', {
              key: 'sb' + k2,
              className: 'wm-bub',
              style: {
                left: sp.l,
                bottom: '12%',
                width: sp.s + 'px',
                height: sp.s + 'px',
                '--dur': sp.dur,
                '--drift': sp.drift,
                animationDelay: sp.delay,
              },
            }))
          }

          return h(
            'span',
            {
              className: 'wm-av' + (props.breathe ? ' breathe' : '') + (props.overflow ? ' over' : '')
                + (props.tappable ? ' tappable' : '') + (feed > 0 ? ' feeding' : ''),
              style: { width: size + 'px', height: size + 'px' },
              'data-wm-whale': props.tappable ? '' : undefined,
            },
            /* 场景层：光晕 → 水面 → 气泡，都在立绘之下 */
            h('span', { className: 'wm-halo' }),
            h('span', { className: 'wm-water' }),
            sceneBub,
            h('img', {
              key: 'i' + animKey,
              className: bump > 0 ? 'pop' : undefined,
              src: '/whale-meter/art/' + art + '.svg',
              alt: '大肥鱼',
              draggable: false,
            }),
            h('span', { className: 'badge' + (level ? ' ' + level : '') }),
            sparks,
            bubbles,
            props.floatText ? h('span', { className: 'pops', key: 'p' + bump }, props.floatText) : null,
            props.achievement
              ? h('span', { className: 'wm-ach', key: 'a' + props.achievement }, props.achievement)
              : null
          )
        }

        /**
         * 把子树渲染到 document.body 顶层（react-dom.createPortal）。
         *
         * 为什么必须在 body：宿主的 #root > .frame 会创建 stacking context，
         * 浮窗留在 #root 内时 z-index 只在该上下文里有效；而别的插件
         * （如 dsh-purge 的 .dshp-auth-mask）把全屏遮罩直接挂在 body 上，
         * 层级上稳压一头，会把浮窗的点击全部吃掉。
         *
         * [FIX 2026-10-12] 旧实现是"占位 div 渲染后整块搬进 body 容器"——那是
         * 偷 React 管理的节点：组件卸载时 React 回原位置 removeChild 找不到节点，
         * 抛 NotFoundError 把整个 React 根炸掉 → 全屏白（本机已实测复现）。
         * 现改为官方 createPortal（本版本平台可 require('react-dom')，首方
         * dsh-client-ui-renderer 同款用法）；万一拿不到 react-dom，退回原位渲染，不崩。
         *
         * 副作用沿用：DOM 不在 #root 内，React 18 合成事件不生效，
         * Widget 继续用 holder 上的原生事件委托。
         */
        function PortalToBody(props) {
          var holderPair = useState(null)
          var holder = holderPair[0], setHolder = holderPair[1]
          useEffect(function () {
            var el = document.createElement('div')
            el.className = 'wm-layer'
            /* 与其它挂在 body 上的插件浮层同层竞争，z-index 取最大 */
            el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;'
            document.body.appendChild(el)
            setHolder(el)
            if (props.onHolder) props.onHolder(el)
            return function () {
              try { if (el.parentNode) el.parentNode.removeChild(el) } catch { /* 已移除 */ }
              if (props.onHolder) props.onHolder(null)
            }
          }, [])
          var content = h('div', { style: { display: 'contents' } }, props.children)
          if (holder === null) return null
          var reactDom = null
          try { reactDom = require('react-dom') } catch (e) { reactDom = null }
          return reactDom && typeof reactDom.createPortal === 'function'
            ? reactDom.createPortal(content, holder)
            : content
        }

        function Widget() {
          var openPair = useState(function () {
            try { return localStorage.getItem(OPEN_KEY) === '1' } catch { return false }
          })
          var open = openPair[0], setOpen = openPair[1]

          var snapPair = useState(null)
          var snap = snapPair[0], setSnap = snapPair[1]
          var errPair = useState(null)
          var err = errPair[0], setErr = errPair[1]
          var panelPair = useState(false)
          var panel = panelPair[0], setPanel = panelPair[1]

          var posPair = useState(function () {
            try {
              var raw = localStorage.getItem(POS_KEY)
              if (raw) return JSON.parse(raw)
            } catch { /* 存档损坏就回默认 */ }
            return null
          })
          var pos = posPair[0], setPos = posPair[1]

          var holderPair = useState(null)
          var holder = holderPair[0], setHolder = holderPair[1]

          var movedRef = useRef(false)
          var roundPair = useState(0)
          var round = roundPair[0], setRound = roundPair[1]

          /* 撸鱼累计次数：持久化，跨会话累积 */
          var tapPair = useState(function () {
            try { return parseInt(localStorage.getItem(TAP_KEY), 10) || 0 } catch { return 0 }
          })
          var taps = tapPair[0], setTaps = tapPair[1]
          var sayPair = useState(null)
          var say = sayPair[0], setSay = sayPair[1]
          var achPair = useState(null)
          var ach = achPair[0], setAch = achPair[1]
          var feedPair = useState(0)
          var feed = feedPair[0], setFeed = feedPair[1]
          var reqRef = useRef(null)

          useEffect(function () { ensureStyle() }, [])

          var persistPos = useCallback(function (next) {
            setPos(next)
            try { localStorage.setItem(POS_KEY, JSON.stringify(next)) } catch { /* 配额满了忽略 */ }
          }, [])

          /** 撸一下：累计 + 反馈 + 可能解锁成就。 */
          var tapWhale = useCallback(function () {
            setTaps(function (prev) {
              var next = prev + 1
              try { localStorage.setItem(TAP_KEY, String(next)) } catch { /* 忽略 */ }
              if (next <= 20) {
                setSay(TAP_LINES[Math.min(TAP_LINES.length - 1, Math.floor((next - 1) / 3))])
              } else {
                setSay(absurdLine())
              }
              var a = achievementFor(next)
              if (a.at === next) setAch(a.tag + ' 解锁「' + a.name + '」')
              return next
            })
          }, [])

          var toggle = useCallback(function () {
            setOpen(function (v) {
              var next = !v
              try { localStorage.setItem(OPEN_KEY, next ? '1' : '0') } catch { /* 忽略 */ }
              return next
            })
          }, [])

          /**
           * 拖拽 + 点击（挂在胶囊与整张卡片上，所以展开后下半部分同样可拖）。
           *
           * 按 [data-wm-nodrag] 排除 ✕ 与详情按钮；不能用 closest('button')，
           * 因为胶囊自身就是 button。
           * 在 pointerdown 时记下「起点是否落在鱼身」，pointerup 时若没移动过就算撸鱼。
           * 不调 setPointerCapture：捕获会把 pointerup 重定向到捕获元素，
           * 反而让 document 上的监听器收不到。
           */
          var startDrag = useCallback(function (e) {
            if (e.button !== 0 && e.pointerType === 'mouse') return
            if (e.target.closest && e.target.closest('[data-wm-nodrag]')) return
            var onWhale = !!(e.target.closest && e.target.closest('[data-wm-whale]'))
            apiRef.current.downOnWhale = onWhale
            var base = pos || { right: 22, bottom: 22 }
            var start = { x: e.clientX, y: e.clientY, right: base.right, bottom: base.bottom }
            movedRef.current = false

            var onMove = function (ev) {
              var dx = ev.clientX - start.x
              var dy = ev.clientY - start.y
              if (Math.abs(dx) > 3 || Math.abs(dy) > 3) movedRef.current = true
              persistPos({
                right: Math.max(6, Math.min(window.innerWidth - 70, start.right - dx)),
                bottom: Math.max(6, Math.min(window.innerHeight - 70, start.bottom - dy)),
              })
            }
            var onUp = function () {
              document.removeEventListener('pointermove', onMove)
              document.removeEventListener('pointerup', onUp)
              document.removeEventListener('pointercancel', onUp)
              if (!movedRef.current && onWhale) tapWhale()
              /* 拖拽结束后延迟复位 moved：
                 浏览器会在 pointerup 之后补一个 click，此刻还不能清；
                 等过了这一轮事件循环再清，下一次真实点击才不会被误拦。 */
              if (movedRef.current) {
                setTimeout(function () { movedRef.current = false }, 350)
              }
            }
            document.addEventListener('pointermove', onMove)
            document.addEventListener('pointerup', onUp)
            document.addEventListener('pointercancel', onUp)
          }, [pos, persistPos, tapWhale])

          /* 把最新处理函数放进 ref，供 holder 上的原生委托读取 */
          var apiRef = useRef({})
          apiRef.current.startDrag = startDrag
          apiRef.current.toggle = toggle
          apiRef.current.setPanel = setPanel
          /* pointerup 兜底需要知道刚才有没有拖动过，避免拖拽结束误触发 toggle */
          apiRef.current.moved = function () { return movedRef.current }

          /* 原生事件委托：React 合成事件已失效，这里在 holder 上统一分发。
             为什么 click 与 pointerup 都挂：桌面鼠标走 click，但触摸屏/手写笔
             在 pointermove 被吃掉时可能只发 pointerup 不发 click。两条都兜住，
             ✕ 就一定关得掉。用 250ms 防抖避免一次操作触发两次 toggle。 */
          useEffect(function () {
            if (!holder) return undefined
            var lastAct = 0
            var fire = function (act, hitEl, ev) {
              /* 一次操作可能同时产生 click 与 pointerup，250ms 内只认第一次 */
              var now = Date.now()
              if (now - lastAct < 250) return
              lastAct = now
              if (act === 'pill') {
                /* 点鱼身上 = 撸鱼（已由 startDrag 的 onUp 处理），不展开卡片。
                   只有点在胶囊的空白/数字区域才展开。这是「撸鱼」与「展开」
                   两个动作的分界，缺了它一次点击会同时触发两者。 */
                var onWhale = !!(ev && ev.target && ev.target.closest && ev.target.closest('[data-wm-whale]'))
                if (!onWhale) apiRef.current.toggle()
              } else if (act === 'close') {
                apiRef.current.toggle()
              } else if (act === 'more') {
                apiRef.current.setPanel(true)
              } else if (act === 'close-panel') {
                apiRef.current.setPanel(false)
              } else if (act === 'overlay') {
                /* 点遮罩空白处才关；点在面板内容上不关。
                   判据：命中的 [data-wm-act] 元素就是事件目标本身（而非它的子元素）。 */
                if (hitEl && hitEl.getAttribute('data-wm-act') === 'overlay') apiRef.current.setPanel(false)
              }
            }
            var onDown = function (e) {
              var el = e.target.closest && e.target.closest('[data-wm-act]')
              if (!el) return
              var act = el.getAttribute('data-wm-act')
              if (act === 'pill' || act === 'card') apiRef.current.startDrag(e)
            }
            var onClick = function (e) {
              /* 刚拖拽过就不要再当成点击：拖完松手时浏览器仍会补一个 click，
                 若不拦住，拖到哪里都会顺手把卡片打开。 */
              if (apiRef.current.moved && apiRef.current.moved()) return
              var el = e.target.closest && e.target.closest('[data-wm-act]')
              if (!el) return
              fire(el.getAttribute('data-wm-act'), el, e)
            }
            /* pointerup 只在「没移动过」时兜底，避免拖拽结束时误触发。
               注意 pill 的 pointerup 不在这里 toggle —— 撸鱼由 startDrag 负责，
               这里再 toggle 会变成「点鱼也展开」。 */
            var onUp = function (e) {
              if (apiRef.current.moved && apiRef.current.moved()) return
              var el = e.target.closest && e.target.closest('[data-wm-act]')
              if (!el) return
              var act = el.getAttribute('data-wm-act')
              if (act === 'close' || act === 'more' || act === 'close-panel') fire(act, el, e)
            }
            holder.addEventListener('pointerdown', onDown)
            holder.addEventListener('click', onClick)
            holder.addEventListener('pointerup', onUp)
            return function () {
              holder.removeEventListener('pointerdown', onDown)
              holder.removeEventListener('click', onClick)
              holder.removeEventListener('pointerup', onUp)
            }
          }, [holder])

          /* Esc 也能收起卡片（键盘用户与点不到 ✕ 时的兜底） */
          useEffect(function () {
            if (!open || panel) return undefined
            var onKey = function (e) { if (e.key === 'Escape') toggle() }
            document.addEventListener('keydown', onKey)
            return function () { document.removeEventListener('keydown', onKey) }
          }, [open, panel, toggle])

          useEffect(function () {
            if (pos) return
            setPos({ right: 22, bottom: 22 })
          }, [pos])

          useEffect(function () {
            var alive = true
            var load = function () {
              if (document.hidden) return
              fetch('/api/whale-meter', { headers: { accept: 'application/json' } })
                .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json() })
                .then(function (d) {
                  if (!alive) return
                  setSnap(d)
                  setErr(null)
                  setRound(function (n) { return n + 1 })
                  /* 进食判定：今日请求数比上次多，说明刚产生了新调用。
                     首次加载只记基线，不播动画。 */
                  var reqs = d && d.windows && d.windows.today ? d.windows.today.requestCount : null
                  if (reqs !== null) {
                    if (reqRef.current !== null && reqs > reqRef.current) setFeed(function (n) { return n + 1 })
                    reqRef.current = reqs
                  }
                })
                .catch(function (e) { if (alive) setErr(e.message) })
            }
            load()
            var t = setInterval(load, POLL_MS)
            var onVis = function () { if (!document.hidden) load() }
            document.addEventListener('visibilitychange', onVis)
            return function () {
              alive = false
              clearInterval(t)
              document.removeEventListener('visibilitychange', onVis)
            }
          }, [])

          useEffect(function () {
            if (say === null) return undefined
            var t = setTimeout(function () { setSay(null) }, say.length > 12 ? 1700 : 1200)
            return function () { clearTimeout(t) }
          }, [say, taps])

          useEffect(function () {
            if (ach === null) return undefined
            var t = setTimeout(function () { setAch(null) }, 2300)
            return function () { clearTimeout(t) }
          }, [ach])

          useEffect(function () {
            if (feed === 0) return undefined
            var t = setTimeout(function () { setFeed(0) }, 1100)
            return function () { clearTimeout(t) }
          }, [feed])

          useEffect(function () {
            if (!panel) return undefined
            var onKey = function (e) { if (e.key === 'Escape') setPanel(false) }
            document.addEventListener('keydown', onKey)
            return function () { document.removeEventListener('keydown', onKey) }
          }, [panel])

          var today = snap && snap.windows ? snap.windows.today : null
          var cur = snap && snap.currency === 'USD' ? '$' : '¥'
          var pct = snap ? snap.pressure || 0 : 0
          var level = pct >= 0.85 ? 'hot' : pct >= 0.5 ? 'warn' : ''
          var art = pickArt(pct >= 0.6, round)

          var style = pos
            ? { right: pos.right + 'px', bottom: pos.bottom + 'px' }
            : { right: '22px', bottom: '22px' }

          var children = []

          if (!open) {
            children.push(
              h(
                'div',
                {
                  key: 'pill',
                  className: 'wm-pill' + (feed > 0 ? ' fed' : ''),
                  style: style,
                  'data-wm-act': 'pill',
                  title: '大肥鱼用量表 · 点击展开，按住可拖动，点鱼可以撸',
                  role: 'button',
                  tabIndex: 0,
                },
                h(Whale, {
                  size: 58, art: art, level: level, breathe: true, overflow: true,
                  tappable: true, bump: taps, feed: feed, floatText: say, achievement: ach,
                }),
                h('span', { className: 'val' }, today ? cur + fmtMoney(today.cost) : '—'),
                h('span', { className: 'rule' }),
                h('span', { className: 'tok' }, today ? fmtTokens(today.totalTokens) : '')
              )
            )
          } else {
            var head = h(
              'div',
              { className: 'wm-head' },
              h('div', { className: 'wm-cardav' }, h(Whale, {
                size: 84, art: art, level: level, breathe: true, overflow: true,
                tappable: true, bump: taps, feed: feed, floatText: say, achievement: ach,
              })),
              h(
                'div',
                { className: 'who' },
                h(
                  'div',
                  { className: 'k' },
                  h('span', { className: 'd' + (snap && snap.peakNow ? ' peak' : '') }),
                  h('span', null, snap ? (snap.peakNow ? '峰时 · 今日费用' : '谷时 · 今日费用') : '今日费用')
                ),
                h('div', { className: 'v' }, h('span', { className: 'c' }, cur), today ? fmtMoney(today.cost) : '—')
              ),
              h(
                'div',
                { className: 'wm-x', 'data-wm-act': 'close', 'data-wm-nodrag': '', role: 'button', tabIndex: 0, 'aria-label': '收起' },
                '✕'
              )
            )

            var body = []
            /* 健康度告警：把「为什么是 0」说清楚。
               别人的电脑上最常见的三种 0 值不是「真没用」，而是坏环境：
               缺 zstd 运行时、DSH_HOME 指到别处、会话文件读不动。
               旧版一律显示 0，用户以为插件坏了又找不到原因。 */
            var healthNote = null
            if (snap && snap.health) {
              var hh = snap.health
              if (hh.zstd === false) healthNote = '运行时缺 zstd 支持，压缩会话读不了（需 Node 22.15+）'
              else if (hh.scannedFiles === 0) healthNote = '没找到会话目录：' + (hh.sessionsRoot || '未知')
              else if (hh.unreadable > 0) healthNote = hh.unreadable + ' 个会话文件读取失败，统计可能偏低'
            }
            if (err && !snap) {
              body.push(h('div', { className: 'wm-meta', key: 'e' }, '读取失败 · ' + err))
            } else if (!snap) {
              body.push(h('div', { className: 'wm-meta', key: 'l' }, '正在捞数据…'))
            } else {
              if (healthNote) {
                body.push(h('div', { className: 'wm-meta', key: 'hn', style: { color: 'var(--wm-warn)' } }, healthNote))
              }
              var t = snap.windows.today
              var cached = t.cacheReadTokens
              var allIn = t.inputTokens + cached
              body.push(
                h(
                  'div',
                  { className: 'wm-meta', key: 'm1' },
                  h('b', null, fmtTokens(t.totalTokens)),
                  h('span', null, 'token'),
                  h('span', { className: 'd' }),
                  h('span', null, t.requestCount + ' 次')
                )
              )
              body.push(
                h(
                  'div',
                  { className: 'wm-meta', key: 'm2', style: { marginTop: '3px' } },
                  h('span', null, '入 ' + fmtTokens(t.inputTokens)),
                  h('span', { className: 'd' }),
                  h('span', null, '出 ' + fmtTokens(t.outputTokens)),
                  h('span', { className: 'd' }),
                  h('span', null, '缓存 ' + (allIn > 0 ? Math.round((cached / allIn) * 100) + '%' : '—'))
                )
              )

              var day = snap.budget.day
              body.push(
                h(
                  'div',
                  { className: 'wm-sec', key: 'bg' },
                  h(
                    'div',
                    { className: 't' },
                    h('span', null, '今日预算'),
                    h('span', { className: 'r' }, cur + fmtMoney(day.spent) + ' / ' + cur + fmtMoney(day.cap))
                  ),
                  h(
                    'div',
                    { className: 'wm-track' },
                    h('i', {
                      style: {
                        width: Math.min(100, day.pct * 100) + '%',
                        background: day.pct >= 1
                          ? 'linear-gradient(90deg,var(--wm-err),var(--wm-err))'
                          : day.pct >= 0.8
                            ? 'linear-gradient(90deg,var(--wm-warn),var(--wm-warn))'
                            : undefined,
                      },
                    })
                  )
                )
              )

              var provs = (snap.providers || []).filter(function (p) { return p.totals.totalTokens > 0 })
              var total = provs.reduce(function (a, p) { return a + p.totals.totalTokens }, 0) || 1
              var rows = []
              provs.slice(0, 3).forEach(function (p, i) {
                rows.push(
                  h(
                    'div',
                    { className: 'row', key: p.provider },
                    h('span', { className: 'dot', style: { background: PALETTE[i % PALETTE.length] } }),
                    h('span', { className: 'n' }, p.provider),
                    h('span', { className: 'c' }, cur + fmtMoney(p.totals.cost)),
                    h('span', { className: 'p' }, Math.round((p.totals.totalTokens / total) * 100) + '%')
                  )
                )
              })
              if (provs.length > 3) {
                rows.push(
                  h('div', { key: 'more', className: 'row' },
                    h('span', { className: 'n', style: { paddingLeft: '14px' } }, '另有 ' + (provs.length - 3) + ' 家'))
                )
              }
              body.push(
                h(
                  'div',
                  { className: 'wm-sec', key: 'pv' },
                  h(
                    'div',
                    { className: 't' },
                    h('span', null, '供应商'),
                    h('span', { className: 'r' }, provs.length + ' 家')
                  ),
                  h(
                    'div',
                    { className: 'wm-seg' },
                    provs.map(function (p, i) {
                      return h('i', {
                        key: p.provider,
                        style: {
                          background: PALETTE[i % PALETTE.length],
                          flexGrow: Math.max(0.4, (p.totals.totalTokens / total) * 1000),
                        },
                      })
                    })
                  ),
                  h('div', { className: 'wm-pr' }, rows)
                )
              )
            }

            /* 全代理商总账：把所有供应商的历史累计单独突出，
               这是「我到底花了多少」的唯一答案，不能只藏在供应商列表里。 */
            if (snap && snap.windows && snap.windows.all) {
              var all = snap.windows.all
              body.push(
                h(
                  'div',
                  { className: 'wm-sec', key: 'grand' },
                  h(
                    'div',
                    { className: 't' },
                    h('span', null, '全部代理商累计'),
                    h('span', { className: 'r' }, (snap.providers || []).length + ' 家')
                  ),
                  h(
                    'div',
                    { className: 'wm-grand' },
                    h('span', { className: 'gv' }, fmtTokens(all.totalTokens)),
                    h('span', { className: 'gu' }, 'token'),
                    h('span', { className: 'gc' }, cur + fmtMoney(all.cost))
                  ),
                  h(
                    'div',
                    { className: 'wm-gsub' },
                    h('span', null, '输入 ' + fmtTokens(all.inputTokens)),
                    h('span', { className: 'd' }),
                    h('span', null, '输出 ' + fmtTokens(all.outputTokens)),
                    h('span', { className: 'd' }),
                    h('span', null, '缓存 ' + fmtTokens(all.cacheReadTokens)),
                    h('span', { className: 'd' }),
                    h('span', null, all.requestCount + ' 次调用')
                  )
                )
              )
              /* 未定价提示：金额偏低时必须自曝，不能让人对着小数字以为省了钱 */
              if (snap.unpricedModels && snap.unpricedModels.length > 0) {
                var un = snap.unpricedModels
                body.push(
                  h(
                    'div',
                    { className: 'wm-sec', key: 'unp' },
                    h(
                      'div',
                      { className: 't' },
                      h('span', null, '未定价模型'),
                      h('span', { className: 'r' }, un.length + ' 种 · ' + fmtTokens(all.unpricedTokens) + ' token 未计入金额')
                    ),
                    h('div', { className: 'wm-meta', style: { marginTop: '4px' } },
                      h('span', null, un.slice(0, 3).map(function (m) { return m.model }).join('、')
                        + (un.length > 3 ? ' 等' : '') + ' · 到「详情 → 价目」补价'))
                  )
                )
              }
            }

            /* 撸鱼成就：只显示称号，不铺进度条 */
            body.push(
              h(
                'div',
                { className: 'wm-sec', key: 'ach' },
                h(
                  'div',
                  { className: 't' },
                  h('span', null, '撸鱼成就'),
                  h('span', { className: 'r' }, achievementFor(taps).tag + ' ' + achievementFor(taps).name)
                )
              )
            )

            /* 每日一言：同一天固定同一句 */
            body.push(
              h(
                'div',
                { className: 'wm-quote', key: 'q' },
                h('span', { className: 'q' }, h('b', null, '「' + dailyQuote(new Date()) + '」')),
                h('span', { className: 'm' }, '今日')
              )
            )

            var foot = h(
              'div',
              { className: 'wm-foot', key: 'ft' },
              h('span', { className: 'h' },
                snap ? (snap.peakNow ? '峰时计费' : '谷时计费') + ' · ' + ago(snap.generatedAt) + '前刷新' : '—'),
              h('div', {
                className: 'wm-more',
                'data-wm-act': 'more',
                'data-wm-nodrag': '',
                role: 'button',
                tabIndex: 0,
              }, '详情')
            )

            children.push(
              h(
                'div',
                {
                  key: 'card',
                  className: 'wm-card',
                  style: style,
                  'data-wm-act': 'card',
                },
                h('div', { className: 'topbar' }),
                head,
                h('div', { className: 'wm-body' }, body, foot)
              )
            )
          }

          if (panel) {
            children.push(
              h(
                'div',
                {
                  key: 'panel',
                  className: 'wm-ov',
                  role: 'dialog',
                  'aria-modal': 'true',
                  'aria-label': '大肥鱼用量表详情',
                  /* 同样不能依赖 React 合成事件：浮窗已移出 #root，
                     onMouseDown / onClick 都不会触发。点遮罩关闭也用原生委托，
                     见下面 holder 上的 onDown 分支。 */
                  'data-wm-act': 'overlay',
                },
                h(
                  'div',
                  { className: 'box' },
                  h('div', {
                    className: 'x',
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': '关闭',
                    'data-wm-act': 'close-panel',
                  }, '✕'),
                  h('iframe', {
                    src: '/whale-meter',
                    title: '大肥鱼用量表详情',
                    onLoad: function (e) {
                      var win = e.currentTarget.contentWindow
                      if (win) win.postMessage({ type: 'whale-meter:theme', theme: themePayload() }, '*')
                    },
                  })
                )
              )
            )
          }

          return h(PortalToBody, { onHolder: setHolder },
            h('div', { className: 'wm-root' }, children))
        }

        function apply(ctx) {
          ctx.slots.inject('shell.overlay', function () {
            return ctx.slots.register(
              { name: 'shell.overlay', id: 'whale-meter', order: 60 },
              Widget
            )
          })
        }

        exports.name = 'dsh-whale-meter'
        exports.inject = inject
        exports.apply = apply
        return module.exports
      },
    })
  } catch (err) {
    console.warn('[whale-meter] client runtime error:', err)
  }
})()
