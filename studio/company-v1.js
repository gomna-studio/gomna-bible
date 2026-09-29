(() => {
  'use strict';
  const root = document.documentElement;
  const themeButton = document.querySelector('.theme-toggle');
  const key = 'gomna_corporate_theme_v1';
  function applyTheme(dark) {
    root.dataset.theme = dark ? 'dark' : 'light';
    themeButton?.setAttribute('aria-pressed', String(dark));
    themeButton?.setAttribute('aria-label', dark ? '밝은 화면으로 전환' : '어두운 화면으로 전환');
  }
  try { applyTheme(localStorage.getItem(key) === 'dark'); } catch (_) { applyTheme(false); }
  themeButton?.addEventListener('click', () => {
    const dark = root.dataset.theme !== 'dark';
    applyTheme(dark);
    try { localStorage.setItem(key, dark ? 'dark' : 'light'); } catch (_) {}
  });
  const menuButton = document.querySelector('.menu-toggle');
  const policyContents = document.querySelector('details.toc');
  if (policyContents && window.matchMedia('(max-width: 850px)').matches) policyContents.open = false;
  policyContents?.addEventListener('click', e => {
    if (e.target.closest('a') && window.matchMedia('(max-width: 850px)').matches) policyContents.open = false;
  });
  const menu = document.getElementById('mobile-menu');
  function closeMenu(focus) {
    if (!menu || !menuButton) return;
    menu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    if (focus) menuButton.focus();
  }
  menuButton?.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    menuButton.setAttribute('aria-expanded', String(open));
    menu.hidden = !open;
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && menu && !menu.hidden) closeMenu(true); });
  document.addEventListener('click', e => { if (!e.target.closest('.site-header')) closeMenu(false); });
  window.matchMedia('(min-width: 851px)').addEventListener('change', e => { if (e.matches) closeMenu(false); });
  document.querySelector('.copy-email')?.addEventListener('click', async () => {
    const status = document.querySelector('.copy-status');
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText('ceo@gomnastudio.com');
      } else {
        const field = document.createElement('textarea');
        field.value = 'ceo@gomnastudio.com';
        field.setAttribute('readonly', '');
        field.style.cssText = 'position:fixed;left:-9999px;top:0;';
        const focused = document.activeElement;
        document.body.appendChild(field);
        field.select();
        let copied = false;
        try { copied = document.execCommand('copy'); }
        finally { field.remove(); focused?.focus(); }
        if (!copied) throw new Error('Copy unavailable');
      }
      status.textContent = '이메일 주소를 복사했습니다.';
    } catch (_) {
      status.textContent = '위 이메일 주소를 길게 누르거나 선택해 복사해 주세요.';
    }
  });
})();
