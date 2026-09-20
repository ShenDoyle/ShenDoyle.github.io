/**
 * cover-overlay.js — 封面「蒙版 + 文字」层
 *
 * 依赖：/covermeta.json（由 scripts/covermeta.js 生成）
 *
 * ── 核心规则 ──────────────────────────────────────
 *   文章没填 covertitle  →  完全不介入，原封面图原样显示
 *   文章填了 covertitle  →  在原图上叠蒙版，再按容器宽度分档渲染文字
 * ─────────────────────────────────────────────────
 *
 * 为什么不用像素图里的字：封面在侧栏 / 归档 / 首页卡片 / 文章头图四个位置
 * 被不同尺寸裁切，烘焙进像素的文字无法随容器缩放，小尺寸下必然糊掉或被切掉。
 * 改为 DOM 渲染后，字号、卡片尺寸、字数上限都能跟随容器实时计算。
 */

(function () {
  'use strict';

  // 子路径部署时改为 '/blog/covermeta.json'
  var META_URL = '/covermeta.json';

  // 默认蒙版强度，与 Cover.psd 中 dim 图层一致（#000 / 46%）
  var DEFAULT_DIM = 0.46;

  // 基准画布（Cover.psd 原始尺寸），所有比例以此为参照
  var BASE_W = 760;
  var BASE_H = 332;

  // 档位参数：宽度阈值 + 缩放指数 + 最小字号 + 字数上限
  var TIERS = [
    { id: 'xs', max: 170, r: 0.72, tMin: 13, sMin: 0,  tLen: 6,  sLen: 0,  skew: 0,  cardW: 92, gap: 0.10, showSub: false },
    { id: 'sm', max: 300, r: 0.72, tMin: 16, sMin: 11, tLen: 10, sLen: 0,  skew: -6, cardW: 86, gap: 0.12, showSub: false },
    { id: 'md', max: 560, r: 0.72, tMin: 20, sMin: 11, tLen: 14, sLen: 24, skew: -9, cardW: 80, gap: 0.16, showSub: true },
    { id: 'lg', max: Infinity, r: 0.72, tMin: 34, sMin: 13, tLen: 0, sLen: 0, skew: -12, cardW: 73, gap: 0.18, showSub: true }
  ];

  // 覆盖电池/暗色管的文字保护：蒙版太浅时自动加深，保证可读
  var DIM_FLOOR = 0.32;

  // 锚点：以 img 为单位，overlay 挂到其父元素
  var TARGETS = [
    '.post_cover img.post_bg',
    '.article-sort-item-img img',
    '.aside-list-item img',
    '.top-group-item img.post_bg'
  ];
  // 文章页头图（背景图模式，无 img 元素）
  var PAGE_HOST = '#page-header.post-bg';

  var meta = null;
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

  // 非线性缩放：w=760 → base；w=380 → 0.607×base；w=150 → 0.311×base
  function scale(w, base, r) {
    return base * Math.pow(w / BASE_W, r);
  }

  function clip(s, n) {
    if (!n || !s) return s || '';
    var chars = Array.from(s);
    if (chars.length <= n) return s;
    return chars.slice(0, n).join('') + '…';
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
    ov.dataset.sub = item.s || '';
    return ov;
  }

  function render(ov) {
    var host = ov.parentElement;
    var w = host.clientWidth || host.offsetWidth || 0;
    if (!w) return;
    var h = host.clientHeight || host.offsetHeight || Math.round(w * BASE_H / BASE_W);
    var tr = tierOf(w);
    if (ov.dataset.tier !== tr.id) ov.dataset.tier = tr.id;

    var tSize = Math.max(scale(w, 58, tr.r), tr.tMin);
    var sSize = Math.max(scale(w, 20, tr.r), tr.sMin);

    var tEl = ov.querySelector('.co-title');
    var sEl = ov.querySelector('.co-sub');

    tEl.textContent = clip(ov.dataset.topic, tr.tLen);
    if (tr.showSub && ov.dataset.sub) {
      sEl.textContent = clip(ov.dataset.sub, tr.sLen);
      sEl.style.display = '';
    } else {
      sEl.textContent = '';
      sEl.style.display = 'none';
    }

    // 行高上限：xs / sm 档单行，其余最多两行
    var maxLines = (tr.id === 'xs' || tr.id === 'sm') ? 1 : 2;

    ov.style.setProperty('--co-card-w', tr.cardW + '%');
    ov.style.setProperty('--co-gap', tr.gap + 'em');
    ov.style.setProperty('--co-t-size', tSize.toFixed(1) + 'px');
    ov.style.setProperty('--co-s-size', sSize.toFixed(1) + 'px');
    ov.style.setProperty('--co-skew', tr.skew + 'deg');
    ov.style.setProperty('--co-lines', String(maxLines));
    ov.style.setProperty('--co-h', h + 'px');
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
    // 1) 文章页头图：用当前页面路径匹配
    var ph = document.querySelector(PAGE_HOST);
    if (ph) {
      var item = meta[norm(location.pathname)];
      if (item && item.t) {
        ph.dataset.coSelf = '1';
        attach(ph, item);
      }
    }

    // 2) 列表 / 侧栏中的封面 img：用链接 href 匹配
    var imgs = document.querySelectorAll(TARGETS.join(','));
    Array.prototype.forEach.call(imgs, function (img) {
      var host = img.parentElement;
      if (!host) return;

      var a = findLink(img);
      var key = a ? norm(a.getAttribute('href')) : '';
      if (!key && host.dataset.coSelf) key = norm(location.pathname);
      if (!key) return;

      var it = meta[key];
      if (!it || !it.t) return;                 // 未填 covertitle → 不介入

      if (it.b && img.getAttribute('src') !== it.b) {
        img.setAttribute('src', it.b);          // 可选：替换成指定底图
      }
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
      .then(function (j) { meta = j || {}; boot(); })
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

  // 图片 / 字体加载完成后容器尺寸可能变化，补一次重算
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
