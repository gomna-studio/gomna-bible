(() => {
  'use strict';
  const card = document.querySelector('.daily-card');
  if (!card) return;
  let lastDay = '';
  function refresh() {
    const now = new Date();
    // Match the app home: viewer's local calendar day, cycling through 30 verses.
    const day = [now.getFullYear(), now.getMonth() + 1, now.getDate()].join('-');
    if (day === lastDay) return;
    const verses = window.GomnaDailyVerses?.verses;
    const verse = verses?.[((now.getDate() - 1) % 30 + 30) % 30];
    if (!verse) {
      card.querySelector('.daily-body').textContent = '오늘의 말씀을 앱에서 만나보세요.';
      return;
    }
    card.querySelector('.daily-ref').textContent = verse.r + ' · KRV';
    card.querySelector('.daily-body').textContent = verse.t;
    card.querySelector('.daily-date').textContent = (now.getMonth() + 1) + '월 ' + now.getDate() + '일';
    card.setAttribute('aria-label', '오늘의 말씀: ' + verse.r + '. 앱에서 읽기');
    lastDay = day;
  }
  refresh();
  setInterval(refresh, 15000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('pageshow', refresh);
})();
