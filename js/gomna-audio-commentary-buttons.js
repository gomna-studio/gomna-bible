(function() {
  'use strict';

  var FLAG_ATTR = 'data-gomna-audio-commentary-button-added';
  var ALL_TABS_AUDIO_ATTR = 'data-gomna-commentary-sequence-bound';
  var TAB_AUDIO_ATTR = 'data-gomna-commentary-tab-audio-bound';
  var ALL_TABS_BUTTON_SELECTOR = '[data-gomna-commentary-sequence-button="true"]';
  var SEQUENCE_IDLE_LABEL = '▶ 전체듣기';
  var SEQUENCE_PLAYING_LABEL = '⏸ 전체 일시정지';
  var SEQUENCE_PAUSED_LABEL = '▶ 전체 이어듣기';
  var ACTIVE_BUTTON_CLASS = 'gomna-audio-commentary-button--active';
  var ACTIVE_TAB_CLASS = 'gomna-audio-commentary-tab--active';
  var ACTIVE_SECTION_CLASS = 'gomna-audio-commentary-section--active';
  var ACTIVE_CUE_CLASS = 'gomna-commentary-cue--active';
  var REPLAY_BUTTON_CLASS = 'gomna-audio-commentary-replay-button';
  var SEQUENCE_BUTTON_CLASS = 'gomna-audio-commentary-sequence-button';
  var CONTROLS_FOOTER_CLASS = 'gomna-audio-commentary-controls-footer';
  var INLINE_CONTROLS_ID = 'gomnaCommentaryInlineControls';
  var LISTEN_BTN_ID = 'gomnaCommentaryListenBtn';
  var REPLAY_BTN_ID = 'gomnaCommentaryReplayBtn';
  var SEQUENCE_BTN_ID = 'gomnaCommentarySequenceBtn';
  var INLINE_CLOSE_BTN_ID = 'gomnaCommentaryInlineCloseBtn';
  var INLINE_BOUND_ATTR = 'data-gomna-inline-controls-bound';
  var HEADER_NOTE_CLASS = 'gomna-audio-commentary-header-note';
  var MODAL_OPEN_CLASS = 'gomna-commentary-popup-open';
  var pendingTimer = null;
  var observer = null;
  var completedAudioIds = {};
  var lastSequenceQueueIndex = -1;
  var replayGuardAudioId = null;
  var currentCueKey = null;
  var touchStartY = 0;
  var modalTouchListenersBound = false;

  var currentContext = null;
  var currentCommentaryItems = [];
  var currentCommentaryAudioIds = [];
  var currentSequenceSource = '';

  // Future Matthew Henry audio option:
  // English originals can later be generated with a separate en-US voice,
  // split from Korean exposition, or exposed as a dedicated English button.
  // For now, commentary audio remains a ko-KR Korean exposition track.
  var COMMENTARY_TYPE_TEMPLATES = [
    { title: '원어분석', tabId: 'tab-원어분석', type: 'original-language' },
    { title: '역사적배경', tabId: 'tab-역사적배경', type: 'history' },
    { title: '신학적의미', tabId: 'tab-신학적의미', type: 'theology' },
    { title: '예표론', tabId: 'tab-예표론', type: 'typology' },
    { title: '매튜헨리', tabId: 'tab-매튜헨리', type: 'matthew-henry' },
    { title: '설교자료', tabId: 'tab-설교자료', type: 'sermon' },
    { title: '찬송가', tabId: 'tab-찬송가', type: 'hymn' },
    { title: '상담적용', tabId: 'tab-상담적용', type: 'counseling' },
    { title: '교차참조', tabId: 'tab-교차참조', type: 'cross-reference' }
  ];

  // TODO: 추후 매튜헨리 영어 원문 클릭 재생은 자동 cue point 방식으로 확장한다.
  // 유력한 저장 구조는 audio/cues/ko-KR/genesis/001/001/commentary-cues.json 같은 별도 JSON이며,
  // manifest에는 나중에 cuePath만 추가하는 방향을 검토한다.
  var COMMENTARY_MANUAL_CUES = {
    'genesis.001.001.matthew-henry': {
      'mh-en-1': 7.2,
      'mh-en-2': 27.8,
      'mh-en-3': 44.4
    },
    'genesis.001.002.matthew-henry': {
      'mh-en-1': 9.2,
      'mh-en-2': 23.6,
      'mh-en-3': 36.4
    },
    'genesis.001.003.matthew-henry': {
      'mh-en-1': 8.4,
      'mh-en-2': 22.8,
      'mh-en-3': 36.2
    },
    'genesis.001.004.matthew-henry': {
      'mh-en-1': 9.2,
      'mh-en-2': 22.9,
      'mh-en-3': 33.5
    },
    'genesis.001.005.matthew-henry': {
      'mh-en-1': 12.8,
      'mh-en-2': 27.1,
      'mh-en-3': 40.7
    },
    'genesis.001.006.matthew-henry': {
      'mh-en-1': 11.88,
      'mh-en-2': 24.54,
      'mh-en-3': 35.72
    },
    'genesis.001.007.matthew-henry': {
      'mh-en-1': 14.06,
      'mh-en-2': 26.52,
      'mh-en-3': 36.02
    },
    'genesis.001.008.matthew-henry': {
      'mh-en-1': 14.06,
      'mh-en-2': 28.34,
      'mh-en-3': 39.70
    },
    'genesis.001.009.matthew-henry': {
      'mh-en-1': 14.42,
      'mh-en-2': 29.28,
      'mh-en-3': 40.31
    },
    'genesis.001.010.matthew-henry': {
      'mh-en-1': 14.24,
      'mh-en-2': 24.28,
      'mh-en-3': 35.06
    },
    'genesis.001.011.matthew-henry': {
      'mh-en-1': 17.35,
      'mh-en-2': 28.95,
      'mh-en-3': 42.96
    },
    'genesis.001.012.matthew-henry': {
      'mh-en-1': 16.60,
      'mh-en-2': 27.38,
      'mh-en-3': 42.28
    },
    'genesis.001.013.matthew-henry': {
      'mh-en-1': 10.32,
      'mh-en-2': 21.56,
      'mh-en-3': 31.70
    },
    'genesis.001.014.matthew-henry': {
      'mh-en-1': 16.86,
      'mh-en-2': 28.06,
      'mh-en-3': 36.94
    },
    'genesis.001.015.matthew-henry': {
      'mh-en-1': 11.52,
      'mh-en-2': 24.62,
      'mh-en-3': 37.20
    },
    'genesis.001.016.matthew-henry': {
      'mh-en-1': 16.53,
      'mh-en-2': 29.75,
      'mh-en-3': 43.23
    },
    'genesis.001.017.matthew-henry': {
      'mh-en-1': 11.14,
      'mh-en-2': 22.82,
      'mh-en-3': 35.39
    },
    'genesis.001.018.matthew-henry': {
      'mh-en-1': 12.08,
      'mh-en-2': 24.00,
      'mh-en-3': 35.92
    },
    'genesis.001.019.matthew-henry': {
      'mh-en-1': 10.50,
      'mh-en-2': 23.62,
      'mh-en-3': 37.53
    },
    'genesis.001.020.matthew-henry': {
      'mh-en-1': 14.96,
      'mh-en-2': 28.05,
      'mh-en-3': 39.05
    },
    'genesis.001.021.matthew-henry': {
      'mh-en-1': 16.78,
      'mh-en-2': 31.41,
      'mh-en-3': 41.96
    },
    'genesis.001.022.matthew-henry': {
      'mh-en-1': 13.95,
      'mh-en-2': 25.98,
      'mh-en-3': 37.52
    },
    'genesis.001.023.matthew-henry': {
      'mh-en-1': 7.50,
      'mh-en-2': 17.31,
      'mh-en-3': 30.55
    },
    'genesis.001.024.matthew-henry': {
      'mh-en-1': 11.95,
      'mh-en-2': 23.91,
      'mh-en-3': 34.23
    },
    'genesis.001.025.matthew-henry': {
      'mh-en-1': 15.17,
      'mh-en-2': 27.58,
      'mh-en-3': 37.27
    },
    'genesis.001.026.matthew-henry': {
      'mh-en-1': 18.29,
      'mh-en-2': 32.12,
      'mh-en-3': 43.18
    },
    'genesis.001.027.matthew-henry': {
      'mh-en-1': 12.65,
      'mh-en-2': 24.52,
      'mh-en-3': 34.32
    },
    'genesis.001.028.matthew-henry': {
      'mh-en-1': 19.72,
      'mh-en-2': 32.56,
      'mh-en-3': 41.93
    },
    'genesis.001.029.matthew-henry': {
      'mh-en-1': 13.74,
      'mh-en-2': 25.75,
      'mh-en-3': 36.57
    },
    'genesis.001.030.matthew-henry': {
      'mh-en-1': 17.10,
      'mh-en-2': 30.62,
      'mh-en-3': 44.06
    },
    'genesis.001.031.matthew-henry': {
      'mh-en-1': 15.04,
      'mh-en-2': 23.12,
      'mh-en-3': 35.45
    }
  };

  var COMMENTARY_MANUAL_CUE_TEXTS = {
    'genesis.001.001.matthew-henry': {
      'mh-en-1': 'The first verse of the Bible gives us a satisfying account of the origin of the universe.',
      'mh-en-2': 'We have here the work of creation and the author of that work.',
      'mh-en-3': 'By faith we understand that the worlds were framed by the word of God.'
    },
    'genesis.001.002.matthew-henry': {
      'mh-en-1': 'The Spirit of God was the first mover.',
      'mh-en-2': 'Chaos makes way for cosmos when God speaks.',
      'mh-en-3': 'Darkness serves to magnify the light that follows.'
    },
    'genesis.001.003.matthew-henry': {
      'mh-en-1': "God's word created the first daybreak.",
      'mh-en-2': 'No creature can resist His fiat.',
      'mh-en-3': 'Light is the first blessing He bestows.'
    },
    'genesis.001.004.matthew-henry': {
      'mh-en-1': 'God approves what He produces.',
      'mh-en-2': 'Distinction is the first act of providence.',
      'mh-en-3': 'Light and darkness cannot mingle.'
    },
    'genesis.001.005.matthew-henry': {
      'mh-en-1': 'He that formed time governs it.',
      'mh-en-2': 'Evening first reminds us of rest before labor.',
      'mh-en-3': 'Names fix the order God intends.'
    },
    'genesis.001.006.matthew-henry': {
      'mh-en-1': 'From chaos He raises a canopy of order.',
      'mh-en-2': 'He divides that He might unite rightly.',
      'mh-en-3': 'The firmament preaches His majesty.'
    },
    'genesis.001.007.matthew-henry': {
      'mh-en-1': 'The same hand that lifts waters holds them.',
      'mh-en-2': 'Every drop waits His nod.',
      'mh-en-3': 'Separation serves preservation.'
    },
    'genesis.001.008.matthew-henry': {
      'mh-en-1': 'He names the vault above to elevate our thoughts.',
      'mh-en-2': "No day is wasted in God's calendar.",
      'mh-en-3': 'Even in silence He works.'
    },
    'genesis.001.009.matthew-henry': {
      'mh-en-1': 'He sets bounds to waves and gives room for man.',
      'mh-en-2': 'Dry land is mercy solidified.',
      'mh-en-3': 'The sea obeys its Maker.'
    },
    'genesis.001.010.matthew-henry': {
      'mh-en-1': 'Naming fixes usefulness.',
      'mh-en-2': "Sea's roar bows to His word.",
      'mh-en-3': 'Goodness crowns the boundaries.'
    },
    'genesis.001.011.matthew-henry': {
      'mh-en-1': 'Herbs and fruits were made for man before man was made.',
      'mh-en-2': 'Every creature is serviceable in its place and kind.',
      'mh-en-3': 'We must bring forth fruit according to our kind.'
    },
    'genesis.001.012.matthew-henry': {
      'mh-en-1': 'God delights to behold His work thriving.',
      'mh-en-2': 'Seed carries the future and binds the present to it.',
      'mh-en-3': 'The fruitfulness of the earth reproves our barrenness.'
    },
    'genesis.001.013.matthew-henry': {
      'mh-en-1': 'Every evening brings us nearer to our rest.',
      'mh-en-2': "God's work goes on by steps.",
      'mh-en-3': 'Providence still provides.'
    },
    'genesis.001.014.matthew-henry': {
      'mh-en-1': 'The lights of heaven are the clocks of the world.',
      'mh-en-2': 'They are for signs of mercy and judgment.',
      'mh-en-3': 'Set them high that we may look upward.'
    },
    'genesis.001.015.matthew-henry': {
      'mh-en-1': 'Light is sweet; so are the consolations of the gospel.',
      'mh-en-2': 'God made lights, not to be worshipped, but serviceable.',
      'mh-en-3': 'The lights in heaven preach to us night and day.'
    },
    'genesis.001.016.matthew-henry': {
      'mh-en-1': 'The lights are servants, not deities.',
      'mh-en-2': 'Greater and lesser lights teach us to prefer usefulness above greatness.',
      'mh-en-3': 'Stars, though innumerable to us, are numbered by God.'
    },
    'genesis.001.017.matthew-henry': {
      'mh-en-1': 'The lamps of heaven are fixed by the hand of heaven.',
      'mh-en-2': 'They shine not for themselves but for the earth.',
      'mh-en-3': 'Let us in our sphere do the same.'
    },
    'genesis.001.018.matthew-henry': {
      'mh-en-1': 'Day and night are tutors to duty and devotion.',
      'mh-en-2': 'Light and darkness preach to us the difference between good and evil.',
      'mh-en-3': 'God saw it good; so must we acquiesce.'
    },
    'genesis.001.019.matthew-henry': {
      'mh-en-1': 'Each evening brings us a step nearer heaven.',
      'mh-en-2': 'The course of nature teaches order and constancy.',
      'mh-en-3': 'God finishes nothing in haste yet leaves nothing imperfect.'
    },
    'genesis.001.020.matthew-henry': {
      'mh-en-1': 'The waters, once chaos, become the womb of life.',
      'mh-en-2': 'Birds are the choristers of the creation.',
      'mh-en-3': 'Where God gives being he gives blessing.'
    },
    'genesis.001.021.matthew-henry': {
      'mh-en-1': "Leviathans that frighten us are under God's command.",
      'mh-en-2': 'Variety is the beauty of the world.',
      'mh-en-3': 'He that feeds the sparrow feeds the whale.'
    },
    'genesis.001.022.matthew-henry': {
      'mh-en-1': "God's blessing is life and increase.",
      'mh-en-2': 'Multiplication magnifies the Creator.',
      'mh-en-3': 'He who feeds sparrows can feed souls.'
    },
    'genesis.001.023.matthew-henry': {
      'mh-en-1': 'Every day adds beauty.',
      'mh-en-2': 'Let evening praise answer morning mercy.',
      'mh-en-3': "Time is God's gift."
    },
    'genesis.001.024.matthew-henry': {
      'mh-en-1': 'The earth is a nurse to all.',
      'mh-en-2': 'Creatures suited to various services.',
      'mh-en-3': 'Even creeping things have place.'
    },
    'genesis.001.025.matthew-henry': {
      'mh-en-1': 'The Creator delights in variety.',
      'mh-en-2': 'He made lion and lamb.',
      'mh-en-3': 'Goodness stamped on every creature.'
    },
    'genesis.001.026.matthew-henry': {
      'mh-en-1': 'Man was made last to see a furnished world.',
      'mh-en-2': 'God consults to teach deliberation.',
      'mh-en-3': 'Dominion is founded on likeness to God.'
    },
    'genesis.001.027.matthew-henry': {
      'mh-en-1': "Woman was made from man's side.",
      'mh-en-2': 'Image of God lies in the soul.',
      'mh-en-3': 'In Christ the image is renewed.'
    },
    'genesis.001.028.matthew-henry': {
      'mh-en-1': 'Fruitfulness is the effect of blessing.',
      'mh-en-2': 'Dominion is founded in duty.',
      'mh-en-3': 'We must not abuse what we rule.'
    },
    'genesis.001.029.matthew-henry': {
      'mh-en-1': 'God first feeds before commands.',
      'mh-en-2': 'Common mercies are distinguished favors.',
      'mh-en-3': 'Eat freely but bless reverently.'
    },
    'genesis.001.030.matthew-henry': {
      'mh-en-1': 'God opens His hand wide to every creature.',
      'mh-en-2': 'He who feeds the beasts will not fail His children.',
      'mh-en-3': 'Nature is a table spread by Providence.'
    },
    'genesis.001.031.matthew-henry': {
      'mh-en-1': "God's works need no amendments.",
      'mh-en-2': 'He rested not as weary but as well-pleased.',
      'mh-en-3': 'Let our review end in thankful rest.'
    }
  };

  function pad3(num) {
    var s = String(num);
    while (s.length < 3) {
      s = '0' + s;
    }
    return s;
  }

  function buildCommentaryAudioId(bookId, chapter, verse, type) {
    return bookId + '.' + pad3(chapter) + '.' + pad3(verse) + '.' + type;
  }

  function getPopup() {
    return document.getElementById('commentaryPopup');
  }

  function getContent() {
    return document.getElementById('commentaryContent');
  }

  function getPopupBox() {
    return document.getElementById('commentaryPopupBox');
  }

  function isCommentaryPopupOpen() {
    var popup = getPopup();
    return !!(popup && popup.classList.contains('show'));
  }

  function resetCommentaryPopupBoxDragStyles() {
    var box = getPopupBox();

    if (!box) return;

    box.style.position = '';
    box.style.left = '';
    box.style.top = '';
    box.style.right = '';
    box.style.bottom = '';
    box.style.margin = '';
    box.style.transform = '';
  }

  function syncCommentaryPopupLock() {
    var open = isCommentaryPopupOpen();

    document.body.classList.toggle(MODAL_OPEN_CLASS, open);

    if (open) {
      resetCommentaryPopupBoxDragStyles();
      ensureInlineControls();
    }
  }

  function getManifestAudios() {
    var config = window.GOMNA_AUDIO_CONFIG;
    if (!config || !config.manifestData || !config.manifestData.audios) {
      return null;
    }

    return config.manifestData.audios;
  }

  function getPopupScope() {
    return getPopup() || getContent();
  }

  function findCommentaryButtonByAudioId(audioId) {
    var scope = getPopupScope();
    if (!scope) return null;

    return scope.querySelector(
      '[data-audio-id="' + audioId + '"].gomna-audio-commentary-button'
    );
  }

  function findReplayButtonByAudioId(audioId) {
    var scope = getPopupScope();
    if (!scope) return null;

    return scope.querySelector(
      '[data-audio-replay-id="' + audioId + '"].' + REPLAY_BUTTON_CLASS
    );
  }

  function getControlsFooter() {
    var box = getPopupBox();
    var footer;
    var closeButton;

    if (!box) return null;

    footer = box.querySelector('.' + CONTROLS_FOOTER_CLASS);
    closeButton = box.querySelector('.popup-close[onclick*="closeCommentary"]');

    if (!footer && closeButton) {
      footer = closeButton.parentNode;
    }

    if (!footer) return null;

    footer.classList.add(CONTROLS_FOOTER_CLASS);
    footer.setAttribute('aria-label', '말씀풀이 오디오 컨트롤');

    if (closeButton) {
      closeButton.classList.add('gomna-audio-commentary-close-button');
      closeButton.setAttribute('aria-label', '말씀풀이 닫기');
      closeButton.setAttribute('title', '말씀풀이 닫기');
      closeButton.textContent = '✕';
    }

    return footer;
  }

  function getInlineListenButton() {
    return document.getElementById(LISTEN_BTN_ID);
  }

  function getInlineReplayButton() {
    return document.getElementById(REPLAY_BTN_ID);
  }

  function getInlineSequenceButton() {
    return document.getElementById(SEQUENCE_BTN_ID);
  }

  function getInlineCloseButton() {
    return document.getElementById(INLINE_CLOSE_BTN_ID);
  }

  function hidePopupOnlyLegacyControls() {
    var popup = getPopup();
    var content = getContent();
    var footers;
    var tabSequence;
    var i;

    if (!popup) return;

    footers = popup.querySelectorAll('.' + CONTROLS_FOOTER_CLASS);
    for (i = 0; i < footers.length; i++) {
      footers[i].style.display = 'none';
      footers[i].setAttribute('aria-hidden', 'true');
    }

    if (content) {
      tabSequence = content.querySelector(ALL_TABS_BUTTON_SELECTOR);
      if (tabSequence) {
        tabSequence.style.display = 'none';
        tabSequence.setAttribute('aria-hidden', 'true');
      }
    }
  }

  function bindInlineControlsDirect(listenBtn, replayBtn, seqBtn, closeBtn) {
    if (!listenBtn) return;

    if (listenBtn.getAttribute(INLINE_BOUND_ATTR) !== '1') {
      listenBtn.setAttribute(INLINE_BOUND_ATTR, '1');
      replayBtn.setAttribute(INLINE_BOUND_ATTR, '1');
      seqBtn.setAttribute(INLINE_BOUND_ATTR, '1');

      listenBtn.addEventListener('click', function() {
        var item = getActiveCommentaryItem(getContent());
        if (!item || !item.published) return;
        CommentaryAudioController.playSingle(item.audioId);
      });

      replayBtn.addEventListener('click', function() {
        var item = getActiveCommentaryItem(getContent());
        if (!item || !item.published) return;
        CommentaryAudioController.replaySingle(item.audioId);
      });

      seqBtn.addEventListener('click', function() {
        CommentaryAudioController.playFullSequence();
      });
    }

    if (closeBtn && closeBtn.getAttribute(INLINE_BOUND_ATTR) !== '1') {
      closeBtn.setAttribute(INLINE_BOUND_ATTR, '1');
      closeBtn.addEventListener('click', function() {
        if (typeof window.closeCommentary === 'function') {
          window.closeCommentary();
        }
      });
    }
  }

  function ensureInlineControls() {
    var box = getPopupBox();
    var content = getContent();
    var controls;
    var listenBtn;
    var replayBtn;
    var seqBtn;
    var closeBtn;

    if (!box || !content) return null;

    hidePopupOnlyLegacyControls();

    controls = document.getElementById(INLINE_CONTROLS_ID);
    if (!controls) {
      controls = document.createElement('div');
      controls.id = INLINE_CONTROLS_ID;
      controls.className = 'gomna-commentary-inline-controls';
      controls.setAttribute('role', 'group');
      controls.setAttribute('aria-label', '말씀풀이 오디오 컨트롤');

      listenBtn = document.createElement('button');
      listenBtn.type = 'button';
      listenBtn.id = LISTEN_BTN_ID;
      listenBtn.className = 'gomna-commentary-inline-button gomna-commentary-inline-listen';
      listenBtn.textContent = '▶ 듣기';

      replayBtn = document.createElement('button');
      replayBtn.type = 'button';
      replayBtn.id = REPLAY_BTN_ID;
      replayBtn.className = 'gomna-commentary-inline-button gomna-commentary-inline-replay';
      replayBtn.textContent = '↻ 다시듣기';

      seqBtn = document.createElement('button');
      seqBtn.type = 'button';
      seqBtn.id = SEQUENCE_BTN_ID;
      seqBtn.className = 'gomna-commentary-inline-button gomna-commentary-inline-sequence';
      seqBtn.textContent = SEQUENCE_IDLE_LABEL;

      closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.id = INLINE_CLOSE_BTN_ID;
      closeBtn.className = 'gomna-commentary-inline-close';
      closeBtn.setAttribute('aria-label', '말씀풀이 닫기');
      closeBtn.setAttribute('title', '말씀풀이 닫기');
      closeBtn.textContent = 'X';

      controls.appendChild(listenBtn);
      controls.appendChild(replayBtn);
      controls.appendChild(seqBtn);
      controls.appendChild(closeBtn);
      box.insertBefore(controls, content.nextSibling);

    } else {
      listenBtn = document.getElementById(LISTEN_BTN_ID);
      replayBtn = document.getElementById(REPLAY_BTN_ID);
      seqBtn = document.getElementById(SEQUENCE_BTN_ID);
      closeBtn = document.getElementById(INLINE_CLOSE_BTN_ID);

      if (!closeBtn) {
        closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.id = INLINE_CLOSE_BTN_ID;
        closeBtn.className = 'gomna-commentary-inline-close';
        closeBtn.setAttribute('aria-label', '말씀풀이 닫기');
        closeBtn.setAttribute('title', '말씀풀이 닫기');
        closeBtn.textContent = 'X';
        controls.appendChild(closeBtn);
      }
    }

    bindInlineControlsDirect(listenBtn, replayBtn, seqBtn, closeBtn);
    return controls;
  }

  function updateCommentaryHeaderCopy() {
    var title = document.getElementById('commentaryTitle');
    var header = document.getElementById('popupDragHeader');
    var subtitle;
    var note;

    if (!title || !header) return;

    title.textContent = '📖 말씀풀이';
    subtitle = title.nextElementSibling;

    if (subtitle) {
      subtitle.textContent = '주석과 해설로 깊어지는 말씀 묵상';
    }

    note = header.querySelector('.' + HEADER_NOTE_CLASS);
    if (!note) {
      note = document.createElement('div');
      note.className = HEADER_NOTE_CLASS;
      if (subtitle && subtitle.parentNode) {
        subtitle.parentNode.appendChild(note);
      }
    }

    note.textContent = '매튜 헨리 원문 · 원어 · 역사 · 신학 · 설교자료를 함께 살펴봅니다';
  }

  function restoreMiniPlayerExpandButtonLabel() {
    var expandButton = document.querySelector(
      '#gomna-audio-mini-player .gomna-audio-btn-expand[data-audio-action="expand"]'
    );

    if (!expandButton) return;

    expandButton.setAttribute('aria-label', '말씀 오디오 카드 열기');
    expandButton.setAttribute('title', '말씀 오디오 카드 열기');
  }

  function isPublishedAudioId(audioId) {
    var audios = getManifestAudios();
    var entry = audios && audios[audioId];

    return !!(
      entry &&
      entry.status === 'published' &&
      entry.filePath &&
      String(entry.filePath).trim()
    );
  }

  function getPublishedSequenceAudioIds() {
    var ids = [];

    for (var i = 0; i < currentCommentaryAudioIds.length; i++) {
      if (isPublishedAudioId(currentCommentaryAudioIds[i])) {
        ids.push(currentCommentaryAudioIds[i]);
      }
    }

    return ids;
  }

  function getCommentaryContext() {
    var content = getContent();
    var pick = content && content.querySelector('.commentary-nav-pick-txt');
    var text = pick ? pick.textContent.replace(/\s+/g, ' ').trim() : '';
    var match = text.match(/^(.+?)\s+(\d+):(\d+)$/);

    if (match) {
      var bookName = match[1];
      var bookId = window.BOOK_FILE_MAP && window.BOOK_FILE_MAP[bookName];

      if (bookId) {
        return {
          bookName: bookName,
          bookId: bookId,
          chapter: parseInt(match[2], 10),
          verse: parseInt(match[3], 10)
        };
      }
    }

    if (window.currentBook && window.currentChapter) {
      var bookIdFromCurrent = window.BOOK_FILE_MAP && window.BOOK_FILE_MAP[window.currentBook.name];

      if (bookIdFromCurrent && match) {
        return {
          bookName: window.currentBook.name,
          bookId: bookIdFromCurrent,
          chapter: window.currentChapter,
          verse: parseInt(match[3], 10)
        };
      }
    }

    return null;
  }

  function contextKey(ctx) {
    return ctx.bookId + '.' + pad3(ctx.chapter) + '.' + pad3(ctx.verse);
  }

  function markCommentaryCompleted(audioId) {
    if (audioId) {
      completedAudioIds[audioId] = true;
    }
  }

  function clearCommentaryCompleted(audioId) {
    if (audioId) {
      delete completedAudioIds[audioId];
    }
  }

  function resetCommentaryPlaybackState() {
    completedAudioIds = {};
    lastSequenceQueueIndex = -1;
    replayGuardAudioId = null;
    currentCueKey = null;
  }

  function isCommentaryCompleted(audioId) {
    return !!completedAudioIds[audioId];
  }

  function hasActiveCommentaryPlayback(state) {
    return !!(
      state &&
      isCommentaryAudioId(state.currentAudioId) &&
      (state.isPlaying || state.isPaused)
    );
  }

  function hasActiveCommentarySequence(state) {
    return !!(
      state &&
      state.queueActive &&
      state.queueSource === currentSequenceSource &&
      (state.isPlaying || state.isPaused)
    );
  }

  function buildCueKey(audioId, cueId) {
    return audioId + '#' + cueId;
  }

  function syncCommentaryItemsForContext(ctx) {
    var key = contextKey(ctx);

    if (currentContext && contextKey(currentContext) === key) {
      return;
    }

    resetCommentaryPlaybackState();
    currentContext = ctx;
    currentCommentaryItems = COMMENTARY_TYPE_TEMPLATES.map(function(template) {
      var audioId = buildCommentaryAudioId(ctx.bookId, ctx.chapter, ctx.verse, template.type);

      return {
        title: template.title,
        tabId: template.tabId,
        type: template.type,
        audioId: audioId,
        published: isPublishedAudioId(audioId)
      };
    });
    currentCommentaryAudioIds = currentCommentaryItems.map(function(item) {
      return item.audioId;
    });
    currentSequenceSource =
      'commentary:' + ctx.bookId + '.' + pad3(ctx.chapter) + '.' + pad3(ctx.verse);
  }

  function isCommentaryTabsPopup(popup) {
    if (!popup || !popup.classList.contains('show')) return false;

    var content = getContent();
    if (!content || !content.querySelector('.commentary-tabs')) return false;

    var ctx = getCommentaryContext();
    if (!ctx) return false;

    syncCommentaryItemsForContext(ctx);
    return true;
  }

  function createButton(item) {
    var btn = document.createElement('button');

    btn.type = 'button';
    btn.className = 'gomna-audio-commentary-button';
    btn.setAttribute('data-audio-id', item.audioId);

    if (item.published) {
      btn.setAttribute('data-audio-action', 'play');
      btn.setAttribute('aria-label', item.title + ' 듣기');
      btn.textContent = '▶ 듣기';
    } else {
      btn.className += ' gomna-audio-commentary-button--pending';
      btn.disabled = true;
      btn.setAttribute('aria-label', item.title + ' 준비 중');
      btn.textContent = '준비 중';
    }

    return btn;
  }

  function createReplayButton(item) {
    var btn = document.createElement('button');

    btn.type = 'button';
    btn.className = 'gomna-audio-commentary-button ' + REPLAY_BUTTON_CLASS;
    btn.setAttribute('data-audio-replay-id', item.audioId);

    if (item.published) {
      btn.disabled = false;
      btn.setAttribute('aria-label', item.title + ' 처음부터 다시듣기');
      btn.textContent = '↻ 다시듣기';
    } else {
      btn.disabled = true;
      btn.classList.add('gomna-audio-commentary-button--pending');
      btn.setAttribute('aria-label', item.title + ' 준비 중');
      btn.textContent = '준비 중';
    }

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

  function removeExistingCommentaryButton(section) {
    var existing = section.querySelector('.gomna-audio-commentary-button');
    var replay = section.querySelector('.' + REPLAY_BUTTON_CLASS);

    if (existing) existing.remove();
    if (replay) replay.remove();
    section.removeAttribute(FLAG_ATTR);
    section.removeAttribute('data-audio-target');
  }

  function ensureReplayButton(titleHost, item) {
    var existingReplay = titleHost.querySelector(
      '[data-audio-replay-id="' + item.audioId + '"].' + REPLAY_BUTTON_CLASS
    );

    if (!existingReplay) {
      existingReplay = createReplayButton(item);
      titleHost.appendChild(existingReplay);
    }

    updateReplayButton(existingReplay, item);
  }

  function getActionHostForItem(content, item) {
    var button;

    if (!content || !item) return null;

    button = findCommentaryButtonByAudioId(item.audioId);

    return button ? button.parentNode : null;
  }

  function insertButtonForItem(content, item) {
    var section = document.getElementById(item.tabId);
    if (!section || !content.contains(section)) {
      console.warn('[GOMNA_AUDIO] 주석 섹션을 찾지 못했습니다:', item.title);
      return false;
    }

    var existingBtn = findCommentaryButtonByAudioId(item.audioId) ||
      section.querySelector('.gomna-audio-commentary-button');
    if (existingBtn) {
      var existingId = existingBtn.getAttribute('data-audio-id');
      if (existingId === item.audioId) {
        updateSingleCommentaryButton(existingBtn, item);
        ensureReplayButton(existingBtn.parentNode, item);
        return true;
      }
      removeExistingCommentaryButton(section);
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
    ensureReplayButton(titleHost, item);

    return true;
  }

  function updateSingleCommentaryButton(button, item) {
    button.setAttribute('data-audio-id', item.audioId);

    if (item.published) {
      button.disabled = false;
      button.classList.remove('gomna-audio-commentary-button--pending');
      button.setAttribute('data-audio-action', 'play');
      button.setAttribute('aria-label', item.title + ' 듣기');
    } else {
      button.disabled = true;
      button.classList.add('gomna-audio-commentary-button--pending');
      button.removeAttribute('data-audio-action');
      button.setAttribute('aria-label', item.title + ' 준비 중');
      button.textContent = '준비 중';
      button.classList.remove(ACTIVE_BUTTON_CLASS);
      button.setAttribute('aria-pressed', 'false');
    }
  }

  function updateReplayButton(button, item) {
    if (!button) return;

    button.setAttribute('data-audio-replay-id', item.audioId);

    if (item.published) {
      button.disabled = false;
      button.classList.remove('gomna-audio-commentary-button--pending');
      button.setAttribute('aria-label', item.title + ' 처음부터 다시듣기');
      button.textContent = '↻ 다시듣기';
    } else {
      button.disabled = true;
      button.classList.add('gomna-audio-commentary-button--pending');
      button.setAttribute('aria-label', item.title + ' 준비 중');
      button.textContent = '준비 중';
      button.classList.remove(ACTIVE_BUTTON_CLASS);
      button.setAttribute('aria-pressed', 'false');
    }
  }

  function enhanceManualCueTargets(content) {
    var section = document.getElementById('tab-매튜헨리');
    var audioId;
    var cueTexts;
    var cueIds;
    var cells;

    if (!section || !content || !content.contains(section)) return;
    if (!currentContext) return;

    audioId = buildCommentaryAudioId(
      currentContext.bookId,
      currentContext.chapter,
      currentContext.verse,
      'matthew-henry'
    );
    cueTexts = COMMENTARY_MANUAL_CUE_TEXTS[audioId];

    if (!cueTexts || !COMMENTARY_MANUAL_CUES[audioId]) return;

    cueIds = Object.keys(cueTexts);
    cells = section.querySelectorAll('td.col1');

    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var text = (cell.textContent || '').replace(/\s+/g, ' ').trim();

      if (cell.querySelector('.gomna-commentary-cue')) continue;

      for (var j = 0; j < cueIds.length; j++) {
        var cueId = cueIds[j];

        if (text !== cueTexts[cueId]) continue;

        var span = document.createElement('span');
        span.className = 'gomna-commentary-cue';
        span.setAttribute('data-audio-id', audioId);
        span.setAttribute('data-cue-id', cueId);
        span.setAttribute('role', 'button');
        span.setAttribute('tabindex', '0');
        span.setAttribute('aria-label', '매튜헨리 영어 원문 구간 다시듣기');
        span.textContent = text;

        cell.textContent = '';
        cell.appendChild(span);
        break;
      }
    }
  }

  function updateManualCueHighlights(content) {
    if (!content || !content.querySelectorAll) return;

    Array.prototype.forEach.call(content.querySelectorAll('.gomna-commentary-cue'), function(cue) {
      var cueKey = buildCueKey(cue.getAttribute('data-audio-id'), cue.getAttribute('data-cue-id'));
      var active = currentCueKey && cueKey === currentCueKey;

      cue.classList.toggle(ACTIVE_CUE_CLASS, !!active);
      cue.setAttribute('aria-current', active ? 'true' : 'false');
    });
  }

  function bindAllTabsAudio(content) {
    var scope = getPopupScope();
    var allTabsButton = scope && scope.querySelector(ALL_TABS_BUTTON_SELECTOR);
    var publishedIds = getPublishedSequenceAudioIds();
    var controlsFooter = getControlsFooter();
    var closeButton = controlsFooter && controlsFooter.querySelector('.popup-close');

    if (!allTabsButton) return;

    allTabsButton.classList.remove('commentary-tab', 'active');
    allTabsButton.classList.add('gomna-audio-commentary-button', SEQUENCE_BUTTON_CLASS);
    allTabsButton.setAttribute('aria-label', '전체 말씀풀이 듣기');

    if (controlsFooter && allTabsButton.parentNode !== controlsFooter) {
      controlsFooter.insertBefore(allTabsButton, closeButton || null);
    }

    if (!publishedIds.length) {
      allTabsButton.disabled = true;
      allTabsButton.classList.add('gomna-audio-commentary-button--pending');
      allTabsButton.textContent = '준비 중';
      return;
    }

    allTabsButton.disabled = false;
    allTabsButton.classList.remove('gomna-audio-commentary-button--pending');
    allTabsButton.textContent = SEQUENCE_IDLE_LABEL;

    if (allTabsButton.getAttribute(ALL_TABS_AUDIO_ATTR) === 'true') return;

    allTabsButton.setAttribute(ALL_TABS_AUDIO_ATTR, 'true');
    allTabsButton.addEventListener('click', function(event) {
      event.preventDefault();
      event.stopPropagation();
      CommentaryAudioController.playFullSequence();
    });
  }

  function syncInlineControls(content) {
    var item = getActiveCommentaryItem(content);
    var listenBtn = getInlineListenButton();
    var replayBtn = getInlineReplayButton();
    var seqBtn = getInlineSequenceButton();
    var publishedIds = getPublishedSequenceAudioIds();
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var activeAudioId = hasActiveCommentaryPlayback(state) ? state.currentAudioId : null;

    ensureInlineControls();

    if (!item || !listenBtn || !replayBtn || !seqBtn) return;

    listenBtn.setAttribute('data-audio-id', item.audioId);
    replayBtn.setAttribute('data-audio-replay-id', item.audioId);

    if (!item.published) {
      listenBtn.disabled = true;
      replayBtn.disabled = true;
      listenBtn.classList.add('gomna-commentary-inline-button--pending');
      replayBtn.classList.add('gomna-commentary-inline-button--pending');
      listenBtn.textContent = '준비 중';
      replayBtn.textContent = '준비 중';
      listenBtn.setAttribute('aria-label', item.title + ' 준비 중');
      replayBtn.setAttribute('aria-label', item.title + ' 준비 중');
    } else {
      listenBtn.disabled = false;
      replayBtn.disabled = false;
      listenBtn.classList.remove('gomna-commentary-inline-button--pending');
      replayBtn.classList.remove('gomna-commentary-inline-button--pending');
      replayBtn.textContent = '↻ 다시듣기';
      replayBtn.setAttribute('aria-label', item.title + ' 처음부터 다시듣기');

      if (activeAudioId === item.audioId) {
        if (state && state.isPaused) {
          listenBtn.textContent = '▶ 이어듣기';
          listenBtn.setAttribute('aria-label', item.title + ' 이어듣기');
        } else {
          listenBtn.textContent = '⏸ 일시정지';
          listenBtn.setAttribute('aria-label', item.title + ' 일시정지');
        }
        listenBtn.classList.add(ACTIVE_BUTTON_CLASS);
        listenBtn.setAttribute('aria-pressed', 'true');
      } else if (isCommentaryCompleted(item.audioId)) {
        listenBtn.textContent = '↻ 다시듣기';
        listenBtn.setAttribute('aria-label', item.title + ' 다시듣기');
        listenBtn.classList.remove(ACTIVE_BUTTON_CLASS);
        listenBtn.setAttribute('aria-pressed', 'false');
      } else {
        listenBtn.textContent = '▶ 듣기';
        listenBtn.setAttribute('aria-label', item.title + ' 듣기');
        listenBtn.classList.remove(ACTIVE_BUTTON_CLASS);
        listenBtn.setAttribute('aria-pressed', 'false');
      }
    }

    if (!publishedIds.length) {
      seqBtn.disabled = true;
      seqBtn.classList.add('gomna-commentary-inline-button--pending');
      seqBtn.textContent = '준비 중';
      seqBtn.setAttribute('aria-label', '전체 말씀풀이 준비 중');
      return;
    }

    seqBtn.disabled = false;
    seqBtn.classList.remove('gomna-commentary-inline-button--pending');

    if (hasActiveCommentarySequence(state)) {
      seqBtn.textContent = state.isPaused ? SEQUENCE_PAUSED_LABEL : SEQUENCE_PLAYING_LABEL;
      seqBtn.setAttribute(
        'aria-label',
        state.isPaused ? '전체 말씀풀이 이어듣기' : '전체 말씀풀이 일시정지'
      );
      seqBtn.classList.add(ACTIVE_TAB_CLASS);
      seqBtn.setAttribute('aria-pressed', state.isPaused ? 'false' : 'true');
    } else {
      seqBtn.textContent = SEQUENCE_IDLE_LABEL;
      seqBtn.setAttribute('aria-label', '전체 말씀풀이 듣기');
      seqBtn.classList.remove(ACTIVE_TAB_CLASS);
      seqBtn.setAttribute('aria-pressed', 'false');
    }
  }

  function getActiveCommentaryItem(content) {
    var activeTab;
    var item;

    if (!content) return currentCommentaryItems[0] || null;

    activeTab = content.querySelector('.commentary-tab.active:not(' + ALL_TABS_BUTTON_SELECTOR + ')') ||
      content.querySelector('.commentary-tab.' + ACTIVE_TAB_CLASS + ':not(' + ALL_TABS_BUTTON_SELECTOR + ')');

    if (activeTab) {
      item = getItemByTabButton(content, activeTab);
      if (item) return item;
    }

    return currentCommentaryItems[0] || null;
  }

  function syncCommentaryFooterControls(content) {
    var item = getActiveCommentaryItem(content);
    var controlsFooter = getControlsFooter();
    var closeButton = controlsFooter && controlsFooter.querySelector('.popup-close');
    var button;
    var replayButton;
    var allTabsButton;
    var footerButtons;
    var sequenceButtons;

    if (!item || !controlsFooter) return;

    footerButtons = controlsFooter.querySelectorAll(
      '.gomna-audio-commentary-button[data-audio-id], .' + REPLAY_BUTTON_CLASS + '[data-audio-replay-id]'
    );

    Array.prototype.forEach.call(footerButtons, function(control) {
      var audioId = control.getAttribute('data-audio-id') ||
        control.getAttribute('data-audio-replay-id');
      var controlItem = getItemByAudioId(audioId);
      var section;
      var titleHost;

      if (!controlItem) {
        control.remove();
        return;
      }

      if (controlItem.audioId === item.audioId) return;

      section = document.getElementById(controlItem.tabId);
      titleHost = section && (
        section.querySelector('.gomna-audio-commentary-header') ||
        findTitleHost(section, controlItem.title)
      );

      if (titleHost) {
        titleHost.appendChild(control);
      } else {
        control.remove();
      }
    });

    button = findCommentaryButtonByAudioId(item.audioId);
    replayButton = findReplayButtonByAudioId(item.audioId);
    allTabsButton = getPopupScope() && getPopupScope().querySelector(ALL_TABS_BUTTON_SELECTOR);
    sequenceButtons = getPopupScope() && getPopupScope().querySelectorAll(ALL_TABS_BUTTON_SELECTOR);

    if (sequenceButtons) {
      Array.prototype.forEach.call(sequenceButtons, function(sequenceButton) {
        if (sequenceButton !== allTabsButton) {
          sequenceButton.remove();
        }
      });
    }

    if (button) {
      controlsFooter.insertBefore(button, closeButton || null);
    }

    if (replayButton) {
      controlsFooter.insertBefore(replayButton, closeButton || null);
    }

    if (allTabsButton) {
      controlsFooter.insertBefore(allTabsButton, closeButton || null);
    }

    if (closeButton && closeButton.parentNode === controlsFooter) {
      controlsFooter.appendChild(closeButton);
    }

    dedupeFooterControls(controlsFooter);
  }

  function dedupeFooterControls(footer) {
    var seenAudioIds = {};
    var seenReplayIds = {};
    var closeButtons;
    var keepClose;

    if (!footer) return;

    Array.prototype.forEach.call(
      footer.querySelectorAll('.gomna-audio-commentary-button[data-audio-id]'),
      function(control) {
        var audioId = control.getAttribute('data-audio-id');

        if (!audioId || !seenAudioIds[audioId]) {
          if (audioId) seenAudioIds[audioId] = true;
          return;
        }

        control.remove();
      }
    );

    Array.prototype.forEach.call(
      footer.querySelectorAll('.' + REPLAY_BUTTON_CLASS + '[data-audio-replay-id]'),
      function(control) {
        var audioId = control.getAttribute('data-audio-replay-id');

        if (!audioId || !seenReplayIds[audioId]) {
          if (audioId) seenReplayIds[audioId] = true;
          return;
        }

        control.remove();
      }
    );

    closeButtons = footer.querySelectorAll('.popup-close[onclick*="closeCommentary"]');
    keepClose = closeButtons[closeButtons.length - 1];

    Array.prototype.forEach.call(closeButtons, function(control) {
      if (control !== keepClose) {
        control.remove();
      }
    });
  }

  function handleCommentaryButtonClick(event) {
    var cueEl = event.target.closest('.gomna-commentary-cue[data-audio-id][data-cue-id]');
    var replayBtn = event.target.closest('.' + REPLAY_BUTTON_CLASS + '[data-audio-replay-id]');
    var btn = event.target.closest('.gomna-audio-commentary-button[data-audio-id]');
    var content = getContent();
    var popup = getPopup();
    var audioId;
    var item;

    if (cueEl) {
      if (!content || !content.contains(cueEl)) return;

      audioId = cueEl.getAttribute('data-audio-id');
      item = getItemByAudioId(audioId);
      if (!item || !item.published) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      CommentaryAudioController.playCue(audioId, cueEl.getAttribute('data-cue-id'));
      return;
    }

    if (replayBtn) {
      if (!popup || !popup.contains(replayBtn)) return;

      audioId = replayBtn.getAttribute('data-audio-replay-id');
      item = getItemByAudioId(audioId);
      if (!item || !item.published) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      CommentaryAudioController.replaySingle(audioId);
      return;
    }

    if (!btn || btn.matches(ALL_TABS_BUTTON_SELECTOR)) return;
    if (!popup || !popup.contains(btn)) return;

    audioId = btn.getAttribute('data-audio-id');
    item = getItemByAudioId(audioId);
    if (!item || !item.published) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    CommentaryAudioController.playSingle(audioId);
  }

  function bindCommentaryButtonReplayHandler() {
    if (bindCommentaryButtonReplayHandler.bound) return;

    bindCommentaryButtonReplayHandler.bound = true;
    document.addEventListener('click', handleCommentaryButtonClick, true);
    document.addEventListener('keydown', function(event) {
      if (event.key !== 'Enter' && event.key !== ' ') return;

      handleCommentaryButtonClick(event);
    }, true);
  }

  function bindCommentaryTabQueueNavigation(content) {
    var tabs = content.querySelectorAll('.commentary-tab');

    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].matches(ALL_TABS_BUTTON_SELECTOR)) continue;
      if (tabs[i].getAttribute(TAB_AUDIO_ATTR) === 'true') continue;

      tabs[i].setAttribute(TAB_AUDIO_ATTR, 'true');
      tabs[i].addEventListener('click', function() {
        var item = getItemByTabButton(content, this);

        if (!item) return;
        jumpSequenceToItemIfActive(item);
        setTimeout(function() {
          syncCommentaryFooterControls(content);
          syncInlineControls(content);
          updateCommentaryButtonLabels();
        }, 0);
      });
    }
  }

  function getItemByTabButton(content, tab) {
    if (!tab) return null;

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      var item = currentCommentaryItems[i];
      if (getTabButtonForItem(content, item) === tab) {
        return item;
      }
    }

    return null;
  }

  function jumpSequenceToItemIfActive(item) {
    return CommentaryAudioController.playFromTab(item);
  }

  function isCommentaryAudioId(audioId) {
    return !!getItemByAudioId(audioId);
  }

  function getItemByAudioId(audioId) {
    for (var i = 0; i < currentCommentaryItems.length; i++) {
      if (currentCommentaryItems[i].audioId === audioId) {
        return currentCommentaryItems[i];
      }
    }

    return null;
  }

  var CommentaryAudioController = {
    getEngine: function() {
      return window.GOMNA_AUDIO_ENGINE || null;
    },

    getState: function() {
      var engine = this.getEngine();
      return engine && engine.getState ? engine.getState() : null;
    },

    isSequenceActive: function(state) {
      return hasActiveCommentarySequence(state);
    },

    markTransitionStop: function(state) {
      if (state && isCommentaryAudioId(state.currentAudioId)) {
        replayGuardAudioId = state.currentAudioId;
      }
    },

    stopForTransition: function(engine, state) {
      if (!engine || !engine.stopAudio || !state || !state.currentAudioId) return;

      this.markTransitionStop(state);
      engine.stopAudio();
    },

    playSingle: function(audioId) {
      var engine = this.getEngine();
      var state = this.getState();

      if (!engine || !engine.playAudioById || !getItemByAudioId(audioId)) return false;

      if (state && state.currentAudioId === audioId) {
        if (state.isPlaying && engine.pauseAudio) {
          engine.pauseAudio();
          updateCommentaryButtonLabels();
          return true;
        }

        if (state.isPaused && engine.resumeAudio) {
          engine.resumeAudio();
          updateCommentaryButtonLabels();
          return true;
        }
      }

      this.startSingleFromBeginning(audioId);
      return true;
    },

    replaySingle: function(audioId) {
      return this.startSingleFromBeginning(audioId);
    },

    startSingleFromBeginning: function(audioId) {
      var engine = this.getEngine();
      var state = this.getState();

      if (!engine || !engine.playAudioById || !getItemByAudioId(audioId)) return false;

      clearCommentaryCompleted(audioId);
      currentCueKey = null;
      lastSequenceQueueIndex = -1;
      this.stopForTransition(engine, state);
      engine.playAudioById(audioId, { startTime: 0 });
      updateCommentaryButtonLabels();
      return true;
    },

    playFullSequence: function() {
      var engine = this.getEngine();
      var state = this.getState();
      var ids = getPublishedSequenceAudioIds();

      if (!engine || !engine.playAudioSequence || !ids.length) return false;

      currentCueKey = null;

      if (this.isSequenceActive(state)) {
        if (state.isPlaying && engine.pauseAudio) {
          engine.pauseAudio();
          updateCommentaryButtonLabels();
          return true;
        }

        if (state.isPaused && engine.resumeAudio) {
          engine.resumeAudio();
          updateCommentaryButtonLabels();
          return true;
        }
      }

      if (!this.isSequenceActive(state)) {
        this.stopForTransition(engine, state);
      }

      lastSequenceQueueIndex = 0;
      engine.playAudioSequence(ids, {
        source: currentSequenceSource,
        startIndex: 0
      });
      updateCommentaryButtonLabels();
      return true;
    },

    playSequenceFrom: function(audioId) {
      var engine = this.getEngine();
      var state = this.getState();
      var ids = getPublishedSequenceAudioIds();
      var startIndex = ids.indexOf(audioId);

      if (!engine || !engine.playAudioSequence || startIndex < 0) return false;

      clearCommentaryCompleted(audioId);
      currentCueKey = null;
      lastSequenceQueueIndex = startIndex;
      this.stopForTransition(engine, state);
      engine.playAudioSequence(ids, {
        source: currentSequenceSource,
        startIndex: startIndex,
        startTime: 0
      });
      updateCommentaryButtonLabels();
      return true;
    },

    playFromTab: function(item) {
      var state = this.getState();

      if (!item || !item.published) return false;

      if (this.isSequenceActive(state)) {
        return this.playSequenceFrom(item.audioId);
      }

      if (hasActiveCommentaryPlayback(state)) {
        return this.startSingleFromBeginning(item.audioId);
      }

      return false;
    },

    playCue: function(audioId, cueId) {
      var engine = this.getEngine();
      var state = this.getState();
      var cues = COMMENTARY_MANUAL_CUES[audioId];
      var startTime = cues && cues[cueId];
      var ids = getPublishedSequenceAudioIds();
      var startIndex = ids.indexOf(audioId);

      if (!engine || !engine.playAudioById || !getItemByAudioId(audioId)) return false;
      if (typeof startTime !== 'number') return false;

      clearCommentaryCompleted(audioId);
      currentCueKey = buildCueKey(audioId, cueId);

      if (this.isSequenceActive(state) && engine.playAudioSequence && startIndex >= 0) {
        lastSequenceQueueIndex = startIndex;
        this.stopForTransition(engine, state);
        engine.playAudioSequence(ids, {
          source: currentSequenceSource,
          startIndex: startIndex,
          startTime: startTime
        });
      } else {
        lastSequenceQueueIndex = -1;
        this.stopForTransition(engine, state);
        engine.playAudioById(audioId, { startTime: startTime });
      }

      updateCommentaryButtonLabels();
      return true;
    },

    stopIfCurrentCommentary: function() {
      var engine = this.getEngine();
      var state = this.getState();

      if (!engine || !engine.stopAudio || !state) return false;

      if (this.isSequenceActive(state) || isCommentaryAudioId(state.currentAudioId)) {
        lastSequenceQueueIndex = -1;
        currentCueKey = null;
        this.stopForTransition(engine, state);
        updateCommentaryButtonLabels();
        return true;
      }

      return false;
    }
  };

  function syncSequenceCompletedFromQueue(state) {
    var ids;
    var idx;
    var previousIndex;

    if (!state || !state.queueActive || state.queueSource !== currentSequenceSource) {
      return;
    }

    ids = getPublishedSequenceAudioIds();
    idx = state.queueIndex;

    if (lastSequenceQueueIndex < 0 || idx <= lastSequenceQueueIndex) {
      lastSequenceQueueIndex = idx;
      return;
    }

    for (previousIndex = lastSequenceQueueIndex; previousIndex < idx; previousIndex++) {
      if (ids[previousIndex]) {
        markCommentaryCompleted(ids[previousIndex]);
      }
    }

    lastSequenceQueueIndex = idx;
  }

  function updateCommentaryButtonLabels() {
    var content = getContent();
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;
    var activeAudioId = hasActiveCommentaryPlayback(state)
      ? state.currentAudioId
      : null;

    if (!content) return;

    syncSequenceCompletedFromQueue(state);
    clearActiveCommentaryDisplay(content);

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      var item = currentCommentaryItems[i];
      var button = findCommentaryButtonByAudioId(item.audioId);
      if (!button) continue;

      if (!item.published) {
        button.textContent = '준비 중';
        button.removeAttribute('data-audio-action');
        button.classList.remove(ACTIVE_BUTTON_CLASS);
        button.setAttribute('aria-pressed', 'false');
        updateReplayButton(findReplayButtonByAudioId(item.audioId), item);
        continue;
      }

      button.setAttribute('data-audio-action', 'play');
      updateReplayButton(findReplayButtonByAudioId(item.audioId), item);

      if (activeAudioId === item.audioId) {
        if (state && state.isPaused) {
          button.textContent = '▶ 이어듣기';
          button.setAttribute('aria-label', item.title + ' 이어듣기');
        } else {
          button.textContent = '⏸ 일시정지';
          button.setAttribute('aria-label', item.title + ' 일시정지');
        }
      } else if (isCommentaryCompleted(item.audioId)) {
        button.textContent = '↻ 다시듣기';
        button.setAttribute('aria-label', item.title + ' 다시듣기');
      } else {
        button.textContent = '▶ 듣기';
        button.setAttribute('aria-label', item.title + ' 듣기');
      }

      if (activeAudioId === item.audioId) {
        button.classList.add(ACTIVE_BUTTON_CLASS);
        button.setAttribute('aria-pressed', 'true');
        markActiveCommentaryTab(content, item);
        markActiveCommentarySection(content, item);
      } else {
        button.classList.remove(ACTIVE_BUTTON_CLASS);
        button.setAttribute('aria-pressed', 'false');
      }
    }

    updateManualCueHighlights(content);

    var scope = getPopupScope();
    var allTabsButton = scope && scope.querySelector(ALL_TABS_BUTTON_SELECTOR);
    if (!allTabsButton) return;

    var publishedIds = getPublishedSequenceAudioIds();
    if (!publishedIds.length) {
      allTabsButton.textContent = '준비 중';
      return;
    }

    var sequenceActive = hasActiveCommentarySequence(state);
    if (sequenceActive) {
      allTabsButton.textContent = state.isPaused ? SEQUENCE_PAUSED_LABEL : SEQUENCE_PLAYING_LABEL;
      allTabsButton.setAttribute(
        'aria-label',
        state.isPaused ? '전체 말씀풀이 이어듣기' : '전체 말씀풀이 일시정지'
      );
      allTabsButton.classList.add(ACTIVE_TAB_CLASS);
      allTabsButton.setAttribute('aria-pressed', state.isPaused ? 'false' : 'true');
    } else {
      allTabsButton.textContent = SEQUENCE_IDLE_LABEL;
      allTabsButton.setAttribute('aria-label', '전체 말씀풀이 듣기');
      allTabsButton.classList.remove(ACTIVE_TAB_CLASS);
      allTabsButton.setAttribute('aria-pressed', 'false');
    }

    syncCommentaryFooterControls(content);
    syncInlineControls(content);
  }

  function clearActiveCommentaryDisplay(content) {
    if (!content || !content.querySelectorAll) return;

    Array.prototype.forEach.call(
      content.querySelectorAll('.' + ACTIVE_SECTION_CLASS),
      function(section) {
        section.classList.remove(ACTIVE_SECTION_CLASS);
        section.removeAttribute('aria-current');
      }
    );

    Array.prototype.forEach.call(
      content.querySelectorAll('.' + ACTIVE_TAB_CLASS + ':not(' + ALL_TABS_BUTTON_SELECTOR + ')'),
      function(tab) {
        tab.classList.remove(ACTIVE_TAB_CLASS);
        tab.removeAttribute('aria-current');
      }
    );
  }

  function getTabButtonForItem(content, item) {
    var tabs = content.querySelectorAll('.commentary-tab');

    for (var i = 0; i < tabs.length; i++) {
      if (tabs[i].matches(ALL_TABS_BUTTON_SELECTOR)) continue;
      if ((tabs[i].textContent || '').replace(/\s+/g, ' ').trim() === item.title) {
        return tabs[i];
      }
    }

    return null;
  }

  function getReplayButtonForItem(content, item) {
    return content.querySelector(
      '[data-audio-replay-id="' + item.audioId + '"].' + REPLAY_BUTTON_CLASS
    );
  }

  function markActiveCommentaryTab(content, item) {
    var tab = getTabButtonForItem(content, item);

    if (!tab) return;

    if (!tab.classList.contains('active') && typeof window.switchCommentaryTab === 'function') {
      window.switchCommentaryTab(tab, item.tabId);
    }

    tab.classList.add(ACTIVE_TAB_CLASS);
    tab.setAttribute('aria-current', 'true');
  }

  function markActiveCommentarySection(content, item) {
    var section = document.getElementById(item.tabId);

    if (!section || !content.contains(section)) return;

    section.classList.add(ACTIVE_SECTION_CLASS);
    section.setAttribute('aria-current', 'true');
  }

  function removeLegacySequenceControls(content) {
    var guideText = '원어분석부터 교차참조까지 9개 말씀풀이를 순서대로 듣습니다.';

    if (!content || !content.querySelectorAll) return;

    Array.prototype.forEach.call(content.querySelectorAll('button, div, p, span'), function(el) {
      var text = (el.textContent || '').replace(/\s+/g, ' ').trim();

      if (text === guideText) {
        el.remove();
      } else if (text === '전체 말씀풀이 이어듣기' && !el.matches(ALL_TABS_BUTTON_SELECTOR)) {
        el.remove();
      } else if (text === '주석풀이전체듣기' && !el.matches(ALL_TABS_BUTTON_SELECTOR)) {
        el.remove();
      }
    });
  }

  function refreshPublishedFlags() {
    if (!currentCommentaryItems.length) return;

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      currentCommentaryItems[i].published = isPublishedAudioId(currentCommentaryItems[i].audioId);
    }
  }

  function addCommentaryButtons() {
    var popup = getPopup();
    var content = getContent();

    if (!popup || !content) return;
    if (!isCommentaryTabsPopup(popup)) return;

    restoreMiniPlayerExpandButtonLabel();

    if (!getPopupScope().querySelector('.gomna-audio-commentary-button[data-audio-id]')) {
      resetCommentaryPlaybackState();
    }

    updateCommentaryHeaderCopy();
    getControlsFooter();
    ensureInlineControls();
    refreshPublishedFlags();

    for (var i = 0; i < currentCommentaryItems.length; i++) {
      insertButtonForItem(content, currentCommentaryItems[i]);
    }

    enhanceManualCueTargets(content);
    removeLegacySequenceControls(content);
    bindAllTabsAudio(content);
    bindCommentaryButtonReplayHandler();
    bindCommentaryTabQueueNavigation(content);
    updateCommentaryButtonLabels();
    syncCommentaryFooterControls(content);
    syncInlineControls(content);
  }

  function scheduleAddCommentaryButtons() {
    if (pendingTimer) return;

    pendingTimer = setTimeout(function() {
      pendingTimer = null;
      addCommentaryButtons();
    }, 50);
  }

  function stopCommentaryHeaderDrag(event) {
    var header;
    var target = event.target;

    if (!document.body.classList.contains(MODAL_OPEN_CLASS)) return;
    if (event.touches && event.touches.length >= 2) return;

    header = document.getElementById('popupDragHeader');
    if (!header || !target || !header.contains(target)) return;
    if (target.tagName === 'BUTTON' || target.closest('button')) return;

    event.stopPropagation();
    event.stopImmediatePropagation();

    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function handleCommentaryTouchStart(event) {
    var touch = event.touches && event.touches[0];

    if (!document.body.classList.contains(MODAL_OPEN_CLASS)) return;
    if (event.touches && event.touches.length >= 2) return;
    if (touch) touchStartY = touch.clientY;

    stopCommentaryHeaderDrag(event);
  }

  function handleCommentaryTouchMove(event) {
    var content;
    var touch;
    var deltaY;
    var atTop;
    var atBottom;

    if (!document.body.classList.contains(MODAL_OPEN_CLASS)) return;
    if (event.touches && event.touches.length >= 2) return;

    content = getContent();
    touch = event.touches && event.touches[0];

    if (content && content.contains(event.target) && touch) {
      deltaY = touch.clientY - touchStartY;
      touchStartY = touch.clientY;
      atTop = content.scrollTop <= 0;
      atBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 1;

      if (!((deltaY > 0 && atTop) || (deltaY < 0 && atBottom))) {
        return;
      }
    }

    event.stopImmediatePropagation();

    if (event.cancelable) {
      event.preventDefault();
    }
  }

  function bindCommentaryModalTouchGuards() {
    if (modalTouchListenersBound) return;

    modalTouchListenersBound = true;
    document.addEventListener('mousedown', stopCommentaryHeaderDrag, true);
    document.addEventListener('touchstart', stopCommentaryHeaderDrag, { capture: true, passive: false });
    document.addEventListener('touchstart', handleCommentaryTouchStart, { capture: true, passive: false });
    document.addEventListener('touchmove', handleCommentaryTouchMove, { capture: true, passive: false });
  }

  function startObserver() {
    var popup = getPopup();
    if (!popup || !window.MutationObserver || observer) return;

    observer = new MutationObserver(function() {
      syncCommentaryPopupLock();
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
    restoreMiniPlayerExpandButtonLabel();
    bindCommentaryModalTouchGuards();
    syncCommentaryPopupLock();
    addCommentaryButtons();
    startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.addEventListener('gomna:manifest_loaded', scheduleAddCommentaryButtons);

  window.addEventListener('audio:start', function(e) {
    var detail = e.detail || {};
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (getItemByAudioId(detail.audioId)) {
      clearCommentaryCompleted(detail.audioId);
      if (!currentCueKey || currentCueKey.indexOf(detail.audioId + '#') !== 0) {
        currentCueKey = null;
      }
      replayGuardAudioId = null;
    }

    if (
      state &&
      state.queueActive &&
      state.queueSource === currentSequenceSource &&
      typeof state.queueIndex === 'number'
    ) {
      if (lastSequenceQueueIndex < 0) {
        lastSequenceQueueIndex = state.queueIndex;
      }
    } else {
      lastSequenceQueueIndex = -1;
    }

    updateCommentaryButtonLabels();
  });

  window.addEventListener('audio:pause', updateCommentaryButtonLabels);
  window.addEventListener('audio:resume', updateCommentaryButtonLabels);

  window.addEventListener('audio:end', function(e) {
    var detail = e.detail || {};
    var engine = window.GOMNA_AUDIO_ENGINE;
    var state = engine && engine.getState ? engine.getState() : null;

    if (!getItemByAudioId(detail.audioId)) {
      updateCommentaryButtonLabels();
      return;
    }

    if (detail.audioId === replayGuardAudioId) {
      updateCommentaryButtonLabels();
      return;
    }

    if (currentCueKey && currentCueKey.indexOf(detail.audioId + '#') === 0) {
      currentCueKey = null;
    }

    if (state && state.queueActive && state.queueSource === currentSequenceSource) {
      updateCommentaryButtonLabels();
      return;
    }

    markCommentaryCompleted(detail.audioId);
    lastSequenceQueueIndex = -1;
    updateCommentaryButtonLabels();
  });

  window.addEventListener('audio:error', updateCommentaryButtonLabels);

  window.GOMNA_AUDIO_COMMENTARY_BUTTONS = {
    isCommentaryAudioId: isCommentaryAudioId,
    isCommentarySequenceSource: function(source) {
      return source === currentSequenceSource;
    },
    stopIfCommentaryAudio: function() {
      return CommentaryAudioController.stopIfCurrentCommentary();
    },
    getSequenceAudioIds: function() {
      return getPublishedSequenceAudioIds().slice();
    }
  };

  console.log('[GOMNA_AUDIO] gomna-audio-commentary-buttons.js loaded');
})();
