(function () {
  var popup = document.getElementById('settingsPopup');
  if (!popup) return;
  var box = popup.querySelector('.popup-box');
  if (!box) return;

  if (!document.getElementById('settings-sheet-styles')) {
    var styleEl = document.createElement('style');
    styleEl.id = 'settings-sheet-styles';
    styleEl.textContent =
      '#settingsPopup.popup-overlay{align-items:flex-end;padding:0}' +
      '#settingsPopup .settings-sheet-box{width:100%;max-width:420px;max-height:min(80dvh,760px);border-radius:20px 20px 0 0;padding:0;text-align:left;display:flex;flex-direction:column;overflow:hidden;margin:0}' +
      '#settingsPopup .settings-sheet-title{flex:0 0 auto;padding:22px 20px 10px;font-size:22px;font-weight:800;color:#4A2511;text-align:center;line-height:1.2}' +
      '#settingsPopup .settings-sheet-scroll{flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 0 8px}' +
      '#settingsPopup .settings-section{padding:0}' +
      '#settingsPopup .settings-section-title{padding:18px 20px 8px;font-size:13px;font-weight:700;color:#8b6a4a;line-height:1.3}' +
      '#settingsPopup .settings-menu-row{display:block;width:100%;min-height:52px;padding:0 20px;border:none;border-top:0.5px solid rgba(180,140,90,0.22);background:transparent;color:#4A2511;font-size:18px;font-weight:700;font-family:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;box-sizing:border-box}' +
      '#settingsPopup .settings-section .settings-menu-row:first-of-type{border-top:0.5px solid rgba(180,140,90,0.22)}' +
      '#settingsPopup .settings-menu-row:active{background:rgba(244,232,205,0.72)}' +
      '#settingsPopup .settings-back-row{display:block;width:100%;min-height:44px;padding:12px 20px 4px;border:none;background:transparent;color:#8b5e2c;font-size:15px;font-weight:700;font-family:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
      '#settingsPopup .settings-back-row:active{opacity:0.75}' +
      '#settingsPopup .settings-font-panel{padding:8px 20px 12px}' +
      '#settingsPopup .settings-font-panel .font-control{margin-bottom:0}' +
      '#settingsPopup .settings-sheet-close{flex:0 0 auto;margin:12px 20px calc(12px + env(safe-area-inset-bottom,0px));width:calc(100% - 40px);align-self:stretch}' +
      '@media(min-width:769px){#settingsPopup.popup-overlay{align-items:center;padding:24px}#settingsPopup .settings-sheet-box{border-radius:20px;max-height:min(80vh,760px)}#settingsPopup .settings-sheet-close{width:calc(100% - 40px)}}';
    document.head.appendChild(styleEl);
  }

  var fontCtrl = box.querySelector('.font-control');
  var closeBtn = box.querySelector('.popup-close');
  if (!fontCtrl || !closeBtn) return;

  box.classList.add('settings-sheet-box');
  box.innerHTML = '';

  var titleEl = document.createElement('div');
  titleEl.className = 'settings-sheet-title';
  titleEl.id = 'settingsSheetTitle';
  titleEl.textContent = '설정';

  var scrollEl = document.createElement('div');
  scrollEl.className = 'settings-sheet-scroll';

  var mainView = document.createElement('div');
  mainView.id = 'settingsMainView';

  function addSection(sectionTitle, items) {
    var section = document.createElement('div');
    section.className = 'settings-section';
    var heading = document.createElement('div');
    heading.className = 'settings-section-title';
    heading.textContent = sectionTitle;
    section.appendChild(heading);
    for (var i = 0; i < items.length; i++) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'settings-menu-row';
      btn.textContent = items[i].label;
      btn.setAttribute('data-action', items[i].action);
      btn.addEventListener('click', items[i].onClick);
      section.appendChild(btn);
    }
    mainView.appendChild(section);
  }

  var fontView = document.createElement('div');
  fontView.id = 'fontSettingsView';
  fontView.hidden = true;

  var backBtn = document.createElement('button');
  backBtn.type = 'button';
  backBtn.className = 'settings-back-row';
  backBtn.textContent = '뒤로';
  backBtn.addEventListener('click', showMainView);

  var fontPanel = document.createElement('div');
  fontPanel.className = 'settings-font-panel';
  fontPanel.appendChild(fontCtrl);

  fontView.appendChild(backBtn);
  fontView.appendChild(fontPanel);

  function showMainView() {
    mainView.hidden = false;
    fontView.hidden = true;
    titleEl.textContent = '설정';
  }

  function showFontView() {
    mainView.hidden = true;
    fontView.hidden = false;
    titleEl.textContent = '글자 크기 설정';
  }

  window.changeFont = function (d) {
    fontSize = Math.min(30, Math.max(11, fontSize + d));
    document.documentElement.style.setProperty('--font-size', fontSize + 'px');
    var display = document.getElementById('fontDisplay');
    if (display) display.textContent = fontSize + 'px';
  };

  window.openCookieSettings = function () {
    var readerBanner = document.getElementById('cookie-banner');
    var homeBanner = document.getElementById('home-cookie-banner');
    var saved = localStorage.getItem('cookieChoice');
    if (saved) {
      try {
        var consent = JSON.parse(saved);
        var analyticsToggle = document.getElementById('analyticsToggle');
        var marketingToggle = document.getElementById('marketingToggle');
        if (analyticsToggle) analyticsToggle.checked = !!consent.analytics;
        if (marketingToggle) marketingToggle.checked = !!consent.marketing;
      } catch (e) {}
    }
    if (readerBanner) {
      readerBanner.style.display = 'block';
      return;
    }
    if (homeBanner) homeBanner.removeAttribute('hidden');
  };

  addSection('사용 설정', [{
    label: '글자 크기 설정',
    action: 'font',
    onClick: function () { showFontView(); }
  }]);

  addSection('도움말', [
    {
      label: '사용자 가이드',
      action: 'guide',
      onClick: function () { location.href = '/guide#how-to-use'; }
    },
    {
      label: '문의하기',
      action: 'contact',
      onClick: function () { location.href = '/contact'; }
    }
  ]);

  addSection('개인정보 및 약관', [
    {
      label: '쿠키 및 분석 설정',
      action: 'cookie',
      onClick: function () {
        if (typeof window.closeSettings === 'function') window.closeSettings();
        window.openCookieSettings();
      }
    },
    {
      label: '개인정보처리방침',
      action: 'privacy',
      onClick: function () { location.href = '/privacy.html'; }
    },
    {
      label: '서비스 이용약관',
      action: 'terms',
      onClick: function () { location.href = '/terms.html'; }
    }
  ]);

  scrollEl.appendChild(mainView);
  scrollEl.appendChild(fontView);

  closeBtn.classList.add('settings-sheet-close');
  closeBtn.textContent = '닫기';

  box.appendChild(titleEl);
  box.appendChild(scrollEl);
  box.appendChild(closeBtn);

  var origOpen = window.openSettings;
  window.openSettings = function () {
    if (origOpen) origOpen();
    showMainView();
    scrollEl.scrollTop = 0;
  };
})();
