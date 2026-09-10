/* 로그인 화면 상단 hero: 큰 문구 + 카드 3장 교차 셔플 + 점 동기화.
   문구는 카드 위에 있고 카드 번호와 1:1로 짝을 이룬다.
   표시 전용이며 로그인 인증 코드와 어디에서도 닿지 않는다.
   되돌리려면 이 파일과 index.html·reader.html의 script 태그만 지우면 된다.
   (자리 클래스는 마크업에도 적어 두었으므로 이 스크립트가 없어도 정지 화면은 그대로 보인다.) */
(function () {
  'use strict';

  var SLOT = {
    center: 'login-brand-card--slot-center',
    left: 'login-brand-card--slot-left',
    right: 'login-brand-card--slot-right'
  };
  var HOLD_MS = 4000;   /* 앞 카드가 머무는 시간 */
  var MOVE_MS = 800;    /* 교차에 걸리는 시간. CSS transition-duration과 같은 값이어야 한다 */
  var RESUME_MS = 6000; /* 사용자가 직접 넘긴 뒤 자동 진행이 다시 오기까지 */
  var SWIPE_MIN = 40;   /* 이보다 짧은 가로 움직임은 스와이프로 보지 않는다 */

  function reduceMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch (e) { return false; }
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var visual = document.getElementById('loginBrandVisual');
    var lead = document.getElementById('loginBrandLead');
    var dotsWrap = document.getElementById('loginBrandDots');
    var overlay = document.getElementById('loginModal');
    if (!visual || !lead) return;

    /* 카드 번호와 문구는 1:1이다. 마크업 순서(겹치는 순서)에 기대지 않고 번호로 정렬한다. */
    var cards = [].slice.call(visual.querySelectorAll('[data-brand-card]')).sort(function (a, b) {
      return (+a.getAttribute('data-brand-card')) - (+b.getAttribute('data-brand-card'));
    });
    if (cards.length !== 3) return;

    var texts = [];
    for (var t = 0; t < cards.length; t++) {
      texts.push(cards[t].getAttribute('data-brand-caption') || '');
    }
    var dots = dotsWrap ? [].slice.call(dotsWrap.querySelectorAll('.login-brand-dot')) : [];

    var front = 0;   /* 지금 가운데 앞에 있는 카드 */
    var timer = null;

    function stop() {
      if (timer) { window.clearTimeout(timer); timer = null; }
    }

    function isOpen() {
      try { return !!(overlay && overlay.getClientRects().length); } catch (e) { return false; }
    }

    /* 자리 배정 규칙:
       가운데 = 지금 카드, 왼쪽 뒤 = 다음에 나올 카드, 오른쪽 뒤 = 방금 물러난 카드.
       그래서 한 칸 넘길 때마다 가운데 카드는 오른쪽 뒤로, 왼쪽 뒤 카드는 가운데로,
       오른쪽 뒤 카드는 왼쪽 뒤로 이동한다. 위치·크기·기울기는 모두 자리 클래스가 갖는다. */
    function placeCards() {
      for (var i = 0; i < cards.length; i++) {
        var rel = (i - front + 3) % 3;
        var slot = rel === 0 ? 'center' : (rel === 1 ? 'left' : 'right');
        cards[i].classList.remove(SLOT.center, SLOT.left, SLOT.right);
        cards[i].classList.add(SLOT[slot]);
      }
    }

    /* 문구는 자리를 옮기지 않는다. 카드 교차가 끝난 시점에 내용만 바꾸고,
       갑자기 깜빡이지 않게 opacity만 아주 약하게 되돌린다. */
    function syncLabel() {
      for (var i = 0; i < dots.length; i++) {
        if (dots[i].classList.contains('is-on') !== (i === front)) {
          dots[i].classList.toggle('is-on', i === front);
        }
      }
      if (lead.textContent === texts[front]) return;
      lead.style.opacity = '.85';
      lead.textContent = texts[front];
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () { lead.style.opacity = ''; });
      });
    }

    function schedule(wait) {
      stop();
      if (reduceMotion()) return;
      timer = window.setTimeout(function () {
        /* 창이 닫혀 있으면 넘기지 않고 기다리기만 한다 */
        if (!isOpen()) { schedule(HOLD_MS); return; }
        show(front + 1, HOLD_MS + MOVE_MS);
      }, wait);
    }

    function show(next, wait) {
      front = ((next % cards.length) + cards.length) % cards.length;
      placeCards();
      if (reduceMotion()) syncLabel();
      else window.setTimeout(syncLabel, MOVE_MS);
      schedule(wait);
    }

    /* 창을 다시 열면 1번 카드·1번 문구부터. 이때는 움직임 없이 자리만 잡는다. */
    function resetInstantly() {
      visual.classList.add('is-instant');
      front = 0;
      placeCards();
      syncLabel();
      void visual.offsetWidth;
      window.requestAnimationFrame(function () { visual.classList.remove('is-instant'); });
    }

    placeCards();
    syncLabel();
    schedule(HOLD_MS);

    if (overlay && window.MutationObserver) {
      var wasOpen = isOpen();
      new MutationObserver(function () {
        var open = isOpen();
        if (open === wasOpen) return;
        wasOpen = open;
        if (!open) { stop(); return; }
        resetInstantly();
        schedule(HOLD_MS);
      }).observe(overlay, { attributes: true, attributeFilter: ['class', 'aria-hidden', 'style'] });
    }

    for (var d = 0; d < dots.length; d++) {
      (function (idx) {
        dots[idx].addEventListener('click', function (event) {
          event.preventDefault();
          if (idx === front) { schedule(RESUME_MS); return; }
          show(idx, RESUME_MS);
        });
      })(d);
    }

    /* 카드 영역 좌우 스와이프. 세로 스크롤을 막지 않도록 가로 움직임이 뚜렷할 때만 넘긴다.
       로그인 버튼 위가 아니라 카드 영역에서만 듣기 때문에 버튼 조작과 겹치지 않는다. */
    var sx = 0, sy = 0, tracking = false;
    visual.addEventListener('touchstart', function (event) {
      if (!event.touches || event.touches.length !== 1) { tracking = false; return; }
      tracking = true;
      sx = event.touches[0].clientX;
      sy = event.touches[0].clientY;
    }, { passive: true });
    visual.addEventListener('touchend', function (event) {
      if (!tracking) return;
      tracking = false;
      var touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;
      var dx = touch.clientX - sx;
      var dy = touch.clientY - sy;
      if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      show(front + (dx < 0 ? 1 : -1), RESUME_MS);
    }, { passive: true });

    /* 미리보기 중 값을 만져 볼 수 있도록 최소한의 손잡이만 남긴다. 로그인 흐름과 무관하다. */
    window.GomnaLoginBrandShuffle = {
      next: function () { show(front + 1, RESUME_MS); },
      prev: function () { show(front - 1, RESUME_MS); },
      goTo: function (i) { show(i, RESUME_MS); },
      current: function () { return front; },
      stop: stop
    };
  });
})();
