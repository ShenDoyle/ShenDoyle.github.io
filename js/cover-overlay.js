/**
 * cover-overlay.js — 封面「蒙版 + 文字」层
 *
 * 依赖：/covermeta.json（由 scripts/covermeta.js 生成）
 *
 * ── 核心规则 ──────────────────────────────────────
 *   covertitle / coverset / coverdim 三处全空 → 完全不介入，原封面图原样显示
 *   三处任意一处有值 → 叠蒙版（未填强度时默认 0.46），有文字则渲染文字层
 *
 *   文章顶图（#page-header）不叠加任何东西，只保留背景原图。
 *
 *   ⚠️ 不做任何图片兜底：没配封面就用主题自带的默认封面图，
 *      图片加载失败也是主题自己的 onerror 行为 —— 本脚本不隐藏、不替换任何图片。
 *
 * ── 文字取值 ──────────────────────────────────────
 *   小字：固定 "CBM.IM"（品牌署名，与 Cover.psd 默认版式一致，不可配置）
 *   大字：主题文案（covertitle）。单行放得下就显示原文；放不下时在可读下限内
 *         自动缩排，缩到下限仍放不下 → 显示 "CBM.IM"，不截断、不折行。
 *   小卡（容器宽 < 300px）：只显示一行「分类」（如：运营 / 技术），
 *         无分类时回退 "CBM.IM"。
 *
 * ── 模糊框（半透明卡片）────────────────────────────
 *   严格等比复刻 cover-editor.html 的默认参数（画布 760，卡片 554 × 162）：
 *     宽 = 容器宽 × 554/760（并以容器高做内接保护）
 *     高 = 卡片宽 × 162/554        ← 比例硬锁
 *     圆角 20/554   内边距 20.75/554   主副标题间距 22.8/554（全部以卡片宽为基准）
 *   装不下时**加宽**卡片（保持比例），不改高度、不裁切文字。
 */

(function () {
  'use strict';

  // 子路径部署时改为 '/blog/covermeta.json'
  var META_URL = '/covermeta.json';

  // 默认蒙版强度，与 Cover.psd 中 dim 图层一致（#000 / 46%）
  var DEFAULT_DIM = 0.46;

  // 品牌兜底文案：小字固定值，也是大字 / 小卡放不下时的替代文案
  var BRAND = 'CBM.IM';

  // 基准画布（Cover.psd 原始尺寸）
  var BASE_W = 760;
  var BASE_H = 332;

  // 模糊框的固定比例 —— 取自 cover-editor.html 默认参数（卡片 554 × 162、圆角 20）
  var BOX = {
    w: 554 / 760,        // 卡片宽 = 容器宽 × 0.7289
    ratio: 162 / 554,    // 卡片高 = 卡片宽 × 0.2924（比例硬锁）
    inscribe: 554 / 162, // 内接保护：卡片高不超过容器高的 92%
    radius: 20 / 554,    // 圆角
    pad: 20.75 / 554,    // 内边距
    gap: 22.8 / 554,     // 主副标题间距
    font: 58 / 554,      // 大字字号 = 卡片宽 × 0.1047（与 58px@554 一致）
    sub: 20 / 554,       // 小字字号
    skew: -12            // 斜切角度（与 html 默认 tSkew 12 等价，不做档位区分）
  };

  // 档位：只在「字号下限」和「是否显示文字」上分档，框体尺寸不再分档
  var TIERS = [
    { id: 'xs', max: 170, tMin: 12, sMin: 10, showSub: false },
    { id: 'sm', max: 300, tMin: 13, sMin: 11, showSub: false },
    { id: 'md', max: 560, tMin: 16, sMin: 11, showSub: true },
    { id: 'lg', max: Infinity, tMin: 20, sMin: 12, showSub: true }
  ];

  // 小于这个宽度（侧栏缩略图一类）干脆不渲染文字层：3~4 个像素的框里塞不下任何一行
  var TEXT_FLOOR = 80;

  // 小卡门槛：容器宽低于此值只显示分类
  var SMALL_CARD = 300;

  // 覆盖电池/暗色管的文字保护：蒙版太浅时自动加深，保证可读
  var DIM_FLOOR = 0.32;

  // 锚点：以 img 为单位，overlay 挂到其父元素；文章页头图不在其中
  var TARGETS = [
    '.post_cover img.post_bg',
    '.article-sort-item-img img',
    '.aside-list-item img',
    '.top-group-item img.post_bg',
    '.blog-slider__img img'
  ];

  var meta = null;   // covermeta.json 原文
  var COVERS = {};   // { 文章路径: { t, c, d } }
  var ro = null;
  var timer = null;

  function norm(p) {
    return String(p || '')
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/\/index\.html?$/i, '')
      .replace(/\.html?$/i, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
  }

  function tierOf(w) {
    for (var i = 0; i < TIERS.length; i++) {
      if (w < TIERS[i].max) return TIERS[i];
    }
    return TIERS[TIERS.length - 1];
  }

  function px(v, min) {
    return Math.max(min || 0, Math.round(v * 100) / 100).toFixed(2) + 'px';
  }

  function findLink(el) {
    var p = el;
    for (var i = 0; i < 5 && p; i++) {
      if (p.tagName === 'A' && p.getAttribute('href')) return p;
      var a = p.querySelector && p.querySelector('a[href]');
      if (a) return a;
      p = p.parentElement;
    }
    return null;
  }

  function ensureHost(host, dim) {
    if (host.dataset.coHost === '1') return;
    host.dataset.coHost = '1';

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    if (getComputedStyle(host).overflow !== 'hidden') host.style.overflow = 'hidden';

    // 蒙版：铺满整个封面并压暗，让原图（含其中已烘焙的文字）退到背景层
    if (typeof dim !== 'number') dim = DEFAULT_DIM;
    if (dim > 0 && dim < DIM_FLOOR) dim = DIM_FLOOR;

    var mask = document.createElement('span');
    mask.className = 'co-dim';
    mask.style.setProperty('--co-dim', String(dim));
    host.insertBefore(mask, host.firstChild);
  }

  function buildOverlay(host, item) {
    var ov = host.querySelector('.co-wrap');
    if (!ov) {
      ov = document.createElement('div');
      ov.className = 'co-wrap';

      var card = document.createElement('div');
      card.className = 'co-card';
      // pangu.js（盘古之白，主题全站开）会在「CBM.IM」与中文之间插空格，
      // 实现方式是往文本节点前面塞空格 → 引发临界溢出。
      // pangu 的 canIgnoreNode 会检查祖先的 g_editable 属性，
      // 这里借这个无副作用的属性让整个文字卡片对 pangu 免疫。
      card.setAttribute('g_editable', 'true');

      var s = document.createElement('span');
      s.className = 'co-sub';
      var t = document.createElement('span');
      t.className = 'co-title';

      card.appendChild(s);
      card.appendChild(t);
      ov.appendChild(card);
      host.appendChild(ov);
    }
    ov.dataset.topic = item.t || '';
    ov.dataset.cat = item.c || '';
    return ov;
  }

  /* 文字真实宽度（px）。
     不能用 scrollWidth：文字比元素窄时它返回元素自身宽度，
     "是否放得下"的判定会退化成"永远放不下"。Range 量的是文字本身的宽度，
     且会把 letter-spacing 算进去。 */
  function textWidth(el, text) {
    el.textContent = text;
    var range = document.createRange();
    range.selectNodeContents(el);
    var w = range.getBoundingClientRect().width;
    if (range.detach) range.detach();
    return w;
  }

  // 斜切会让字形向两侧外扩：外扩量 = tan(12°) × 行高（行高 ≈ 1.14 × 字号）
  var SKEW_TAN = Math.tan(12 * Math.PI / 180);

  /* 写入文案并把字号压到「单行放得下」为止：
     · 优先用计算字号 from，放不下就在 [min, from] 之间二分收缩
     · 收缩下限 = 档位可读下限，低于这个字号宁可换 CBM.IM
     返回最终字号；返回 -1 表示连下限都放不下 */
  function fitSize(el, text, from, min) {
    // 斜切会污染测量，测量期间先摘掉 transform
    var prevTransform = el.style.transform;
    el.style.transform = 'none';

    var avail = el.clientWidth || 0;
    var set = function (v) { el.style.fontSize = (Math.round(v * 100) / 100) + 'px'; };
    var fits = function (v) {
      set(v);
      return textWidth(el, text) + SKEW_TAN * v * 1.14 <= avail;
    };

    var result;
    if (fits(from)) {
      result = from;
    } else {
      var lo = Math.min(min, from), hi = from, i;
      for (i = 0; i < 14 && hi - lo > 0.3; i++) {
        var mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid; else hi = mid;
      }
      // 留 3% 安全余量：避免测量与实际渲染的亚像素误差造成临界溢出
      var safe = Math.round(lo * 0.97 * 100) / 100;
      set(safe);
      textWidth(el, text);
      result = (textWidth(el, text) + SKEW_TAN * safe * 1.14 <= avail) ? safe : -1;
    }

    el.style.transform = prevTransform;
    if (result < 0) result = -1;
    return result;
  }

  /* 应用某一档卡片宽度下的全部尺寸变量 */
  function applyBox(ov, cardW) {
    ov.style.setProperty('--co-card-w', px(cardW, 1));
    ov.style.setProperty('--co-card-h', px(cardW * BOX.ratio, 1));
    ov.style.setProperty('--co-radius', px(cardW * BOX.radius, 3));
    ov.style.setProperty('--co-pad', px(cardW * BOX.pad, 3));
    ov.style.setProperty('--co-gap', px(cardW * BOX.gap, 2));
    ov.style.setProperty('--co-t-size', px(cardW * BOX.font, 4));
    ov.style.setProperty('--co-s-size', px(cardW * BOX.sub, 3));
    ov.style.setProperty('--co-skew', BOX.skew + 'deg');
  }

  function render(ov) {
    var host = ov.parentElement;
    var w = host.clientWidth || host.offsetWidth || 0;
    if (!w) return;
    var h = host.clientHeight || host.offsetHeight || Math.round(w * BASE_H / BASE_W);
    var tr = tierOf(w);
    if (ov.dataset.tier !== tr.id) ov.dataset.tier = tr.id;

    var card = ov.querySelector('.co-card');
    var tEl = ov.querySelector('.co-title');
    var sEl = ov.querySelector('.co-sub');
    if (!card || !tEl || !sEl) return;

    /* 文字取值 */
    var rawTitle = String(ov.dataset.topic || '').trim();
    var rawCat = String(ov.dataset.cat || '').trim();
    var isSmall = w < SMALL_CARD;
    var mainText = isSmall ? (rawCat || BRAND) : rawTitle;
    // 小卡只显示一行分类；大卡：大字放得下才显示 CBM.IM 小字
    var wantSub = !isSmall && tr.showSub;
    var showText = w >= TEXT_FLOOR;

    ov.dataset.mini = showText ? '0' : '1';

    /* 框体：比例硬锁 + 装不下就加宽（上限容器宽的 98%） */
    var maxW = w * 0.98;
    var cardW = Math.min(w * BOX.w, h * 0.92 * BOX.inscribe);
    var pass, need, fits = false;

    for (pass = 0; pass < 5; pass++) {
      applyBox(ov, cardW);

      if (!showText) { fits = true; break; }

      var tMin = isSmall ? 12 : tr.tMin;
      var fitted = fitSize(tEl, mainText || BRAND, cardW * BOX.font, tMin);
      if (fitted < 0) fitSize(tEl, BRAND, cardW * BOX.font, tMin);

      var subOn = wantSub && fitted > 0 && !!rawTitle;
      sEl.textContent = subOn ? BRAND : '';
      sEl.style.display = subOn ? '' : 'none';

      need = card.scrollHeight;
      if (need <= cardW * BOX.ratio + 0.5) { fits = true; break; }

      // 装不下：先去掉小字，再按「比例不变地加宽」再试
      if (subOn) { wantSub = false; continue; }
      var want = need * BOX.inscribe;
      if (want <= cardW + 0.5 || cardW >= maxW) break;
      cardW = Math.min(want, maxW);
    }

    if (!fits && showText) {
      // 极端小卡（容器被压缩到极窄）保底：宁可只留一行，也不让框体变形
      ov.dataset.tight = '1';
    } else {
      delete ov.dataset.tight;
    }
  }

  function attach(host, item) {
    if (host.dataset.coDone === '1') return;
    host.dataset.coDone = '1';
    ensureHost(host, item.d);
    var ov = buildOverlay(host, item);
    render(ov);
    if (ro) ro.observe(host);
  }

  function process() {
    var imgs = document.querySelectorAll(TARGETS.join(','));
    Array.prototype.forEach.call(imgs, function (img) {
      var host = img.parentElement;
      if (!host) return;

      var a = findLink(img);
      var key = a ? norm(a.getAttribute('href')) : '';
      if (!key) return;

      var it = COVERS[key];
      if (!it) return;   // 三处全空 → 不叠蒙版、不叠文字，原图原样显示

      attach(host, it);
    });
  }

  function boot() {
    if (!meta) return;
    if (typeof ResizeObserver !== 'undefined' && !ro) {
      ro = new ResizeObserver(function (entries) {
        Array.prototype.forEach.call(entries, function (e) {
          var ov = e.target.querySelector('.co-wrap');
          if (ov) render(ov);
        });
      });
    }
    process();
  }

  function load() {
    if (meta) { boot(); return; }
    fetch(META_URL, { cache: 'no-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) {
        meta = j || {};
        COVERS = meta.covers || {};
        boot();
      })
      .catch(function () { meta = {}; });
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(load, 60);
  }

  document.addEventListener('DOMContentLoaded', schedule);
  document.addEventListener('pjax:complete', schedule);
  document.addEventListener('pjax:success', schedule);
  window.addEventListener('load', schedule);

  // 容器尺寸变化后重新排版（图片 / 字体加载完、窗口缩放、侧栏折叠）
  window.addEventListener('resize', function () {
    if (!meta) return;
    clearTimeout(timer);
    timer = setTimeout(function () {
      Array.prototype.forEach.call(document.querySelectorAll('.co-wrap'), function (ov) {
        render(ov);
      });
    }, 120);
  });
})();
