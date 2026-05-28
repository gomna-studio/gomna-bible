(function() {
  'use strict';

  var GENESIS_001_001_BIBLE_ID = 'genesis.001.001.bible';
  var FLAG_ATTR = 'data-gomna-audio-commentary-button-added';
  var pendingTimer = null;
  var observer = null;

  var COMMENTARY_ITEMS = [
    { title: '원어분석', tabId: 'tab-원어분석', audioId: 'genesis.001.001.original-language' },
    { title: '역사적배경', tabId: 'tab-역사적배경', audioId: 'genesis.001.001.history' },
    { title: '신학적의미', tabId: 'tab-신학적의미', audioId: 'genesis.001.001.theology' },
    { title: '예표론', tabId: 'tab-예표론', audioId: 'genesis.001.001.typology' },
    { title: '매튜헨리', tabId: 'tab-매튜헨리', audioId: 'genesis.001.001.matthew-henry' },
    { title: '설교자료', tabId: 'tab-설교자료', audioId: 'genesis.001.001.sermon' },
    { title: '찬송가', tabId: 'tab-찬송가', audioId: 'genesis.001.001.hymn' },
    { title: '상담적용', tabId: 'tab-상담적용', audioId: 'genesis.001.001.counseling' },
    { title: '교차참조', tabId: 'tab-교차참조', audioId: 'genesis.001.001.cross-reference' }
  ];

  function getPopup() {
    return document.getElementById('commentaryPopup');
  }

  function getContent() {
    return document.getElementById('commentaryContent');
  }

  function isGenesisOneOnePopup(popup) {
    if (!popup || !popup.classList.contains('show')) return false;

    var text = (popup.textContent || '').replace(/\s+/g, ' ');
    if (text.indexOf('태초에 하나님이 천지를 창조하시니라') !== -1) return true;
    if (text.indexOf('창세기 1장 1절') !== -1) return true;
    if (text.indexOf('창세기 1:1') !== -1) return true;
    if (text.indexOf('창 1:1') !== -1) return true;

    var target = document.querySelector('[data-audio-target="' + GENESIS_001_001_BIBLE_ID + '"]');
    var button = document.querySelector('[data-audio-id="' + GENESIS_001_001_BIBLE_ID + '"][data-audio-action="play"]');
    var hasGenesisNav = text.indexOf('창세기') !== -1 && text.indexOf('1:1') !== -1;

    return !!(target && button && hasGenesisNav);
  }

  function createButton(item) {
    var btn = document.createElement('button');

    btn.type = 'button';
    btn.className = 'gomna-audio-commentary-button';
    btn.setAttribute('data-audio-id', item.audioId);
    btn.setAttribute('data-audio-action', 'play');
    btn.setAttribute('aria-label', item.title + ' 듣기');
    btn.textContent = '▶ 듣기';

    return btn;
  }

  function findTitleHost(section, title) {
    var candidates = section.querySelectorAll('h3, h4, h5, strong, div, button');

    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();

      if (text.indexOf(title) === -1) continue;
      if (el.querySelector && el.querySelector('.gomna-audio-commentary-button')) continue;
      if (el.children && el.children.length > 3) continue;

      return el;
    }

    return null;
  }

  function insertButtonForItem(content, item) {
    if (content.querySelector('[data-audio-id="' + item.audioId + '"][data-audio-action="play"]')) {
      return true;
    }

    var section = document.getElementById(item.tabId);
    if (!section || !content.contains(section)) {
      console.warn('[GOMNA_AUDIO] 주석 섹션을 찾지 못했습니다:', item.title);
      return false;
    }

    if (section.getAttribute(FLAG_ATTR) === 'true') {
      return true;
    }

    var titleHost = findTitleHost(section, item.title);
    if (!titleHost) {
      console.warn('[GOMNA_AUDIO] 주석 제목 영역을 찾지 못했습니다:', item.title);
      return false;
    }

    section.setAttribute('data-audio-target', item.audioId);
    section.setAttribute(FLAG_ATTR, 'true');

    var btn = createButton(item);

    titleHost.classList.add('gomna-audio-commentary-header');
    titleHost.appendChild(btn);

    return true;
  }

  function addCommentaryButtons() {
    var popup = getPopup();
    var content = getContent();

    if (!popup || !content) return;
    if (!isGenesisOneOnePopup(popup)) return;

    for (var i = 0; i < COMMENTARY_ITEMS.length; i++) {
      insertButtonForItem(content, COMMENTARY_ITEMS[i]);
    }
  }

  function scheduleAddCommentaryButtons() {
    if (pendingTimer) return;

    pendingTimer = setTimeout(function() {
      pendingTimer = null;
      addCommentaryButtons();
    }, 50);
  }

  function startObserver() {
    var popup = getPopup();
    if (!popup || !window.MutationObserver || observer) return;

    observer = new MutationObserver(function() {
      scheduleAddCommentaryButtons();
    });

    observer.observe(popup, {
      attributes: true,
      attributeFilter: ['class'],
      childList: true,
      subtree: true
    });
  }

  function init() {
    addCommentaryButtons();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('[GOMNA_AUDIO] gomna-audio-commentary-buttons.js loaded');
})();
