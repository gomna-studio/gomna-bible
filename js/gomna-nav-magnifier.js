/* Long-press previews for the shared bottom navigation; ordinary clicks stay native. */
(function () {
  'use strict';
  if (window.__gomnaNavMagnifier) return;
  window.__gomnaNavMagnifier = true;
  var selector = '#gomnaHomeTabbar .gomna-home-tab, #scriptureDock .scripture-dock-item, #opt4VerseToolbar > button, button.gomna-home-related[data-ghd-related]';
  var style = document.createElement('style');
  style.textContent = selector + '{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}' +
    '#gomnaNavMagnifier{position:fixed;z-index:2147483647;box-sizing:border-box;width:144px;min-height:132px;padding:20px 12px 16px;display:flex;flex-direction:column;align-items:center;gap:12px;border:1px solid #d9dfe8;border-radius:22px;background:#fff;color:#172235;opacity:1;filter:none;transform:none;box-shadow:0 6px 20px #10203926;pointer-events:none;text-align:center;font:700 22px/1.35 -apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-shadow:none;letter-spacing:0}' +
    '#gomnaNavMagnifier[hidden]{display:none}' +
    '#gomnaNavMagnifier img{display:block;width:88px;height:88px;object-fit:contain;opacity:1;filter:none;transform:none}' +
    '#gomnaNavMagnifier svg{display:block;width:60px;height:60px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;shape-rendering:geometricPrecision;opacity:1;filter:none;transform:none}';
  document.head.appendChild(style);
  var popup = document.createElement('div');
  popup.id = 'gomnaNavMagnifier';
  popup.hidden = true;
  popup.setAttribute('aria-hidden', 'true');
  document.body.appendChild(popup);
  var press = null, timer = 0, blocked = null, blockedUntil = 0;
  function item(target) { return target && target.closest ? target.closest(selector) : null; }
  function dismiss() {
    clearTimeout(timer);
    timer = 0;
    press = null;
    popup.hidden = true;
  }
  function show() {
    if (!press || !press.el.isConnected) return dismiss();
    var el = press.el, icon = el.querySelector('svg'), picture = el.querySelector('img');

    popup.replaceChildren();
    var clone;
    if (picture) {
      clone = document.createElement('img');
      clone.src = picture.currentSrc || picture.src;
      clone.alt = '';
      clone.draggable = false;
    } else if (icon) {
      clone = icon.cloneNode(true);
      // Keep vector geometry; drop source button effects and fixed small-icon styling.
      [clone].concat(Array.from(clone.querySelectorAll('*'))).forEach(function (n) {
        ['id', 'class', 'style', 'filter', 'opacity'].forEach(function (a) { n.removeAttribute(a); });
      });
      clone.removeAttribute('width');
      clone.removeAttribute('height');
      clone.setAttribute('stroke-width', '2');
    } else {
      // Three vector dots stay crisp at every display density, unlike a font glyph.
      clone = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      clone.setAttribute('viewBox', '0 0 24 24');
      [5, 12, 19].forEach(function (x) {
        var dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x); dot.setAttribute('cy', '12'); dot.setAttribute('r', '1.5');
        dot.setAttribute('fill', 'currentColor'); dot.setAttribute('stroke', 'none');
        clone.appendChild(dot);
      });
    }
    clone.setAttribute('aria-hidden', 'true');
    popup.appendChild(clone);
    var label = document.createElement('span');
    var text = el.querySelector('.opt4-bar-label, .verse-toolbar-location-text');
    label.textContent = (text ? text.textContent : el.textContent).trim() || el.getAttribute('aria-label') || '';
    popup.appendChild(label);
    popup.hidden = false;
    var rect = el.getBoundingClientRect();
    var vv = window.visualViewport;
    var left = vv ? vv.offsetLeft : 0, top = vv ? vv.offsetTop : 0;
    var width = vv ? vv.width : window.innerWidth;
    var pixelRatio = window.devicePixelRatio || 1;
    function snap(value) { return Math.round(value * pixelRatio) / pixelRatio; }
    popup.style.left = snap(Math.max(left + 8, Math.min(rect.left + rect.width / 2 - 72, left + width - 152))) + 'px';
    popup.style.top = snap(Math.max(top + 8, Math.min(rect.top, press.y) - popup.offsetHeight - 24)) + 'px';
    press.shown = true;
    blocked = el;
    blockedUntil = Infinity;
  }
  document.addEventListener('pointerdown', function (e) {
    dismiss();
    if (!e.isPrimary || e.button !== 0) return;
    blocked = null;
    var el = item(e.target);
    if (!el || el.disabled) return;
    press = {el:el, id:e.pointerId, x:e.clientX, y:e.clientY, shown:false};
    timer = setTimeout(show, 800);
  }, true);
  document.addEventListener('pointermove', function (e) {
    if (press && press.id === e.pointerId && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) {
      if (press.shown) blockedUntil = Date.now() + 900;
      dismiss();
    }
  }, true);
  function release(e) {
    if (!press || e.pointerId !== press.id) return;
    if (press.shown) blockedUntil = Date.now() + 900;
    dismiss();
  }
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);
  window.addEventListener('click', function (e) {
    if (blocked && Date.now() < blockedUntil && item(e.target) === blocked && e.detail !== 0) {
      e.preventDefault();
      e.stopImmediatePropagation();
      blocked = null;
    }
  }, true);
  document.addEventListener('contextmenu', function (e) {
    if (item(e.target)) e.preventDefault();
  }, true);
  ['blur', 'pagehide', 'resize'].forEach(function (type) { window.addEventListener(type, dismiss); });
  document.addEventListener('scroll', dismiss, true);
  document.addEventListener('visibilitychange', dismiss);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') dismiss(); });
})();
