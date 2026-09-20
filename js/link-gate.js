/**
 * link-gate.js — 友链页 checkbox 修复 + 评论区闸门
 *
 * 功能一：修复主题缺陷导致的多选框无法点击
 *   anzhiyu 主题在 themes/anzhiyu/source/css/_tags/checkbox.styl 中给
 *   .checkbox input 设了 pointer-events: none，但主题 JS 里没有任何代码
 *   接管点击事件，因此 {% checkbox %} 生成的复选框无法勾选。
 *   这里恢复 input 的可点击性，并让点击整行文字也能切换。
 *   本修复对所有页面的 checkbox 生效，不限于友链页。
 *
 * 功能二：评论区闸门
 *   友链页的各项条件必须全部勾选，底部评论区才放开。
 *   未全部勾选时不额外插入任何提示卡片，仅将评论区做视觉锁定。
 */

(function () {
  'use strict';

  // 生效页面（归一化后的路径，不带首尾斜杠）
  var LINK_PATHS = ['link', 'links'];

  // 是否记住勾选状态
  var REMEMBER = true;
  var STORE_KEY = 'link-gate-checked';

  var timer = null;

  function norm(p) {
    return String(p || '')
      .replace(/^https?:\/\/[^/]+/, '')
      .replace(/\/index\.html?$/i, '')
      .replace(/\.html?$/i, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '');
  }

  function isLinkPage() {
    return LINK_PATHS.indexOf(norm(location.pathname)) > -1;
  }

  function readStore() {
    if (!REMEMBER) return null;
    try {
      return JSON.parse(sessionStorage.getItem(STORE_KEY) || 'null');
    } catch (e) {
      return null;
    }
  }

  function writeStore(arr) {
    if (!REMEMBER) return;
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(arr));
    } catch (e) { /* 隐私模式下忽略 */ }
  }

  /* ---------- 功能一：恢复 checkbox 可点击 ---------- */

  function fixBox(b) {
    if (b.dataset.lgFixed === '1') return;
    b.dataset.lgFixed = '1';

    // 覆盖主题的 pointer-events: none
    b.style.pointerEvents = 'auto';
    b.style.cursor = 'pointer';

    var host = b.closest('.checkbox') || b.parentElement;
    if (!host || host.dataset.lgHost === '1') return;
    host.dataset.lgHost = '1';
    host.style.cursor = 'pointer';

    // 点击整行（含文字）也能切换，模拟 label 行为
    host.addEventListener('click', function (e) {
      if (e.target === b) return;              // 点的是 input 本身，交给原生处理
      if (e.target.closest('a')) return;       // 文字里的链接不拦截
      e.preventDefault();
      b.checked = !b.checked;
      b.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  function fixAll() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.checkbox input[type="checkbox"]'),
      fixBox
    );
  }

  /* ---------- 功能二：评论区闸门 ---------- */

  function sync() {
    var comment = document.getElementById('post-comment');
    if (!comment) return;
    var st = comment.__linkGate;
    if (!st) return;

    var n = 0;
    st.boxes.forEach(function (b) { if (b.checked) n++; });

    comment.classList.toggle('link-gated', n !== st.total);

    if (REMEMBER) {
      writeStore(st.boxes.map(function (b) { return !!b.checked; }));
    }
  }

  function initGate() {
    if (!isLinkPage()) return;

    var boxes = document.querySelectorAll('.checkbox input[type="checkbox"]');
    if (!boxes.length) return;

    var comment = document.getElementById('post-comment');
    if (!comment) return;

    var st = comment.__linkGate;
    if (!st) {
      st = comment.__linkGate = {
        boxes: Array.prototype.slice.call(boxes),
        total: boxes.length
      };
      st.boxes.forEach(function (b) {
        b.addEventListener('change', sync);
      });
    }

    var saved = readStore();
    if (saved && saved.length === st.total) {
      st.boxes.forEach(function (b, i) { b.checked = !!saved[i]; });
    }

    sync();
  }

  function init() {
    fixAll();
    initGate();
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(init, 80);
  }

  document.addEventListener('DOMContentLoaded', schedule);
  document.addEventListener('pjax:complete', schedule);
  document.addEventListener('pjax:success', schedule);
  window.addEventListener('load', schedule);
})();
