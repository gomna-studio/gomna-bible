/*!
 * gomna UI locale resolver + native i18n (ko / en / ja / zh)
 * Sync IIFE — no fetch, no import, no build step.
 *
 * Canonical state: localStorage.gomna_ui_language = selectedLocale
 *   native:  ko | en | ja | zh  → GomnaUII18n packs + Bible datasets
 *   external: hi | es | vi | … → selectedLocale stays that code; UI via Google
 * Display labels always come from selectedLocale (HI, ES, VI), never last-native.
 */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'gomna_ui_language';
  var SUPPORTED = ['ko', 'en', 'ja', 'zh'];
  var LOCALE_CONFIG = {
    ko: {
      uiLocale: 'ko',
      languageLabel: 'KO',
      bibleLanguage: 'ko',
      bibleVersion: 'KRV',
      bibleDataset: 'krv',
      bookNameLocale: 'ko',
      htmlLang: 'ko',
      fallbackLocale: 'ko'
    },
    en: {
      uiLocale: 'en',
      languageLabel: 'EN',
      bibleLanguage: 'en',
      bibleVersion: 'WEBP',
      bibleDataset: 'webp',
      bookNameLocale: 'en',
      htmlLang: 'en',
      fallbackLocale: 'ko'
    },
    ja: {
      uiLocale: 'ja',
      languageLabel: 'JA',
      bibleLanguage: 'ja',
      bibleVersion: 'Kougo',
      bibleDataset: 'kougo',
      bookNameLocale: 'ja',
      htmlLang: 'ja',
      fallbackLocale: 'ko'
    },
    zh: {
      uiLocale: 'zh',
      languageLabel: 'ZH',
      bibleLanguage: 'zh',
      bibleVersion: 'CUV',
      bibleDataset: 'cuv',
      bookNameLocale: 'zh',
      htmlLang: 'zh-CN',
      fallbackLocale: 'ko'
    }
  };
  var ATTRS = [
    ['data-i18n-key', 'text'],
    ['data-i18n-placeholder', 'placeholder'],
    ['data-i18n-aria-label', 'aria'],
    ['data-i18n-title', 'title']
  ];
  var OWNED_ATTR = 'data-gomna-native-translate-owned';
  var active = false;
  var currentLang = 'ko';
  var bootCleared = false;

  var STRINGS = {
    ko: {
      'brand.title': '은혜의말씀',
      'brand.subtitle': 'Words of Grace',
      'brand.logoAlt': '은혜의말씀',
      'home.greeting.morning': '— 좋은 아침입니다 —',
      'home.greeting.afternoon': '— 평안한 오후입니다 —',
      'home.greeting.evening': '— 고요한 저녁입니다 —',
      'home.continue.start': '처음부터 성경 읽기',
      'home.continue.sectionTitle': '이어서',
      'home.continue.readCta': '계속 읽기',
      'home.continue.listenCta': '계속 듣기',
      'home.continue.resume': '이어서 읽기',
      'home.continue.aria': '이어서 읽기',
      'home.todayWord.tag': '오늘의 말씀',
      'home.todayWord.backToday': '오늘로 돌아가기',
      'home.todayWord.otherDate': '다른 날짜 보기',
      'home.todayWord.open': '묵상하기',
      'home.todayWord.openNote': '오늘 말씀 기준으로 읽고 묵상하기',
      'home.quick.read': '읽기',
      'home.quick.readDesc': '책·장·절로',
      'home.quick.audio': '듣기',
      'home.quick.audioDesc': '듣고 묵상하기',
      'home.quick.topics': '주제별',
      'home.quick.topicsDesc': '말씀 찾아보기',
      'home.quick.archive': '보관함',
      'home.quick.archiveDesc': '저장한 말씀',
      'home.commentary.title': '말씀풀이 듣기',
      'home.commentary.badge': '오디오 확장버젼 준비중',
      'home.commentary.desc': '원어·역사·신학·교차참조 9개 표',
      'home.oldTestament.title': '구약 39권',
      'home.newTestament.title': '신약 27권',
      'home.testament.readByChapter': '장·절로 읽기 ›',
      'home.easyFind.title': '찾기',
      'home.easyFind.desc': '분류별로 찾기 ›',
      'search.placeholder.home': '말씀 찾기 (예: 사랑, 믿음, 요한복음 3장 16절)',
      'search.inputAria': '성경 검색어 입력',
      'search.submitAria': '검색 실행',
      'search.topicsAria': '검색창 안 주제별 검색',
      'search.chip.love': '#사랑',
      'search.chip.faith': '#믿음',
      'search.chip.hope': '#소망',
      'search.chip.peace': '#평안',
      'search.chip.comfort': '#위로',
      'search.chip.gratitude': '#감사',
      'search.chip.prayer': '#기도',
      'home.sheet.oldTestament': '구약',
      'home.sheet.newTestament': '신약',
      'home.sheet.easyFind': '찾기',
      'home.sheet.archive': '내 보관함',
      /* 홈 하단 메뉴 행 오른쪽의 작은 「열기」 알약 */
      'home.menu.openCta': '열기',
      'common.home': '← 홈으로',
      'common.close': '닫기',
      'settings.fontSize': '글자 크기 설정',
      'settings.openAria': '설정',
      'home.calendar.previousMonth': '이전 달',
      'home.calendar.nextMonth': '다음 달',
      'home.calendar.hint': '날짜를 누르면 그날의 말씀이 표시됩니다 (1~30일 순환)',
      'home.calendar.weekday.sun': '일',
      'home.calendar.weekday.mon': '월',
      'home.calendar.weekday.tue': '화',
      'home.calendar.weekday.wed': '수',
      'home.calendar.weekday.thu': '목',
      'home.calendar.weekday.fri': '금',
      'home.calendar.weekday.sat': '토',
      'home.bookmark.emptyTitle': '아직 저장한 말씀이 없습니다.',
      'home.bookmark.emptyDesc': '마음에 닿은 구절을 ★로 저장해보세요.',
      'home.cookie.aria': '분석 쿠키 동의 안내',
      'home.cookie.text': '서비스 개선을 위한 방문 통계 수집에 동의하시겠습니까? 거부해도 이용 제한은 없습니다.',
      'home.cookie.reject': '거부',
      'home.cookie.accept': '동의',
      'language.short': '언어',
      'language.openAria': '언어 선택',
      'home.relative.today': '오늘',
      'home.relative.yesterday': '어제',
      'home.relative.daysAgo': '{n}일 전',
      'home.continue.lastReadSuffix': '읽던 곳',
      'home.continue.readAt': '{day} {time}에 읽었습니다',
      'home.resume.readPlace': '읽던 곳',
      'home.resume.listenPlace': '듣던 곳',
      'home.resume.listenCta': '이어서 듣기',
      'home.resume.listenAria': '이어서 듣기',
      'home.resume.recent': '최근 말씀',
      'home.resume.recentEmpty': '아직 기록이 없습니다',
      'home.resume.readStart': '성경읽기 시작',
      'home.resume.listenStart': '말씀 듣기 시작',
      'home.tab.home': '홈',
      'home.tab.bible': '성경',
      'home.tab.media': '묵상',
      'home.tab.find': '찾기',
      'home.tab.login': '로그인',
      'home.tab.me': '나',
      'home.hello.guest': '잠시 머물러 보세요',
      'home.hello.named': '{name}님, 오늘도 평안하세요',
      'home.deck.aria': '말씀 카드',
      'home.card.todayWord': '오늘의 말씀',
      'home.card.todayMessage': '오늘의 메시지',
      'home.card.backAria': '뒤로가기',
      'home.card.readScripture': '본문 보기',
      'home.card.commentary': '말씀 풀이',
      'home.card.listen': '듣기',
      'home.notify.autoReceive': '매일 자동 수신하기',
      'home.notify.time': '알림 시간',
      'home.notify.timeLead': '언제 오늘의 말씀을 받아볼까요?',
      'home.notify.customTime': '직접 선택',
      'home.notify.recommended': '추천',
      'home.notify.frequency': '알림 횟수',
      'home.notify.once': '하루 1회',
      'home.notify.twice': '하루 2회',
      'home.notify.first': '첫 번째 알림',
      'home.notify.second': '두 번째 알림',
      'home.notify.saveFail': '설정을 저장하지 못했습니다. 다시 시도해 주세요.',
      'home.card.continueAria': '오늘의 메시지 이어가기',
      'home.card.share': '공유',
      'home.card.related': '함께 읽을 말씀 · {ref}',
      'home.life.posterKicker': '말씀과 함께하는 오늘의 삶',
      'home.life.posterTitle': '오늘의 묵상과 삶',
      'home.life.posterLead': '하나님의 말씀은\n오늘도 우리의 삶을 새롭게 합니다.',
      'home.life.posterFoot': '오늘도, 말씀 안에서\n더 깊은 하루를 살아갑니다.',
      'home.life.themesAria': '삶 주제',
      'home.life.meditation': '오늘의 묵상',
      'home.life.step': '오늘의 한 걸음',
      'home.life.prayer': '오늘의 기도',
      'home.life.readScripture': '말씀 보기',
      'home.story.posterKicker': '사람들의 이야기 속 하나님의 역사',
      'home.story.posterTitle': '성경 속 이야기와 인물',
      'home.story.posterLead': '평범한 사람들의 삶을 통해\n일하시는 하나님의 놀라운 이야기',
      'home.story.posterFoot': '그들의 이야기는\n지금도 우리에게 말씀합니다.',
      'home.story.peopleAria': '성경 속 인물',
      'home.story.kicker': '성경 속 이야기',
      'home.story.practice': '오늘의 적용',
      'home.theme.new': '새로운 삶',
      'home.theme.prayer': '기도하는 삶',
      'home.theme.blessed': '복된 삶',
      'home.theme.faith': '믿음의 삶',
      'home.theme.love': '사랑하는 삶',
      'home.theme.wisdom': '지혜로운 삶',
      'home.theme.hope': '소망의 삶',
      'home.person.abraham': '아브라함',
      'home.person.moses': '모세',
      'home.person.david': '다윗',
      'home.person.joseph': '요셉',
      'home.person.lot': '롯',
      'home.person.esther': '에스더',
      'home.person.paul': '바울',
      'home.return.today': '오늘의 말씀으로 돌아가기',
      'home.listen.today': '오늘의 말씀 듣기',
      'home.return.life.new': '새로운 삶으로 돌아가기',
      'home.return.life.prayer': '기도하는 삶으로 돌아가기',
      'home.return.life.blessed': '복된 삶으로 돌아가기',
      'home.return.life.faith': '믿음의 삶으로 돌아가기',
      'home.return.life.love': '사랑하는 삶으로 돌아가기',
      'home.return.life.wisdom': '지혜로운 삶으로 돌아가기',
      'home.return.life.hope': '소망의 삶으로 돌아가기',
      'home.listen.life.new': '새로운 삶 말씀 듣기',
      'home.listen.life.prayer': '기도하는 삶 말씀 듣기',
      'home.listen.life.blessed': '복된 삶 말씀 듣기',
      'home.listen.life.faith': '믿음의 삶 말씀 듣기',
      'home.listen.life.love': '사랑하는 삶 말씀 듣기',
      'home.listen.life.wisdom': '지혜로운 삶 말씀 듣기',
      'home.listen.life.hope': '소망의 삶 말씀 듣기',
      'home.return.person.abraham': '아브라함으로 돌아가기',
      'home.return.person.moses': '모세로 돌아가기',
      'home.return.person.david': '다윗으로 돌아가기',
      'home.return.person.joseph': '요셉으로 돌아가기',
      'home.return.person.lot': '롯으로 돌아가기',
      'home.return.person.esther': '에스더로 돌아가기',
      'home.return.person.paul': '바울로 돌아가기',
      'home.listen.person.abraham': '아브라함 말씀 듣기',
      'home.listen.person.moses': '모세 말씀 듣기',
      'home.listen.person.david': '다윗 말씀 듣기',
      'home.listen.person.joseph': '요셉 말씀 듣기',
      'home.listen.person.lot': '롯 말씀 듣기',
      'home.listen.person.esther': '에스더 말씀 듣기',
      'home.listen.person.paul': '바울 말씀 듣기',
      'reader.tab.archive': '보관함',
      'reader.chapter.prev': '이전 장',
      'reader.chapter.list': '장 목록',
      'reader.chapter.next': '다음 장',
      'reader.find': '구절찾기',
      'reader.listen': '듣기',
      'reader.listen.thisVerse': '이 절만',
      'reader.listen.fromHere': '여기부터',
      'reader.listen.chapter': '{book} {n}장 듣기',
      'reader.listen.continuous': '장 연속 듣기',
      'reader.listen.modeAria': '듣기 방식',
      'reader.listen.chooseMode': '현재 성경 듣기 방식 선택',
      'reader.listen.rangeOne': '1절 듣기',
      'reader.listen.rangeN': '{n}개 절 듣기',
      'reader.listen.selectedN': '선택한 {n}절 듣기',
      'reader.commentary': '말씀풀이',
      'reader.back': '돌아가기',
      'reader.backAria': '돌아가기',
      'reader.pause': '일시정지',
      'reader.resume': '이어듣기',
      'reader.save': '저장',
      'reader.saved': '저장됨',
      'reader.krvAria': '개역한글 성경 본문',
      'reader.webpAria': 'World English Bible 본문',
      'reader.kougoAria': '구어역 성경 본문',
      'reader.cuvAria': '和合本 성경 본문',
      'reader.loading': '성경 데이터 로딩중...',
      'reader.loadingLocale': '성경 본문을 불러오는 중...',
      'reader.locationAria': '현재 위치',
      'reader.backToText': '← 본문으로',
      'reader.backToTextAria': '본문으로 돌아가기',
      'reader.homeAria': '홈으로',
      'reader.more': '더보기',
      'reader.search': '검색',
      'reader.myArchive': '내 보관함',
      'reader.deselect': '선택 해제',
      'reader.testament.expanded': '현재 펼쳐짐',
      'reader.verseN': '{n}절',
      'reader.range.label': '절 범위',
      'reader.range.choose': '범위 선택 ▼',
      'reader.range.listen': '▶ 선택 범위 듣기',
      'reader.range.start': '시작 절',
      'reader.range.end': '끝 절',
      'reader.range.startHint': '시작 절을 선택하세요',
      'reader.range.endHint': '끝 절을 선택하세요',
      'reader.range.done': '선택 완료',
      'reader.range.preview': '{start}절 ~ {end}절 ({n}개 절)',
      'reader.range.previewFull': '{start}절 ~ {end}절 (전체)',
      'reader.picker.chapter': '장 선택',
      'reader.picker.verse': '절 선택',
      'reader.picker.close': '닫기',
      'reader.picker.closeBookAria': '책 선택 닫기',
      'reader.picker.closeChapterAria': '장 선택 닫기',
      'reader.picker.changeBook': '책 바꾸기',
      'reader.picker.bible': '성경',
      'reader.picker.old': '구약',
      'reader.picker.new': '신약',
      'reader.picker.booksAria': '성경 책 선택',
      'reader.picker.chapterOf': '{book} 장 선택',
      'reader.picker.verseOf': '{book} {chapter} 절 선택',
      'reader.picker.cat': '책 분류 선택',
      'reader.mainMenu': '주 메뉴',
      'reader.selectedCount': '{n}구절 선택',
      'reader.selectedCountAria': '선택한 {n}구절',
      'reader.versePickN': '{n}절 선택'
    },
    en: {
      'brand.title': 'Word of Grace',
      'brand.subtitle': 'Words of Grace',
      'brand.logoAlt': 'Word of Grace',
      'home.greeting.morning': '— Good morning —',
      'home.greeting.afternoon': '— Have a peaceful afternoon —',
      'home.greeting.evening': '— Have a quiet evening —',
      'home.continue.start': 'Start Reading the Bible',
      'home.continue.sectionTitle': 'Continue',
      'home.continue.readCta': 'Continue reading',
      'home.continue.listenCta': 'Continue listening',
      'home.continue.resume': 'Continue Reading',
      'home.continue.aria': 'Continue reading',
      'home.todayWord.tag': 'Verse of the Day',
      'home.todayWord.backToday': 'Back to Today',
      'home.todayWord.otherDate': 'View Another Date',
      'home.todayWord.open': 'Reflect',
      'home.todayWord.openNote': 'Read and reflect on today’s verse',
      'home.quick.read': 'Bible Reading',
      'home.quick.readDesc': 'By Book, Chapter, and Verse',
      'home.quick.audio': 'Audio',
      'home.quick.audioDesc': 'Listen and Reflect',
      'home.quick.topics': 'Topics',
      'home.quick.topicsDesc': 'Find Scripture',
      'home.quick.archive': 'Saved',
      'home.quick.archiveDesc': 'Saved Verses',
      'home.commentary.title': 'Listen to Bible Commentary',
      'home.commentary.badge': 'Expanded Audio Coming Soon',
      'home.commentary.desc': '9 Study Views: Original Languages, History, Theology, Cross-References, and More',
      'home.oldTestament.title': 'Old Testament · 39 Books',
      'home.newTestament.title': 'New Testament · 27 Books',
      'home.testament.readByChapter': 'Read by Chapter and Verse ›',
      'home.easyFind.title': 'Quick Scripture Finder',
      'home.easyFind.desc': 'Browse by Category ›',
      'search.placeholder.home': 'Search Scripture (e.g., love, faith, Romans 8)',
      'search.inputAria': 'Enter a Scripture search',
      'search.submitAria': 'Search',
      'search.topicsAria': 'Topic suggestions',
      'search.chip.love': '#Love',
      'search.chip.faith': '#Faith',
      'search.chip.hope': '#Hope',
      'search.chip.peace': '#Peace',
      'search.chip.comfort': '#Comfort',
      'search.chip.gratitude': '#Gratitude',
      'search.chip.prayer': '#Prayer',
      'home.sheet.oldTestament': 'Old Testament',
      'home.sheet.newTestament': 'New Testament',
      'home.sheet.easyFind': 'Quick Find',
      'home.sheet.archive': 'My Saved Verses',
      'home.menu.openCta': 'Open',
      'common.home': '← Home',
      'common.close': 'Close',
      'settings.fontSize': 'Font Size',
      'settings.openAria': 'Settings',
      'home.calendar.previousMonth': 'Previous month',
      'home.calendar.nextMonth': 'Next month',
      'home.calendar.hint': 'Tap a date to view that day’s verse (cycles through days 1–30)',
      'home.calendar.weekday.sun': 'Sun',
      'home.calendar.weekday.mon': 'Mon',
      'home.calendar.weekday.tue': 'Tue',
      'home.calendar.weekday.wed': 'Wed',
      'home.calendar.weekday.thu': 'Thu',
      'home.calendar.weekday.fri': 'Fri',
      'home.calendar.weekday.sat': 'Sat',
      'home.bookmark.emptyTitle': 'No saved verses yet.',
      'home.bookmark.emptyDesc': 'Save a verse that speaks to your heart with ★.',
      'home.cookie.aria': 'Analytics cookie consent',
      'home.cookie.text': 'Allow anonymous visit statistics to help improve the service? You can continue using the service if you decline.',
      'home.cookie.reject': 'Decline',
      'home.cookie.accept': 'Allow',
      'language.short': 'Language',
      'language.openAria': 'Choose language',
      'home.relative.today': 'today',
      'home.relative.yesterday': 'yesterday',
      'home.relative.daysAgo': '{n} days ago',
      'home.continue.lastReadSuffix': 'Last read',
      'home.continue.readAt': 'Read {day} at {time}',
      'home.resume.readPlace': 'Last read',
      'home.resume.listenPlace': 'Last listened',
      'home.resume.listenCta': 'Continue Listening',
      'home.resume.listenAria': 'Continue listening',
      'home.resume.recent': 'Recent',
      'home.resume.recentEmpty': 'No recent verses yet',
      'home.resume.readStart': 'Start Bible reading',
      'home.resume.listenStart': 'Start listening',
      'home.tab.home': 'Home',
      'home.tab.bible': 'Bible',
      'home.tab.media': 'Reflect',
      'home.tab.find': 'Find',
      'home.tab.login': 'Sign in',
      'home.tab.me': 'Me',
      'home.hello.guest': 'Stay a moment',
      'home.hello.named': '{name}, peace for today',
      'home.deck.aria': 'Scripture cards',
      'home.card.todayWord': 'Verse of the Day',
      'home.card.todayMessage': 'Today’s Message',
      'home.card.backAria': 'Go back',
      'home.card.readScripture': 'Read Scripture',
      'home.card.commentary': 'Commentary',
      'home.card.listen': 'Listen',
      'home.notify.autoReceive': 'Daily automatic delivery',
      'home.notify.time': 'Notification time',
      'home.notify.timeLead': 'When would you like to receive today’s Word?',
      'home.notify.customTime': 'Choose a time',
      'home.notify.recommended': 'Recommended',
      'home.notify.frequency': 'How often',
      'home.notify.once': 'Once a day',
      'home.notify.twice': 'Twice a day',
      'home.notify.first': 'First notification',
      'home.notify.second': 'Second notification',
      'home.notify.saveFail': 'Couldn’t save the setting. Please try again.',
      'home.card.continueAria': 'Continue today’s message',
      'home.card.share': 'Share',
      'home.card.related': 'Read together · {ref}',
      'home.life.posterKicker': 'Life with the Word today',
      'home.life.posterTitle': 'Today’s Meditation and Life',
      'home.life.posterLead': 'God’s Word\nmakes our life new again today.',
      'home.life.posterFoot': 'Today again, in the Word,\nwe live a deeper day.',
      'home.life.themesAria': 'Life themes',
      'home.life.meditation': 'Today’s Meditation',
      'home.life.step': 'One Step Today',
      'home.life.prayer': 'Today’s Prayer',
      'home.life.readScripture': 'Read Scripture',
      'home.story.posterKicker': 'God at work in people’s stories',
      'home.story.posterTitle': 'Stories and People in the Bible',
      'home.story.posterLead': 'Through ordinary lives,\nthe wonder of God at work',
      'home.story.posterFoot': 'Their stories\nstill speak to us.',
      'home.story.peopleAria': 'People in the Bible',
      'home.story.kicker': 'A Bible Story',
      'home.story.practice': 'Today’s Practice',
      'home.theme.new': 'New Life',
      'home.theme.prayer': 'Prayerful Life',
      'home.theme.blessed': 'Blessed Life',
      'home.theme.faith': 'Faithful Life',
      'home.theme.love': 'Loving Life',
      'home.theme.wisdom': 'Wise Life',
      'home.theme.hope': 'Hopeful Life',
      'home.person.abraham': 'Abraham',
      'home.person.moses': 'Moses',
      'home.person.david': 'David',
      'home.person.joseph': 'Joseph',
      'home.person.lot': 'Lot',
      'home.person.esther': 'Esther',
      'home.person.paul': 'Paul',
      'home.return.today': 'Back to Verse of the Day',
      'home.listen.today': 'Listen to Verse of the Day',
      'home.return.life.new': 'Back to New Life',
      'home.return.life.prayer': 'Back to Prayerful Life',
      'home.return.life.blessed': 'Back to Blessed Life',
      'home.return.life.faith': 'Back to Faithful Life',
      'home.return.life.love': 'Back to Loving Life',
      'home.return.life.wisdom': 'Back to Wise Life',
      'home.return.life.hope': 'Back to Hopeful Life',
      'home.listen.life.new': 'Listen to New Life',
      'home.listen.life.prayer': 'Listen to Prayerful Life',
      'home.listen.life.blessed': 'Listen to Blessed Life',
      'home.listen.life.faith': 'Listen to Faithful Life',
      'home.listen.life.love': 'Listen to Loving Life',
      'home.listen.life.wisdom': 'Listen to Wise Life',
      'home.listen.life.hope': 'Listen to Hopeful Life',
      'home.return.person.abraham': 'Back to Abraham',
      'home.return.person.moses': 'Back to Moses',
      'home.return.person.david': 'Back to David',
      'home.return.person.joseph': 'Back to Joseph',
      'home.return.person.lot': 'Back to Lot',
      'home.return.person.esther': 'Back to Esther',
      'home.return.person.paul': 'Back to Paul',
      'home.listen.person.abraham': 'Listen to Abraham',
      'home.listen.person.moses': 'Listen to Moses',
      'home.listen.person.david': 'Listen to David',
      'home.listen.person.joseph': 'Listen to Joseph',
      'home.listen.person.lot': 'Listen to Lot',
      'home.listen.person.esther': 'Listen to Esther',
      'home.listen.person.paul': 'Listen to Paul',
      'reader.tab.archive': 'Saved',
      'reader.chapter.prev': 'Previous',
      'reader.chapter.list': 'Chapters',
      'reader.chapter.next': 'Next',
      'reader.find': 'Find Passage',
      'reader.listen': 'Listen',
      'reader.listen.thisVerse': 'This verse',
      'reader.listen.fromHere': 'From here',
      'reader.listen.chapter': 'Listen to {book} {n}',
      'reader.listen.continuous': 'Listen continuously',
      'reader.listen.modeAria': 'How to listen',
      'reader.listen.chooseMode': 'Choose how to listen',
      'reader.listen.rangeOne': 'Listen to 1 verse',
      'reader.listen.rangeN': 'Listen to {n} verses',
      'reader.listen.selectedN': 'Listen to {n} selected verses',
      'reader.commentary': 'Commentary',
      'reader.back': 'Back',
      'reader.backAria': 'Back',
      'reader.pause': 'Pause',
      'reader.resume': 'Resume',
      'reader.save': 'Save',
      'reader.saved': 'Saved',
      'reader.krvAria': 'Korean Revised Version',
      'reader.webpAria': 'World English Bible text',
      'reader.kougoAria': 'Japanese Kougo-yaku text',
      'reader.cuvAria': 'Chinese Union Version text',
      'reader.loading': 'Loading Bible data...',
      'reader.loadingLocale': 'Loading Scripture...',
      'reader.locationAria': 'Current location',
      'reader.backToText': '← Back to text',
      'reader.backToTextAria': 'Back to the text',
      'reader.homeAria': 'Home',
      'reader.more': 'More',
      'reader.search': 'Search',
      'reader.myArchive': 'Saved',
      'reader.deselect': 'Clear selection',
      'reader.testament.expanded': 'Open now',
      'reader.verseN': 'Verse {n}',
      'reader.range.label': 'Verse range',
      'reader.range.choose': 'Choose range ▼',
      'reader.range.listen': '▶ Listen to selection',
      'reader.range.start': 'Start verse',
      'reader.range.end': 'End verse',
      'reader.range.startHint': 'Select a start verse',
      'reader.range.endHint': 'Select an end verse',
      'reader.range.done': 'Ready',
      'reader.range.preview': 'Verses {start}–{end} ({n})',
      'reader.range.previewFull': 'Verses {start}–{end} (whole chapter)',
      'reader.picker.chapter': 'Choose chapter',
      'reader.picker.verse': 'Choose verse',
      'reader.picker.close': 'Close',
      'reader.picker.closeBookAria': 'Close book picker',
      'reader.picker.closeChapterAria': 'Close chapter picker',
      'reader.picker.changeBook': 'Change book',
      'reader.picker.bible': 'Bible',
      'reader.picker.old': 'Old Testament',
      'reader.picker.new': 'New Testament',
      'reader.picker.booksAria': 'Choose a Bible book',
      'reader.picker.chapterOf': 'Choose a chapter in {book}',
      'reader.picker.verseOf': 'Choose a verse in {book} {chapter}',
      'reader.picker.cat': 'Choose a book category',
      'reader.mainMenu': 'Main menu',
      'reader.selectedCount': '{n} selected',
      'reader.selectedCountAria': '{n} selected verses',
      'reader.versePickN': 'Verse {n}'
    },
    ja: {
      'brand.title': '恵みのみことば',
      'brand.subtitle': 'Words of Grace',
      'brand.logoAlt': '恵みのみことば',
      'home.greeting.morning': '— おはようございます —',
      'home.greeting.afternoon': '— 穏やかな午後をお過ごしください —',
      'home.greeting.evening': '— 静かな夜をお過ごしください —',
      'home.continue.start': '聖書を最初から読む',
      'home.continue.sectionTitle': '続きから',
      'home.continue.readCta': '続きを読む',
      'home.continue.listenCta': '続きを聴く',
      'home.continue.resume': '続きを読む',
      'home.continue.aria': '続きを読む',
      'home.todayWord.tag': '今日の聖句',
      'home.todayWord.backToday': '今日に戻る',
      'home.todayWord.otherDate': '別の日を見る',
      'home.todayWord.open': '黙想する',
      'home.todayWord.openNote': '今日の聖句を読み、黙想します',
      'home.quick.read': '聖書を読む',
      'home.quick.readDesc': '書・章・節から',
      'home.quick.audio': 'オーディオ',
      'home.quick.audioDesc': '聴いて黙想する',
      'home.quick.topics': 'テーマ別',
      'home.quick.topicsDesc': '聖句を探す',
      'home.quick.archive': '保存済み',
      'home.quick.archiveDesc': '保存した聖句',
      'home.commentary.title': '聖書解説を聴く',
      'home.commentary.badge': '拡張オーディオ版 準備中',
      'home.commentary.desc': '原語・歴史・神学・引照など9つの学習項目',
      'home.oldTestament.title': '旧約聖書 39巻',
      'home.newTestament.title': '新約聖書 27巻',
      'home.testament.readByChapter': '章・節から読む ›',
      'home.easyFind.title': '聖句をすぐ探す',
      'home.easyFind.desc': '分類から探す ›',
      'search.placeholder.home': '聖書を検索（例：愛、信仰、ローマ8章）',
      'search.inputAria': '聖書の検索語を入力',
      'search.submitAria': '検索',
      'search.topicsAria': 'テーマ別の検索候補',
      'search.chip.love': '#愛',
      'search.chip.faith': '#信仰',
      'search.chip.hope': '#希望',
      'search.chip.peace': '#平安',
      'search.chip.comfort': '#慰め',
      'search.chip.gratitude': '#感謝',
      'search.chip.prayer': '#祈り',
      'home.sheet.oldTestament': '旧約聖書',
      'home.sheet.newTestament': '新約聖書',
      'home.sheet.easyFind': 'かんたん検索',
      'home.sheet.archive': '保存した聖句',
      'home.menu.openCta': '開く',
      'common.home': '← ホームへ',
      'common.close': '閉じる',
      'settings.fontSize': '文字サイズ設定',
      'settings.openAria': '設定',
      'home.calendar.previousMonth': '前の月',
      'home.calendar.nextMonth': '次の月',
      'home.calendar.hint': '日付をタップすると、その日の聖句が表示されます（1～30日を循環）',
      'home.calendar.weekday.sun': '日',
      'home.calendar.weekday.mon': '月',
      'home.calendar.weekday.tue': '火',
      'home.calendar.weekday.wed': '水',
      'home.calendar.weekday.thu': '木',
      'home.calendar.weekday.fri': '金',
      'home.calendar.weekday.sat': '土',
      'home.bookmark.emptyTitle': '保存した聖句はまだありません。',
      'home.bookmark.emptyDesc': '心に響いた聖句を★で保存してみましょう。',
      'home.cookie.aria': 'アクセス解析Cookieの同意',
      'home.cookie.text': 'サービス改善のため、匿名の利用統計を収集してもよろしいですか。拒否しても利用制限はありません。',
      'home.cookie.reject': '拒否',
      'home.cookie.accept': '同意する',
      'language.short': '言語',
      'language.openAria': '言語を選択',
      'home.relative.today': '今日',
      'home.relative.yesterday': '昨日',
      'home.relative.daysAgo': '{n}日前',
      'home.continue.lastReadSuffix': 'に読んだ箇所',
      'home.continue.readAt': '{day} {time}に読みました',
      'home.resume.readPlace': '読んだ箇所',
      'home.resume.listenPlace': '聴いた箇所',
      'home.resume.listenCta': '続きを聴く',
      'home.resume.listenAria': '続きを聴く',
      'home.resume.recent': '最近の聖句',
      'home.resume.recentEmpty': 'まだ記録がありません',
      'home.resume.readStart': '聖書を読み始める',
      'home.resume.listenStart': 'みことばを聴き始める',
      'home.tab.home': 'ホーム',
      'home.tab.bible': '聖書',
      'home.tab.media': '黙想',
      'home.tab.find': '検索',
      'home.tab.login': 'ログイン',
      'home.tab.me': 'マイ',
      'home.hello.guest': 'しばらくとどまってみてください',
      'home.hello.named': '{name}さん、今日も平安でありますように',
      'home.deck.aria': 'みことばカード',
      'home.card.todayWord': '今日の聖句',
      'home.card.todayMessage': '今日のメッセージ',
      'home.card.backAria': '戻る',
      'home.card.readScripture': '本文を見る',
      'home.card.commentary': '聖書解説',
      'home.card.listen': '聴く',
      'home.notify.autoReceive': '毎日自動で受け取る',
      'home.notify.time': '通知時刻',
      'home.notify.timeLead': '今日のみことばは、いつ受け取りますか？',
      'home.notify.customTime': '時刻を指定',
      'home.notify.recommended': 'おすすめ',
      'home.notify.frequency': '通知回数',
      'home.notify.once': '1日1回',
      'home.notify.twice': '1日2回',
      'home.notify.first': '1回目の通知',
      'home.notify.second': '2回目の通知',
      'home.notify.saveFail': '設定を保存できませんでした。もう一度お試しください。',
      'home.card.continueAria': '今日のメッセージを続ける',
      'home.card.share': '共有',
      'home.card.related': 'ともに読む聖句 · {ref}',
      'home.life.posterKicker': 'みことばとともに歩む今日の人生',
      'home.life.posterTitle': '今日の黙想と人生',
      'home.life.posterLead': '神のみことばは\n今日も私たちの人生を新しくします。',
      'home.life.posterFoot': '今日も、みことばの中で\nより深い一日を生きます。',
      'home.life.themesAria': '人生のテーマ',
      'home.life.meditation': '今日の黙想',
      'home.life.step': '今日の一歩',
      'home.life.prayer': '今日の祈り',
      'home.life.readScripture': '本文を見る',
      'home.story.posterKicker': '人々の物語の中で働く神',
      'home.story.posterTitle': '聖書の物語と人物',
      'home.story.posterLead': '平凡な人々の人生を通して\n働かれる神の驚くべき物語',
      'home.story.posterFoot': '彼らの物語は\n今も私たちに語りかけます。',
      'home.story.peopleAria': '聖書の人物',
      'home.story.kicker': '聖書の物語',
      'home.story.practice': '今日の適用',
      'home.theme.new': '新しい人生',
      'home.theme.prayer': '祈る人生',
      'home.theme.blessed': '祝福された人生',
      'home.theme.faith': '信仰の人生',
      'home.theme.love': '愛する人生',
      'home.theme.wisdom': '知恵ある人生',
      'home.theme.hope': '希望の人生',
      'home.person.abraham': 'アブラハム',
      'home.person.moses': 'モーセ',
      'home.person.david': 'ダビデ',
      'home.person.joseph': 'ヨセフ',
      'home.person.lot': 'ロト',
      'home.person.esther': 'エステル',
      'home.person.paul': 'パウロ',
      'home.return.today': '今日の聖句に戻る',
      'home.listen.today': '今日の聖句を聴く',
      'home.return.life.new': '新しい人生に戻る',
      'home.return.life.prayer': '祈る人生に戻る',
      'home.return.life.blessed': '祝福された人生に戻る',
      'home.return.life.faith': '信仰の人生に戻る',
      'home.return.life.love': '愛する人生に戻る',
      'home.return.life.wisdom': '知恵ある人生に戻る',
      'home.return.life.hope': '希望の人生に戻る',
      'home.listen.life.new': '新しい人生のみことばを聴く',
      'home.listen.life.prayer': '祈る人生のみことばを聴く',
      'home.listen.life.blessed': '祝福された人生のみことばを聴く',
      'home.listen.life.faith': '信仰の人生のみことばを聴く',
      'home.listen.life.love': '愛する人生のみことばを聴く',
      'home.listen.life.wisdom': '知恵ある人生のみことばを聴く',
      'home.listen.life.hope': '希望の人生のみことばを聴く',
      'home.return.person.abraham': 'アブラハムに戻る',
      'home.return.person.moses': 'モーセに戻る',
      'home.return.person.david': 'ダビデに戻る',
      'home.return.person.joseph': 'ヨセフに戻る',
      'home.return.person.lot': 'ロトに戻る',
      'home.return.person.esther': 'エステルに戻る',
      'home.return.person.paul': 'パウロに戻る',
      'home.listen.person.abraham': 'アブラハムのみことばを聴く',
      'home.listen.person.moses': 'モーセのみことばを聴く',
      'home.listen.person.david': 'ダビデのみことばを聴く',
      'home.listen.person.joseph': 'ヨセフのみことばを聴く',
      'home.listen.person.lot': 'ロトのみことばを聴く',
      'home.listen.person.esther': 'エステルのみことばを聴く',
      'home.listen.person.paul': 'パウロのみことばを聴く',
      'reader.tab.archive': '保存',
      'reader.chapter.prev': '前の章',
      'reader.chapter.list': '章一覧',
      'reader.chapter.next': '次の章',
      'reader.find': '本文を探す',
      'reader.listen': '聴く',
      'reader.listen.thisVerse': 'この節だけ',
      'reader.listen.fromHere': 'ここから',
      'reader.listen.chapter': '{book} {n}章を聴く',
      'reader.listen.continuous': '章を連続で聴く',
      'reader.listen.modeAria': '聴き方',
      'reader.listen.chooseMode': '聴き方を選ぶ',
      'reader.listen.rangeOne': '1節を聴く',
      'reader.listen.rangeN': '{n}節を聴く',
      'reader.listen.selectedN': '選んだ{n}節を聴く',
      'reader.commentary': '聖書解説',
      'reader.back': '戻る',
      'reader.backAria': '戻る',
      'reader.pause': '一時停止',
      'reader.resume': '続きを聴く',
      'reader.save': '保存',
      'reader.saved': '保存済み',
      'reader.krvAria': '改訂ハングル聖書本文',
      'reader.webpAria': 'World English Bible本文',
      'reader.kougoAria': '口語訳聖書本文',
      'reader.cuvAria': '和合本聖書本文',
      'reader.loading': '聖書データを読み込み中...',
      'reader.loadingLocale': '聖書本文を読み込み中...',
      'reader.locationAria': '現在の位置',
      'reader.backToText': '← 本文へ',
      'reader.backToTextAria': '本文に戻る',
      'reader.homeAria': 'ホームへ',
      'reader.more': 'その他',
      'reader.search': '検索',
      'reader.myArchive': '保存',
      'reader.deselect': '選択を解除',
      'reader.testament.expanded': '表示中',
      'reader.verseN': '{n}節',
      'reader.range.label': '節の範囲',
      'reader.range.choose': '範囲を選ぶ ▼',
      'reader.range.listen': '▶ 選んだ範囲を聴く',
      'reader.range.start': '開始の節',
      'reader.range.end': '終わりの節',
      'reader.range.startHint': '開始の節を選んでください',
      'reader.range.endHint': '終わりの節を選んでください',
      'reader.range.done': '選択完了',
      'reader.range.preview': '{start}節〜{end}節（{n}節）',
      'reader.range.previewFull': '{start}節〜{end}節（章全体）',
      'reader.picker.chapter': '章を選ぶ',
      'reader.picker.verse': '節を選ぶ',
      'reader.picker.close': '閉じる',
      'reader.picker.closeBookAria': '書名選択を閉じる',
      'reader.picker.closeChapterAria': '章選択を閉じる',
      'reader.picker.changeBook': '書名を変える',
      'reader.picker.bible': '聖書',
      'reader.picker.old': '旧約',
      'reader.picker.new': '新約',
      'reader.picker.booksAria': '聖書の書を選ぶ',
      'reader.picker.chapterOf': '{book}の章を選ぶ',
      'reader.picker.verseOf': '{book} {chapter}の節を選ぶ',
      'reader.picker.cat': '書の分類を選ぶ',
      'reader.mainMenu': 'メインメニュー',
      'reader.selectedCount': '{n}箇所選択',
      'reader.selectedCountAria': '選んだ{n}節',
      'reader.versePickN': '{n}節を選ぶ'
    },
    zh: {
      'brand.title': '恩典的话语',
      'brand.subtitle': 'Words of Grace',
      'brand.logoAlt': '恩典的话语',
      'home.greeting.morning': '— 早安 —',
      'home.greeting.afternoon': '— 愿你有平安的下午 —',
      'home.greeting.evening': '— 愿你有安静的夜晚 —',
      'home.continue.start': '从圣经开头读起',
      'home.continue.sectionTitle': '继续',
      'home.continue.readCta': '继续阅读',
      'home.continue.listenCta': '继续收听',
      'home.continue.resume': '继续阅读',
      'home.continue.aria': '继续阅读',
      'home.todayWord.tag': '今日经文',
      'home.todayWord.backToday': '回到今天',
      'home.todayWord.otherDate': '查看其他日期',
      'home.todayWord.open': '默想',
      'home.todayWord.openNote': '按今日经文阅读并默想',
      'home.quick.read': '阅读',
      'home.quick.readDesc': '按书、章、节',
      'home.quick.audio': '收听',
      'home.quick.audioDesc': '听道并默想',
      'home.quick.topics': '主题',
      'home.quick.topicsDesc': '查找经文',
      'home.quick.archive': '收藏',
      'home.quick.archiveDesc': '已保存的经文',
      'home.commentary.title': '收听经文讲解',
      'home.commentary.badge': '音频扩展版准备中',
      'home.commentary.desc': '原文、历史、神学、交叉引用共9项',
      'home.oldTestament.title': '旧约 39卷',
      'home.newTestament.title': '新约 27卷',
      'home.testament.readByChapter': '按章、节阅读 ›',
      'home.easyFind.title': '查找',
      'home.easyFind.desc': '按分类查找 ›',
      'search.placeholder.home': '查找经文（例如：爱、信心、约翰福音 3章 16节）',
      'search.inputAria': '输入圣经搜索词',
      'search.submitAria': '执行搜索',
      'search.topicsAria': '搜索框内的主题搜索',
      'search.chip.love': '#爱',
      'search.chip.faith': '#信心',
      'search.chip.hope': '#盼望',
      'search.chip.peace': '#平安',
      'search.chip.comfort': '#安慰',
      'search.chip.gratitude': '#感恩',
      'search.chip.prayer': '#祷告',
      'home.sheet.oldTestament': '旧约',
      'home.sheet.newTestament': '新约',
      'home.sheet.easyFind': '查找',
      'home.sheet.archive': '我的收藏',
      'home.menu.openCta': '打开',
      'common.home': '← 返回首页',
      'common.close': '关闭',
      'settings.fontSize': '字体大小设置',
      'settings.openAria': '设置',
      'home.calendar.previousMonth': '上个月',
      'home.calendar.nextMonth': '下个月',
      'home.calendar.hint': '点按日期即可查看当天的经文（1～30日循环）',
      'home.calendar.weekday.sun': '日',
      'home.calendar.weekday.mon': '一',
      'home.calendar.weekday.tue': '二',
      'home.calendar.weekday.wed': '三',
      'home.calendar.weekday.thu': '四',
      'home.calendar.weekday.fri': '五',
      'home.calendar.weekday.sat': '六',
      'home.bookmark.emptyTitle': '还没有保存的经文。',
      'home.bookmark.emptyDesc': '把触动你的经文用★保存下来。',
      'home.cookie.aria': '分析 Cookie 同意说明',
      'home.cookie.text': '为了改进服务，是否同意收集访问统计？拒绝也不会限制使用。',
      'home.cookie.reject': '拒绝',
      'home.cookie.accept': '同意',
      'language.short': '语言',
      'language.openAria': '选择语言',
      'home.relative.today': '今天',
      'home.relative.yesterday': '昨天',
      'home.relative.daysAgo': '{n}天前',
      'home.continue.lastReadSuffix': '读过的地方',
      'home.continue.readAt': '{day} {time}阅读过',
      'home.resume.readPlace': '读过的地方',
      'home.resume.listenPlace': '听过的地方',
      'home.resume.listenCta': '继续收听',
      'home.resume.listenAria': '继续收听',
      'home.resume.recent': '最近的经文',
      'home.resume.recentEmpty': '还没有记录',
      'home.resume.readStart': '开始读经',
      'home.resume.listenStart': '开始听经',
      'home.tab.home': '首页',
      'home.tab.bible': '圣经',
      'home.tab.media': '默想',
      'home.tab.find': '查找',
      'home.tab.login': '登录',
      'home.tab.me': '我的',
      'home.hello.guest': '请稍作停留',
      'home.hello.named': '{name}，愿你今天也平安',
      'home.deck.aria': '经文卡片',
      'home.card.todayWord': '今日经文',
      'home.card.todayMessage': '今日信息',
      'home.card.backAria': '返回',
      'home.card.readScripture': '查看经文',
      'home.card.commentary': '经文讲解',
      'home.card.listen': '收听',
      'home.notify.autoReceive': '每日自动接收',
      'home.notify.time': '通知时间',
      'home.notify.timeLead': '希望何时收到今日的话语？',
      'home.notify.customTime': '自行选择',
      'home.notify.recommended': '推荐',
      'home.notify.frequency': '通知次数',
      'home.notify.once': '每天 1 次',
      'home.notify.twice': '每天 2 次',
      'home.notify.first': '第一次通知',
      'home.notify.second': '第二次通知',
      'home.notify.saveFail': '设置未能保存，请再试一次。',
      'home.card.continueAria': '继续今日信息',
      'home.card.share': '分享',
      'home.card.related': '一起读的经文 · {ref}',
      'home.life.posterKicker': '与话语同行的今日生活',
      'home.life.posterTitle': '今日默想与生活',
      'home.life.posterLead': '神的话语\n今天也使我们的生命更新。',
      'home.life.posterFoot': '今天也在话语里\n活出更深入的一天。',
      'home.life.themesAria': '生活主题',
      'home.life.meditation': '今日默想',
      'home.life.step': '今日一步',
      'home.life.prayer': '今日祷告',
      'home.life.readScripture': '查看经文',
      'home.story.posterKicker': '在人的故事中做工的神',
      'home.story.posterTitle': '圣经中的故事与人物',
      'home.story.posterLead': '借着平凡人的生命\n神所行的奇妙故事',
      'home.story.posterFoot': '他们的故事\n如今仍对我们说话。',
      'home.story.peopleAria': '圣经中的人物',
      'home.story.kicker': '圣经中的故事',
      'home.story.practice': '今日应用',
      'home.theme.new': '新生命',
      'home.theme.prayer': '祷告的生命',
      'home.theme.blessed': '蒙福的生命',
      'home.theme.faith': '信心的生命',
      'home.theme.love': '爱的生命',
      'home.theme.wisdom': '智慧的生命',
      'home.theme.hope': '盼望的生命',
      'home.person.abraham': '亚伯拉罕',
      'home.person.moses': '摩西',
      'home.person.david': '大卫',
      'home.person.joseph': '约瑟',
      'home.person.lot': '罗得',
      'home.person.esther': '以斯帖',
      'home.person.paul': '保罗',
      'home.return.today': '返回今日经文',
      'home.listen.today': '收听今日经文',
      'home.return.life.new': '返回新生命',
      'home.return.life.prayer': '返回祷告的生命',
      'home.return.life.blessed': '返回蒙福的生命',
      'home.return.life.faith': '返回信心的生命',
      'home.return.life.love': '返回爱的生命',
      'home.return.life.wisdom': '返回智慧的生命',
      'home.return.life.hope': '返回盼望的生命',
      'home.listen.life.new': '收听新生命',
      'home.listen.life.prayer': '收听祷告的生命',
      'home.listen.life.blessed': '收听蒙福的生命',
      'home.listen.life.faith': '收听信心的生命',
      'home.listen.life.love': '收听爱的生命',
      'home.listen.life.wisdom': '收听智慧的生命',
      'home.listen.life.hope': '收听盼望的生命',
      'home.return.person.abraham': '返回亚伯拉罕',
      'home.return.person.moses': '返回摩西',
      'home.return.person.david': '返回大卫',
      'home.return.person.joseph': '返回约瑟',
      'home.return.person.lot': '返回罗得',
      'home.return.person.esther': '返回以斯帖',
      'home.return.person.paul': '返回保罗',
      'home.listen.person.abraham': '收听亚伯拉罕',
      'home.listen.person.moses': '收听摩西',
      'home.listen.person.david': '收听大卫',
      'home.listen.person.joseph': '收听约瑟',
      'home.listen.person.lot': '收听罗得',
      'home.listen.person.esther': '收听以斯帖',
      'home.listen.person.paul': '收听保罗',
      'reader.tab.archive': '收藏',
      'reader.chapter.prev': '上一章',
      'reader.chapter.list': '章节列表',
      'reader.chapter.next': '下一章',
      'reader.find': '查找经文',
      'reader.listen': '收听',
      'reader.listen.thisVerse': '只听这一节',
      'reader.listen.fromHere': '从这里开始',
      'reader.listen.chapter': '收听{book}第{n}章',
      'reader.listen.continuous': '连续听章',
      'reader.listen.modeAria': '收听方式',
      'reader.listen.chooseMode': '选择当前圣经收听方式',
      'reader.listen.rangeOne': '听1节',
      'reader.listen.rangeN': '听{n}节',
      'reader.listen.selectedN': '收听所选{n}节',
      'reader.commentary': '经文讲解',
      'reader.back': '返回',
      'reader.backAria': '返回',
      'reader.pause': '暂停',
      'reader.resume': '继续收听',
      'reader.save': '保存',
      'reader.saved': '已保存',
      'reader.krvAria': '韩文改订本经文',
      'reader.webpAria': 'World English Bible 经文',
      'reader.kougoAria': '日语口语译经文',
      'reader.cuvAria': '和合本圣经经文',
      'reader.loading': '正在加载圣经数据...',
      'reader.loadingLocale': '正在加载圣经经文...',
      'reader.locationAria': '当前位置',
      'reader.backToText': '← 返回经文',
      'reader.backToTextAria': '返回经文',
      'reader.homeAria': '返回首页',
      'reader.more': '更多',
      'reader.search': '搜索',
      'reader.myArchive': '我的收藏',
      'reader.deselect': '取消选择',
      'reader.testament.expanded': '当前已展开',
      'reader.verseN': '第{n}节',
      'reader.range.label': '经节范围',
      'reader.range.choose': '选择范围 ▼',
      'reader.range.listen': '▶ 收听所选范围',
      'reader.range.start': '起始节',
      'reader.range.end': '结束节',
      'reader.range.startHint': '请选择起始节',
      'reader.range.endHint': '请选择结束节',
      'reader.range.done': '选择完成',
      'reader.range.preview': '第{start}节 ~ 第{end}节（{n}节）',
      'reader.range.previewFull': '第{start}节 ~ 第{end}节（全章）',
      'reader.picker.chapter': '选择章',
      'reader.picker.verse': '选择节',
      'reader.picker.close': '关闭',
      'reader.picker.closeBookAria': '关闭书卷选择',
      'reader.picker.closeChapterAria': '关闭章选择',
      'reader.picker.changeBook': '更换书卷',
      'reader.picker.bible': '圣经',
      'reader.picker.old': '旧约',
      'reader.picker.new': '新约',
      'reader.picker.booksAria': '选择圣经书卷',
      'reader.picker.chapterOf': '选择{book}的章',
      'reader.picker.verseOf': '选择{book} {chapter}的节',
      'reader.picker.cat': '选择书卷分类',
      'reader.mainMenu': '主菜单',
      'reader.selectedCount': '已选{n}节',
      'reader.selectedCountAria': '已选择{n}节',
      'reader.versePickN': '选择第{n}节'
    }
  };

  (function checkI18nKeyParity() {
    try {
      var koKeys = Object.keys(STRINGS.ko || {});
      var langs = ['en', 'ja', 'zh'];
      for (var i = 0; i < langs.length; i++) {
        var lang = langs[i];
        var pack = STRINGS[lang] || {};
        var missing = [];
        for (var k = 0; k < koKeys.length; k++) {
          if (!pack[koKeys[k]]) missing.push(koKeys[k]);
        }
        if (missing.length) {
          console.warn('[GomnaUII18n] missing ' + lang + ' keys (' + missing.length + ')', missing);
        }
      }
    } catch (eParity) { /* ignore */ }
  })();

  function isSupported(lang) {
    return SUPPORTED.indexOf(lang) !== -1;
  }

  function isNativeLocale(lang) {
    var n = canonicalizeNativeLocale(lang);
    return isSupported(n);
  }

  // Native-only: ko / en / ja / zh. zh-CN / zh-TW → zh. Unknown → null.
  function canonicalizeNativeLocale(raw) {
    if (raw == null) return null;
    var c = String(raw).toLowerCase().replace(/_/g, '-').trim();
    if (!c || c === 'auto' || c === 'null' || c === 'undefined') return null;
    if (c === 'zh' || c.indexOf('zh-') === 0 || c === 'cn') return 'zh';
    var primary = c.split('-')[0];
    if (primary === 'jp') primary = 'ja';
    if (primary === 'kr') primary = 'ko';
    if (SUPPORTED.indexOf(primary) !== -1) return primary;
    return null;
  }

  function canonicalizeLocale(raw) {
    var native = canonicalizeNativeLocale(raw);
    if (native) return native;
    if (raw == null) return null;
    var c = String(raw).toLowerCase().replace(/_/g, '-').trim();
    if (!c || c === 'auto' || c === 'null' || c === 'undefined') return null;
    var primary = c.split('-')[0];
    if (GT_TARGET_SET[primary]) return primary;
    if (GT_TARGET_SET[c]) return c;
    return null;
  }

  function isExternalLocale(raw) {
    var code = canonicalizeLocale(raw);
    return !!(code && !isSupported(code));
  }

  function googleTargetFor(raw) {
    var code = canonicalizeLocale(raw);
    if (!code || isSupported(code)) return '';
    return code;
  }

  function getTranslationMode(raw) {
    var code = canonicalizeLocale(raw);
    if (!code) return 'unsupported';
    if (isSupported(code)) return 'native';
    return 'google';
  }

  function languageLabelFor(code) {
    if (code && LOCALE_CONFIG[code] && LOCALE_CONFIG[code].languageLabel) {
      return LOCALE_CONFIG[code].languageLabel;
    }
    return String(code || '').split('-')[0].toUpperCase();
  }

  function cloneNativeConfig(code) {
    var src = LOCALE_CONFIG[code] || LOCALE_CONFIG.ko;
    return {
      uiLocale: src.uiLocale,
      languageLabel: src.languageLabel,
      bibleLanguage: src.bibleLanguage,
      bibleVersion: src.bibleVersion,
      bibleDataset: src.bibleDataset,
      bookNameLocale: src.bookNameLocale,
      htmlLang: src.htmlLang,
      fallbackLocale: src.fallbackLocale,
      translationMode: 'native',
      googleTarget: ''
    };
  }

  function getLocaleConfig(raw) {
    var code = canonicalizeLocale(raw);
    if (code && LOCALE_CONFIG[code]) return cloneNativeConfig(code);
    if (code && !isSupported(code)) {
      return {
        uiLocale: code,
        languageLabel: languageLabelFor(code),
        bibleLanguage: 'ko',
        bibleVersion: 'KRV',
        bibleDataset: 'krv',
        bookNameLocale: code,
        htmlLang: code,
        fallbackLocale: 'ko',
        translationMode: 'google',
        googleTarget: googleTargetFor(code)
      };
    }
    return cloneNativeConfig('ko');
  }

  function readStoredLocale() {
    try {
      return canonicalizeLocale(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  function persistSelectedLocale(code) {
    if (!code) return;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
  }

  function getSelectedLocale() {
    try {
      var pending = canonicalizeLocale(global.__gomnaBridgeDisplayLang);
      if (pending) return pending;
    } catch (ePend) { /* ignore */ }
    var stored = readStoredLocale();
    if (stored) return stored;
    try {
      var attr = canonicalizeLocale(document.documentElement.getAttribute('data-gomna-ui-lang'));
      if (attr) return attr;
    } catch (eAttr) { /* ignore */ }
    try {
      var cookie = readValidGoogTransTarget();
      var fromCookie = canonicalizeLocale(cookie);
      if (fromCookie) return fromCookie;
    } catch (eCookie) { /* ignore */ }
    if (active && isSupported(currentLang)) return currentLang;
    return 'ko';
  }

  function bumpLocaleGeneration() {
    try {
      global.__gomnaLocaleGen = (global.__gomnaLocaleGen || 0) + 1;
    } catch (eGen) { /* ignore */ }
    return global.__gomnaLocaleGen || 1;
  }

  var RECENT_FOREIGN_KEY = 'gomna_recent_foreign_language';
  var DEFAULT_QUICK_FOREIGN = 'en';
  // Supported Google targets from COUNTRIES (non-ko). Keep valid user choices.
  var GT_TARGET_SET = {
    af: 1, am: 1, ar: 1, az: 1, be: 1, bg: 1, bn: 1, bs: 1, cs: 1, da: 1,
    de: 1, el: 1, en: 1, es: 1, et: 1, fa: 1, fi: 1, fr: 1, hi: 1, hr: 1,
    hu: 1, hy: 1, id: 1, is: 1, it: 1, iw: 1, ja: 1, ka: 1, kk: 1, km: 1,
    lo: 1, lt: 1, lv: 1, mg: 1, mk: 1, mn: 1, ms: 1, mt: 1, my: 1, ne: 1,
    nl: 1, no: 1, pl: 1, ps: 1, pt: 1, ro: 1, ru: 1, rw: 1, si: 1, sk: 1,
    sl: 1, so: 1, sq: 1, sr: 1, sv: 1, sw: 1, th: 1, tl: 1, tr: 1, uk: 1,
    ur: 1, uz: 1, vi: 1, 'zh-CN': 1, 'zh-TW': 1
  };

  function clearIncompleteGoogTrans() {
    try {
      document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
      if (typeof location !== 'undefined' && location.hostname) {
        document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + location.hostname;
        var host = String(location.hostname || '');
        if (host.indexOf('.') > -1 && !/^[\d.]+$/.test(host)) {
          var parts = host.split('.');
          var dom = '.' + parts.slice(-2).join('.');
          document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=' + dom;
        }
      }
    } catch (e) { /* ignore */ }
  }

  function normalizeGoogTransTarget(rawTarget) {
    var t = String(rawTarget || '').trim();
    if (!t) return '';
    if (t === 'zh-cn' || t === 'zh_cn') return 'zh-CN';
    if (t === 'zh-tw' || t === 'zh_tw') return 'zh-TW';
    if (/^[a-z]{2}$/i.test(t)) return t.toLowerCase();
    return t;
  }

  // Keep valid /ko/<target> user choices. Incomplete/unsupported → ''.
  function readValidGoogTransTarget() {
    try {
      var m = (document.cookie || '').match(/(?:^|;\s*)googtrans=([^;]+)/);
      if (!m) return '';
      var raw = decodeURIComponent(m[1] || '');
      var parts = String(raw || '').split('/');
      var source = parts[1] || '';
      var target = normalizeGoogTransTarget(parts[2] || '');
      if (!source || !target) return '';
      if (target === 'ko' || target === 'null' || target === 'undefined') return '';
      if (!GT_TARGET_SET[target]) return '';
      return target;
    } catch (e) {
      return '';
    }
  }

  function readGoogTransTarget() {
    var valid = readValidGoogTransTarget();
    if (valid) return valid;
    try {
      if (/(?:^|;\s*)googtrans=/.test(document.cookie || '')) clearIncompleteGoogTrans();
    } catch (eClear) { /* ignore */ }
    return '';
  }

  function clearInvalidGoogTransOnly() {
    try {
      if (!/(?:^|;\s*)googtrans=/.test(document.cookie || '')) return;
      if (readValidGoogTransTarget()) return;
      clearIncompleteGoogTrans();
    } catch (eInv) { /* ignore */ }
  }

  function setGoogTransCookie(targetLang) {
    if (!targetLang || targetLang === 'ko') {
      clearIncompleteGoogTrans();
      return;
    }
    try {
      var value = '/ko/' + targetLang;
      var maxAge = '; max-age=' + (60 * 60 * 24 * 365);
      document.cookie = 'googtrans=' + value + '; path=/' + maxAge;
      if (typeof location !== 'undefined' && location.hostname) {
        var host = String(location.hostname || '');
        if (host.indexOf('.') > -1 && !/^[\d.]+$/.test(host)) {
          var parts = host.split('.');
          var dom = '.' + parts.slice(-2).join('.');
          document.cookie = 'googtrans=' + value + '; path=/; domain=' + dom + maxAge;
        }
      }
    } catch (e) { /* ignore */ }
  }

  var QUICK_LANGUAGES = ['ko', 'en'];
  /** Seed EN when empty. Never auto-seed JA from device/home language. */
  function ensureDefaultQuickForeign() {
    try {
      var existing = localStorage.getItem(RECENT_FOREIGN_KEY);
      if (!existing || existing === 'ko') {
        localStorage.setItem(RECENT_FOREIGN_KEY, DEFAULT_QUICK_FOREIGN);
      }
    } catch (e) { /* ignore */ }
  }

  /**
   * Unified initial home language decision.
   * 1) explicit localStorage ko/en/ja/zh (canonical selectedLocale) — keep forever
   * 2) leftover googtrans for a now-native locale (en/ja/zh-CN/zh-TW) — migrate to native
   * 3) valid googtrans for other Google-only langs — keep Google mode
   * 4) no app/cookie selection → app default language (never browser auto-switch)
   */
  function resolveInitialHomeLanguage() {
    try {
      var stored = canonicalizeLocale(localStorage.getItem(STORAGE_KEY));
      if (isSupported(stored)) {
        if (stored === 'ko') clearIncompleteGoogTrans();
        ensureDefaultQuickForeign();
        return { lang: stored, mode: 'native', active: true, persisted: true };
      }
      if (stored && !isSupported(stored)) {
        ensureDefaultQuickForeign();
        return { lang: stored, mode: 'google', active: false, persisted: true };
      }
    } catch (e) { /* ignore */ }

    // Honor explicit Google target before browser-ko auto-detect clears it.
    var validGt = readValidGoogTransTarget();
    if (validGt) {
      ensureDefaultQuickForeign();
      var gtNative = canonicalizeNativeLocale(validGt);
      if (isSupported(gtNative)) {
        return { lang: gtNative, mode: 'native', active: true, persisted: true };
      }
      var gtCanon = canonicalizeLocale(validGt) || validGt;
      return { lang: gtCanon, mode: 'google', active: false, persisted: false };
    }

    clearInvalidGoogTransOnly();
    ensureDefaultQuickForeign();
    return { lang: SUPPORTED[0], mode: 'native', active: true, persisted: false };
  }

  function resolveLanguage() {
    var resolved = resolveInitialHomeLanguage();
    if (resolved.mode === 'native' && resolved.lang) {
      return {
        lang: resolved.lang,
        active: true,
        persisted: !!resolved.persisted
      };
    }
    return { lang: null, active: false, persisted: false };
  }

  function t(key, lang) {
    var code = isSupported(lang) ? lang : null;
    if (!code) {
      try {
        var selected = getSelectedLocale();
        if (isSupported(selected)) code = selected;
      } catch (eSel) { /* ignore */ }
    }
    if (!code) code = (active && isSupported(currentLang)) ? currentLang : 'ko';
    var pack = STRINGS[code] || STRINGS.ko;
    if (pack[key] != null && pack[key] !== '') return pack[key];
    if (STRINGS.ko[key] != null) return STRINGS.ko[key];
    return '';
  }

  function format(key, vars, lang) {
    var s = t(key, lang);
    if (!s) return '';
    if (!vars) return s;
    Object.keys(vars).forEach(function (k) {
      s = String(s).split('{' + k + '}').join(vars[k] == null ? '' : String(vars[k]));
    });
    return s;
  }

  function localeTag(lang) {
    if (lang === 'en') return 'en-US';
    if (lang === 'ja') return 'ja-JP';
    if (lang === 'zh') return 'zh-CN';
    return 'ko-KR';
  }

  function translateBookName(bookKo, lang) {
    if (!bookKo) return bookKo;
    if (typeof global.GomnaTranslateBookName === 'function') {
      try { return global.GomnaTranslateBookName(bookKo, lang) || bookKo; } catch (e) { /* ignore */ }
    }
    return bookKo;
  }

  function formatBookChapter(bookKo, chapter, lang) {
    var code = lang || currentLang || 'ko';
    var name = translateBookName(bookKo, code);
    var ch = String(chapter);
    if (code === 'ko') return name + ' ' + ch + '장';
    if (code === 'ja' || code === 'zh') return name + ' ' + ch + '章';
    // en + Google targets (tl/vi/…): localized book + bare chapter (no Korean units)
    return name + ' ' + ch;
  }

  /** Full scripture location for home resume cards (display-only). */
  function formatBookChapterVerse(bookKo, chapter, verse, lang) {
    var code = lang || currentLang || 'ko';
    var name = translateBookName(bookKo, code);
    var ch = String(chapter);
    var v = String(verse);
    if (code === 'ko') return name + ' ' + ch + '장 ' + v + '절';
    if (code === 'ja') return name + ' ' + ch + '章 ' + v + '節';
    if (code === 'zh') return name + ' ' + ch + '章 ' + v + '节';
    // en + Google targets: localized book + ch:v (avoids leftover 장/절)
    return name + ' ' + ch + ':' + v;
  }

  function formatRelativeDay(ts, lang) {
    // Native packs: ko/en/ja/zh. Other Google targets fall back to en (never ko leftovers).
    var code = isSupported(lang) ? lang : 'en';
    var d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var diff = Math.round((today - that) / 86400000);
    if (diff <= 0) return t('home.relative.today', code);
    if (diff === 1) return t('home.relative.yesterday', code);
    if (diff >= 2 && diff <= 6) {
      return String(t('home.relative.daysAgo', code) || '{n}일 전').replace('{n}', String(diff));
    }
    try {
      return new Intl.DateTimeFormat(localeTag(code), { month: 'long', day: 'numeric' }).format(d);
    } catch (e) {
      return (d.getMonth() + 1) + '/' + d.getDate();
    }
  }

  function formatContinueTitle(bookKo, chapter, dayWord, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var base = formatBookChapter(bookKo, chapter, code);
    if (!dayWord) return base;
    if (code === 'en') {
      return base + ' · ' + t('home.continue.lastReadSuffix', code) + ' ' + dayWord;
    }
    if (code === 'ja' || code === 'zh') {
      return base + ' · ' + dayWord + t('home.continue.lastReadSuffix', code);
    }
    return base + ' · ' + dayWord + ' ' + t('home.continue.lastReadSuffix', code);
  }

  function formatContinueSub(dayWord, hhmm, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var template = t('home.continue.readAt', code);
    return template.replace('{day}', dayWord || '').replace('{time}', hhmm || '').replace(/\s+/g, ' ').trim();
  }

  function formatCalendarMonth(year, monthIndex, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var d = new Date(year, monthIndex, 1);
    try {
      if (code === 'ko') {
        return year + '년 ' + (monthIndex + 1) + '월';
      }
      return new Intl.DateTimeFormat(localeTag(code), { year: 'numeric', month: 'long' }).format(d);
    } catch (e) {
      return year + '/' + (monthIndex + 1);
    }
  }

  function formatCalendarDayAria(month1to12, day, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var d = new Date(2000, month1to12 - 1, day);
    try {
      if (code === 'ko') return month1to12 + '월 ' + day + '일';
      return new Intl.DateTimeFormat(localeTag(code), { month: 'long', day: 'numeric' }).format(d);
    } catch (e) {
      return month1to12 + '/' + day;
    }
  }

  function formatChapterCount(n, lang) {
    var code = isSupported(lang) ? lang : currentLang;
    var num = String(n);
    if (code === 'en') return num;
    if (code === 'ja' || code === 'zh') return num + '章';
    return num + '장';
  }

  function markOwned(el) {
    if (!el || !el.getAttribute) return;
    if (el.getAttribute(OWNED_ATTR) !== '1') el.setAttribute(OWNED_ATTR, '1');
    if (el.getAttribute('translate') !== 'no') el.setAttribute('translate', 'no');
    if (!el.classList.contains('notranslate')) el.classList.add('notranslate');
  }

  function clearOwned(el) {
    if (!el || !el.getAttribute) return;
    if (el.getAttribute(OWNED_ATTR) === '1') {
      el.removeAttribute('translate');
      el.removeAttribute(OWNED_ATTR);
      el.classList.remove('notranslate');
    }
  }

  function applyAttr(el, kind, value) {
    if (!el || value == null || value === '') return;
    if (kind === 'text') {
      if (el.tagName === 'IMG') {
        if (el.getAttribute('alt') !== value) el.setAttribute('alt', value);
      } else if ((el.textContent || '') !== value) {
        el.textContent = value;
      }
    } else if (kind === 'placeholder') {
      if (el.getAttribute('placeholder') !== value) el.setAttribute('placeholder', value);
    } else if (kind === 'aria') {
      if (el.getAttribute('aria-label') !== value) el.setAttribute('aria-label', value);
    } else if (kind === 'title') {
      if (el.getAttribute('title') !== value) el.setAttribute('title', value);
    }
  }

  function applyToTree(root, lang) {
    if (!root || !root.querySelectorAll) return;
    for (var a = 0; a < ATTRS.length; a++) {
      var attr = ATTRS[a][0];
      var kind = ATTRS[a][1];
      var nodes = root.querySelectorAll('[' + attr + ']');
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var key = el.getAttribute(attr);
        if (!key) continue;
        var value = t(key, lang);
        if (!value) value = t(key, 'ko');
        if (!value) continue;
        applyAttr(el, kind, value);
        markOwned(el);
      }
    }
  }

  function clearBoot() {
    bootCleared = true;
    try { document.documentElement.classList.remove('gomna-ui-i18n-boot'); } catch (e) { /* ignore */ }
    try {
      if (global.__gomnaUiI18nBootFailsafe) {
        clearTimeout(global.__gomnaUiI18nBootFailsafe);
        global.__gomnaUiI18nBootFailsafe = null;
      }
    } catch (eFs) { /* ignore */ }
  }

  function apply(lang, opts) {
    if (!isSupported(lang)) return currentLang;
    var code = lang;
    var persist = !(opts && opts.persist === false);
    currentLang = code;
    active = true;
    // Only explicit user choices (persist:true) write gomna_ui_language.
    if (persist) {
      try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* ignore */ }
    }
    clearIncompleteGoogTrans();

    var html = document.documentElement;
    var cfg = getLocaleConfig(code);
    var htmlLang = cfg.htmlLang || code;
    if (html.lang !== htmlLang) {
      html.lang = htmlLang;
    }
    if (!html.classList.contains('gomna-native-i18n-active')) {
      html.classList.add('gomna-native-i18n-active');
    }
    if (html.getAttribute('data-gomna-ui-lang') !== code) {
      html.setAttribute('data-gomna-ui-lang', code);
    }

    applyToTree(document, code);
    clearBoot();

    try {
      global.dispatchEvent(new CustomEvent('gomna:ui-language-changed', {
        bubbles: true,
        detail: { lang: code, source: persist ? 'native' : 'auto-detect', persisted: persist }
      }));
    } catch (e2) {
      try {
        var ev = document.createEvent('CustomEvent');
        ev.initCustomEvent('gomna:ui-language-changed', true, true, { lang: code, source: persist ? 'native' : 'auto-detect' });
        global.dispatchEvent(ev);
      } catch (e3) { /* ignore */ }
    }
    return code;
  }

  function dispatchLocaleApplied(code, generation, source) {
    try {
      global.dispatchEvent(new CustomEvent('gomna:locale-applied', {
        bubbles: true,
        detail: {
          locale: code,
          selectedLocale: code,
          config: getLocaleConfig(code),
          generation: generation,
          source: source || 'applyLocale'
        }
      }));
    } catch (eEvt) { /* ignore */ }
    if (typeof global.__gomnaRefreshHomeI18n === 'function') {
      try { global.__gomnaRefreshHomeI18n(); } catch (eHome) { /* ignore */ }
    }
    if (typeof global.__gomnaRefreshReaderI18n === 'function') {
      try { global.__gomnaRefreshReaderI18n(); } catch (eReader) { /* ignore */ }
    }
    if (typeof global.__gomnaSyncGlobeI18n === 'function') {
      try { global.__gomnaSyncGlobeI18n(); } catch (eGlobe) { /* ignore */ }
    }
    if (global.GomnaReaderLangBridge && typeof global.GomnaReaderLangBridge.syncAllBridges === 'function') {
      try { global.GomnaReaderLangBridge.syncAllBridges(); } catch (eBridge) { /* ignore */ }
    }
  }

  function clearAllOwned() {
    var owned = document.querySelectorAll('[' + OWNED_ATTR + '="1"]');
    for (var i = 0; i < owned.length; i++) clearOwned(owned[i]);
  }

  function applyExternalLocale(code, opts) {
    opts = opts || {};
    var persist = opts.persist !== false;
    var generation = bumpLocaleGeneration();
    currentLang = 'ko';
    active = false;
    try { global.__gomnaLastLang = code; } catch (eLast) { /* ignore */ }
    if (persist) persistSelectedLocale(code);
    if (code && code !== 'ko') {
      try { localStorage.setItem(RECENT_FOREIGN_KEY, code); } catch (eRecent) { /* ignore */ }
    }
    var target = googleTargetFor(code);
    if (target) setGoogTransCookie(target);
    var html = document.documentElement;
    html.classList.remove('gomna-native-i18n-active');
    if (html.getAttribute('data-gomna-ui-lang') !== code) {
      html.setAttribute('data-gomna-ui-lang', code);
    }
    if (html.lang !== code) html.lang = code;
    clearAllOwned();
    clearBoot();
    dispatchLocaleApplied(code, generation, opts.source || 'applyLocale-external');
    return getLocaleConfig(code);
  }

  function applyLocale(raw, opts) {
    opts = opts || {};
    var code = canonicalizeLocale(raw);
    if (!code) return null;
    if (!isSupported(code)) {
      return applyExternalLocale(code, opts);
    }
    var persist = opts.persist !== false;
    var generation = bumpLocaleGeneration();
    try { global.__gomnaLastLang = code; } catch (eLast) { /* ignore */ }
    try { global.__gomnaBridgeDisplayLang = null; } catch (ePend) { /* ignore */ }
    if (code !== 'ko') {
      try { localStorage.setItem(RECENT_FOREIGN_KEY, code); } catch (eRecent) { /* ignore */ }
    }
    clearIncompleteGoogTrans();
    apply(code, { persist: persist, source: opts.source || 'applyLocale' });
    dispatchLocaleApplied(code, generation, opts.source || 'applyLocale');
    return getLocaleConfig(code);
  }

  function setLanguage(lang) {
    var cfg = applyLocale(lang, { persist: true, source: 'setLanguage' });
    return cfg ? cfg.uiLocale : getLanguage();
  }

  function deactivate(opts) {
    active = false;
    var keep = !!(opts && opts.keepSelectedLocale);
    if (!keep) {
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
    }
    var html = document.documentElement;
    html.classList.remove('gomna-native-i18n-active');
    if (!keep) html.removeAttribute('data-gomna-ui-lang');
    clearAllOwned();
    clearBoot();
  }

  function getLanguage() {
    return getSelectedLocale();
  }

  function applyExternalOnBoot(code) {
    currentLang = 'ko';
    active = false;
    persistSelectedLocale(code);
    var target = googleTargetFor(code);
    if (target) setGoogTransCookie(target);
    try {
      var html = document.documentElement;
      html.classList.remove('gomna-native-i18n-active');
      html.setAttribute('data-gomna-ui-lang', code);
      html.lang = code;
    } catch (eHtml) { /* ignore */ }
  }

  function boot() {
    try {
      var resolved = resolveInitialHomeLanguage();
      if (resolved.mode === 'native' && resolved.lang) {
        var applyOpts = { persist: !!resolved.persisted };
        if (document.body) {
          apply(resolved.lang, applyOpts);
        } else {
          currentLang = resolved.lang;
          active = true;
          document.addEventListener('DOMContentLoaded', function onReady() {
            document.removeEventListener('DOMContentLoaded', onReady);
            try {
              apply(resolved.lang, applyOpts);
            } catch (eApply) {
              clearBoot();
            }
          });
        }
        return;
      }
      active = false;
      currentLang = 'ko';
      if (resolved.mode === 'google' && resolved.lang) {
        applyExternalOnBoot(resolved.lang);
      }
      clearBoot();
    } catch (eBoot) {
      try { clearBoot(); } catch (eClear) { /* ignore */ }
    } finally {
      // Always schedule a late clear so exceptions cannot leave i18n-boot stuck.
      setTimeout(clearBoot, 800);
    }
  }

  global.GomnaUII18n = {
    supportedLanguages: SUPPORTED.slice(),
    nativeLocales: SUPPORTED.slice(),
    quickLanguages: QUICK_LANGUAGES.slice(),
    STORAGE_KEY: STORAGE_KEY,
    canonicalizeLocale: canonicalizeLocale,
    canonicalizeNativeLocale: canonicalizeNativeLocale,
    getSelectedLocale: getSelectedLocale,
    getLocaleConfig: getLocaleConfig,
    getTranslationMode: getTranslationMode,
    googleTargetFor: googleTargetFor,
    applyLocale: applyLocale,
    bumpLocaleGeneration: bumpLocaleGeneration,
    clearIncompleteGoogTrans: clearIncompleteGoogTrans,
    isNativeLocale: isNativeLocale,
    isExternalLocale: isExternalLocale,
    getLanguage: getLanguage,
    setLanguage: setLanguage,
    apply: apply,
    deactivate: deactivate,
    clearBoot: clearBoot,
    t: t,
    format: format,
    formatBookChapter: formatBookChapter,
    formatBookChapterVerse: formatBookChapterVerse,
    formatRelativeDay: formatRelativeDay,
    formatContinueTitle: formatContinueTitle,
    formatContinueSub: formatContinueSub,
    formatCalendarMonth: formatCalendarMonth,
    formatCalendarDayAria: formatCalendarDayAria,
    formatChapterCount: formatChapterCount,
    readValidGoogTransTarget: readValidGoogTransTarget,
    isActive: function () {
      try {
        if (document.documentElement.classList.contains('gomna-native-i18n-active')) return true;
      } catch (e) { /* ignore */ }
      return !!active;
    },
    resolveLanguage: resolveLanguage,
    resolveInitialHomeLanguage: resolveInitialHomeLanguage
  };

  boot();
})(typeof window !== 'undefined' ? window : this);
