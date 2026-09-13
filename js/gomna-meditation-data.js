/*! 은혜의말씀 — 묵상 data resolver
 * Home Card1 오늘의 말씀(GomnaDailyVerses) + Home Card2 승인 주제/이미지를 재사용한다.
 * 본문을 HTML에 하드코딩하지 않는다.
 */
(function(root){
  'use strict';

  var THEME_ORDER=['new','prayer','blessed','faith','love','wisdom','hope'];

  var THEME_IMGS={
    new:'assets/home/meditation/v5-card-new-life.png?v=20260908-mist-v1',
    prayer:'assets/home/meditation/v10-card-prayer-life.png?v=20260909-clean-v1',
    blessed:'assets/home/meditation/v12-card-blessed-life.png?v=20260909-blessed-v12b',
    faith:'assets/home/meditation/v6-card-faith-life.png?v=20260908-partial-v1',
    love:'assets/home/meditation/v10-card-love-life.png?v=20260909-clean-v1',
    wisdom:'assets/home/meditation/v5-card-wisdom-life.png?v=20260908-mist-v1',
    hope:'assets/home/meditation/v11-card-hope-life.png?v=20260909-hope-v11'
  };

  var THEME_POS={
    new:'74% 44%',
    prayer:'66% 38%',
    blessed:'80% 48%',
    faith:'76% 40%',
    love:'72% 42%',
    wisdom:'76% 40%',
    hope:'78% 38%'
  };

  var THEME_SUB={
    new:'다시 시작하는 마음',
    prayer:'하나님 앞에 머무는 시간',
    blessed:'받은 은혜를 바라보다',
    faith:'보이지 않아도 걸어가기',
    love:'먼저 품고 먼저 건네기',
    wisdom:'말씀으로 선택하기',
    hope:'다시 바라보는 마음'
  };

  /* Home Card2 LIFE_THEMES와 동일한 승인 문구. 주제 묵상 seed. */
  var THEMES={
    new:{
      id:'new', name:'새로운 삶',
      title:'다시 시작해도 괜찮습니다',
      verseRef:'고린도후서 5:17',
      verseText:'그런즉 누구든지 그리스도 안에 있으면 새로운 피조물이라 이전 것은 지나갔으니 보라 새 것이 되었도다',
      teaser:'어제의 실패가 오늘을 결정하지 않습니다.\n하나님 안에서는 다시 시작할 수 있습니다.',
      reflection:'어제의 실수가\n오늘의 나를 결정하지 않습니다.\n\n하나님은 닫힌 문 앞에서도\n새로운 길을 준비하십니다.\n\n이전 것은 지나갔습니다.\n오늘, 새 것으로 걸어가십시오.',
      question:'오늘 하나님이 새롭게 하시기를 바라는 삶의 한 부분은 무엇입니까?',
      question2:'어제의 실패를 붙들고 있는 마음이 있다면, 어디에 내려놓으면 좋을까요?',
      step:'오늘 하나만 새롭게 시작해 보세요.',
      prayer:'주님, 어제에 머물지 않고\n오늘 주시는 새 길을 걷게 하소서.'
    },
    prayer:{
      id:'prayer', name:'기도하는 삶',
      title:'말이 없어도 기도는 시작됩니다',
      verseRef:'빌립보서 4:6-7',
      verseText:'아무 것도 염려하지 말고 오직 모든 일에 기도와 간구로 너희 구할 것을 감사함으로 하나님께 아뢰라 그리하면 모든 지각에 뛰어난 하나님의 평강이 그리스도 예수 안에서 너희 마음과 생각을 지키시리라',
      teaser:'아무것도 염려하지 말고, 감사함으로 아뢰십시오.\n구할 것이 있을 때 먼저 하나님께 맡기는 길이 있습니다.',
      reflection:'무슨 말을 해야 할지\n모르는 날이 있습니다.\n\n그저 주님 앞에 머무는 것,\n그것도 기도입니다.\n\n염려를 붙드는 대신\n감사함으로 그 이름을 부르십시오.',
      question:'오늘 하나님께 아뢰고 싶은 한 가지는 무엇입니까?',
      question2:'지금 마음에 가장 무거운 것을 무엇이라고 부를 수 있을까요?',
      step:'지금 마음에 가장 무거운 한 가지를 주님께 말씀드려 보세요.',
      prayer:'주님, 염려를 품고 홀로 서 있지 않고\n모든 마음을 주님께 맡기게 하소서.'
    },
    blessed:{
      id:'blessed', name:'복된 삶',
      title:'주님 안에 뿌리내린 삶이 복입니다',
      verseRef:'시편 1:1-3',
      verseText:'복 있는 사람은 악인의 꾀를 좇지 아니하며 죄인의 길에 서지 아니하며 오만한 자의 자리에 앉지 아니하고 오직 여호와의 율법을 즐거워하여 그 율법을 주야로 묵상하는 자로다 저는 시냇가에 심은 나무가 시절을 좇아 과실을 맺으며 그 잎사귀가 마르지 아니함 같으니 그 행사가 다 형통하리로다',
      teaser:'복 있는 사람은 하나님의 말씀을 즐거워합니다.\n그 삶은 시냇가에 심은 나무처럼 자리를 잡습니다.',
      reflection:'복은 많이 가지는 데서\n시작되지 않습니다.\n\n하나님의 말씀 곁에 머무는 사람에게\n조용히 스며듭니다.\n\n오늘 한 절을 즐거워하는 마음이\n뿌리입니다.',
      question:'오늘 말씀을 즐거워하는 삶은 어떤 모습일까요?',
      question2:'내가 지금 즐거워하고 있는 것은 말씀인가요, 다른 기준인가요?',
      step:'오늘 잠시 멈추고 말씀 한 절을 마음에 머물게 하세요.',
      prayer:'주님, 세상의 기준보다\n주님 안의 복을 먼저 구하게 하소서.'
    },
    faith:{
      id:'faith', name:'믿음의 삶',
      title:'보이지 않아도 걸을 수 있습니다',
      verseRef:'히브리서 11:1',
      verseText:'믿음은 바라는 것들의 실상이요 보지 못하는 것들의 증거니',
      teaser:'믿음은 바라는 것들의 실상이요\n보이지 않는 것들의 증거입니다.',
      reflection:'믿음은 모든 답을 아는 확신이 아니라\n\n주님이 함께하신다는 약속을\n붙드는 용기입니다.\n\n보이지 않아도\n한 걸음을 내디딜 수 있습니다.',
      question:'오늘 보이지 않아도 주님께 맡기고 싶은 일은 무엇입니까?',
      question2:'답을 모르면서도 붙들고 싶은 약속은 무엇인가요?',
      step:'오늘 두려운 일 하나 앞에서 작은 순종을 선택하세요.',
      prayer:'주님, 보이지 않는 길에서도\n주님의 손을 신뢰하게 하소서.'
    },
    love:{
      id:'love', name:'사랑하는 삶',
      title:'사랑은 가까운 사람부터 시작됩니다',
      verseRef:'요한복음 13:34',
      verseText:'새 계명을 너희에게 주노니 서로 사랑하라 내가 너희를 사랑한 것 같이 너희도 서로 사랑하라',
      teaser:'사랑은 우리가 먼저 만들어 내는 것이 아닙니다.\n이미 받은 사랑에서 흘러나옵니다.',
      reflection:'사랑은 큰 말보다\n\n따뜻한 시선과\n다정한 기다림으로 전해집니다.\n\n주님의 사랑이 오늘\n우리의 말과 표정에 머물게 하소서.',
      question:'오늘 내가 받은 사랑을 누구에게 전할 수 있을까요?',
      question2:'가장 가까운 사람에게 먼저 건넬 수 있는 온기는 무엇인가요?',
      step:'오늘 한 사람에게 따뜻한 말 한마디를 건네 보세요.',
      prayer:'주님, 받은 사랑을\n흘려보내는 하루가 되게 하소서.'
    },
    wisdom:{
      id:'wisdom', name:'지혜로운 삶',
      title:'지혜가 필요할 때 하나님께 구하십시오',
      verseRef:'야고보서 1:5',
      verseText:'너희 중에 누구든지 지혜가 부족하거든 모든 사람에게 후히 주시고 꾸짖지 아니하시는 하나님께 구하라 그리하면 주시리라',
      teaser:'오늘 필요한 지혜는 멀리 있지 않습니다.\n하나님은 구하는 자에게 후히 주십니다.',
      reflection:'지혜는 서두르지 않고\n주님의 뜻을 분별하는 마음입니다.\n\n조용히 묻는 사람에게\n하나님은 길을 밝혀 보여 주십니다.\n\n먼저 구하는 하루가 됩니다.',
      question:'오늘 지혜가 필요한 선택 한 가지는 무엇입니까?',
      question2:'내 생각보다 먼저 물어야 할 일이 있다면 무엇인가요?',
      step:'오늘 결정해야 할 한 가지를 두고 먼저 기도하세요.',
      prayer:'주님, 제 생각보다\n주님의 지혜를 먼저 따르게 하소서.'
    },
    hope:{
      id:'hope', name:'소망의 삶',
      title:'끝이 보이지 않아도 빛은 옵니다',
      verseRef:'로마서 15:13',
      verseText:'소망의 하나님이 모든 기쁨과 평강을 믿음 안에서 너희에게 충만하게 하사 성령의 능력으로 소망이 넘치게 하시기를 원하노라',
      teaser:'소망은 내일을 스스로 그리는 힘이 아닙니다.\n하나님을 바라보기에 오늘을 견디는 힘입니다.',
      reflection:'소망은 상황이 좋아져서 생기는\n마음이 아닙니다.\n\n하나님이 여전히 일하고 계심을\n믿는 눈입니다.\n\n끝이 보이지 않아도\n빛은 옵니다.',
      question:'오늘 하나님께 맡기며 기다릴 소망은 무엇입니까?',
      question2:'아직 오지 않은 일을 붙들기보다, 오늘 바라볼 빛은 무엇인가요?',
      step:'오늘 감사할 이유 하나를 적으며 내일을 바라보세요.',
      prayer:'주님, 흔들리는 마음에도\n하늘의 소망으로 저를 붙들어 주소서.'
    }
  };

  /* Home Card1 extrasFor 승인 문구. */
  var VERSE_EXTRAS={
    '베드로전서 5:7':{
      title:'맡길 곳이 있습니다',
      shortMessage:'혼자 끌어안고 있던 걱정도 하나님 앞에서는 내려놓을 수 있습니다.',
      reflection:'혼자 끌어안고 있던 걱정도\n하나님 앞에서는 내려놓을 수 있습니다.\n\n아직 오지 않은 일까지\n오늘의 마음으로 붙들면\n오늘 필요한 평안까지 잃게 됩니다.\n\n지금 그 한 가지를\n주님께 맡기십시오.',
      question:'오늘 무엇을 하나님께 맡기시겠습니까?',
      action:'오늘 통제하려 했던 한 가지를 내려놓으세요.',
      prayer:'하나님, 혼자 붙들던 염려를 주님께 맡기게 해 주세요.'
    },
    '빌립보서 4:6':{
      title:'염려 대신 아뢰는 길',
      shortMessage:'구할 것이 있을 때 먼저 하나님께 아뢰는 것이 오늘의 길입니다.',
      reflection:'아무것도 염려하지 말라는 말씀은\n감정을 지우라는 뜻이 아닙니다.\n\n구할 것이 있을 때\n먼저 하나님께 아뢰라는 초대입니다.\n\n오늘 붙들고 있는 염려가 있다면\n감사함으로 그 이름을 부르십시오.\n도움은 기도 다음에 옵니다.',
      question:'오늘 무엇을 하나님께 맡기시겠습니까?',
      action:'한 가지 염려를 기도로 바꾸어 보세요.',
      prayer:'하나님, 염려 대신 기도로 마음을 돌려 주세요.'
    },
    '시편 46:1':{
      title:'피난처가 있다는 것',
      shortMessage:'환난 중에도 하나님은 가장 가까운 피난처입니다.',
      reflection:'하나님은\n어려움이 모두 지나간 뒤에\n우리 곁에 오시는 분이 아닙니다.\n\n마음이 흔들리고\n앞이 보이지 않는 바로 그 순간에도\n숨을 곳이 되어 주십니다.\n\n오늘 혼자 견디고 있는 일이 있다면\n조금 내려놓아도 괜찮습니다.\n\n도움은 멀리 있지 않습니다.\n하나님께서 지금도 가까이 계십니다.',
      question:'오늘 무엇을 하나님께 맡기시겠습니까?',
      action:'피난처이신 하나님을 한 번 소리 내어 고백하세요.',
      prayer:'하나님, 오늘 필요한 도움을 구합니다.'
    }
  };

  var VERSE_SHORT={
    '욥기 8:7':'시작은 작아도, 하나님이 나중을 크게 하십니다.',
    '시편 23:1':'여호와가 목자가 되시니, 오늘도 부족하지 않습니다.',
    '베드로전서 5:7':'혼자 끌어안던 걱정도 주님 앞에 내려놓을 수 있습니다.',
    '빌립보서 4:6':'염려 대신, 감사함으로 하나님께 아뢰는 길이 있습니다.',
    '시편 46:1':'환난 중에도 하나님은 가장 가까운 피난처입니다.',
    '요한복음 3:16':'하나님이 이처럼 사랑하사, 생명을 주셨습니다.',
    '요한일서 4:7':'사랑은 하나님께 속한 것이니, 서로 사랑합시다.',
    '고린도전서 13:13':'믿음과 소망과 사랑 중에, 제일은 사랑입니다.',
    '로마서 8:38-39':'아무것도 우리를 하나님의 사랑에서 끊을 수 없습니다.',
    '빌립보서 4:13':'능력 주시는 분 안에서, 오늘을 걸어갑니다.',
    '히브리서 11:1':'보이지 않아도, 약속을 붙들 수 있습니다.',
    '마가복음 9:23':'믿는 자에게는 능치 못할 일이 없습니다.',
    '야고보서 1:5':'지혜가 필요할 때, 하나님께 구하면 주십니다.',
    '예레미야 29:11':'하나님이 품으신 생각은 평안과 희망입니다.',
    '로마서 8:28':'하나님을 사랑하는 자에게 모든 것이 선을 이룹니다.',
    '이사야 40:31':'여호와를 앙망하는 자는 새 힘을 얻습니다.',
    '잠언 3:5':'마음을 다하여 여호와를 의뢰하십시오.',
    '시편 119:105':'주의 말씀은 길에 빛이 됩니다.',
    '잠언 16:9':'계획을 세우더라도, 걸음을 인도하시는 분은 여호와입니다.',
    '여호수아 1:9':'어디로 가든지 하나님이 함께하십니다.',
    '이사야 41:10':'두려워 말라. 내가 너와 함께 함이니라.',
    '신명기 31:6':'마음을 강하게 하고, 담대히 하십시오.',
    '디모데후서 1:7':'하나님이 주신 것은 능력과 사랑과 근신의 마음입니다.',
    '마태복음 7:7':'구하라, 그러면 너희에게 주실 것입니다.',
    '야고보서 5:16':'서로를 위해 기도할 때, 간구는 힘이 있습니다.',
    '데살로니가전서 5:17':'쉬지 말고 기도하십시오.',
    '시편 100:4':'감사함으로 그 문에 들어가십시오.',
    '빌립보서 4:4':'주 안에서 항상 기뻐하십시오.',
    '데살로니가전서 5:18':'범사에 감사하는 것이 하나님의 뜻입니다.',
    '마태복음 11:28':'수고하고 무거운 짐 진 자는 주님께로 오십시오.'
  };

  var VERSE_TITLE={
    '욥기 8:7':'시작은 작아도',
    '시편 23:1':'부족함이 없는 자리',
    '베드로전서 5:7':'맡길 곳이 있습니다',
    '빌립보서 4:6':'염려 대신 아뢰는 길',
    '시편 46:1':'피난처가 있다는 것',
    '요한복음 3:16':'이처럼 사랑하사',
    '요한일서 4:7':'서로 사랑하자',
    '고린도전서 13:13':'그 중에 제일은 사랑',
    '로마서 8:38-39':'끊을 수 없는 사랑',
    '빌립보서 4:13':'능력 주시는 자 안에서',
    '히브리서 11:1':'보이지 않아도',
    '마가복음 9:23':'믿는 자에게는',
    '야고보서 1:5':'지혜가 필요할 때',
    '예레미야 29:11':'평안과 희망의 생각',
    '로마서 8:28':'합력하여 선을 이루시는',
    '이사야 40:31':'새 힘을 얻는 길',
    '잠언 3:5':'마음을 다하여 의뢰하라',
    '시편 119:105':'길에 빛이 있습니다',
    '잠언 16:9':'걸음을 인도하시는 분',
    '여호수아 1:9':'두려워 말며',
    '이사야 41:10':'내가 너와 함께 함이라',
    '신명기 31:6':'마음을 강하게 하라',
    '디모데후서 1:7':'두려워하는 마음이 아니요',
    '마태복음 7:7':'구하라 그러면',
    '야고보서 5:16':'서로 기도하라',
    '데살로니가전서 5:17':'쉬지 말고 기도하라',
    '시편 100:4':'감사함으로 들어가며',
    '빌립보서 4:4':'주 안에서 기뻐하라',
    '데살로니가전서 5:18':'범사에 감사하라',
    '마태복음 11:28':'내게로 오라'
  };

  var VERSE_THEME={
    '욥기 8:7':'hope',
    '시편 23:1':'blessed',
    '베드로전서 5:7':'prayer',
    '빌립보서 4:6':'prayer',
    '시편 46:1':'faith',
    '요한복음 3:16':'love',
    '요한일서 4:7':'love',
    '고린도전서 13:13':'love',
    '로마서 8:38-39':'love',
    '빌립보서 4:13':'faith',
    '히브리서 11:1':'faith',
    '마가복음 9:23':'faith',
    '야고보서 1:5':'wisdom',
    '예레미야 29:11':'hope',
    '로마서 8:28':'hope',
    '이사야 40:31':'hope',
    '잠언 3:5':'faith',
    '시편 119:105':'wisdom',
    '잠언 16:9':'wisdom',
    '여호수아 1:9':'faith',
    '이사야 41:10':'faith',
    '신명기 31:6':'faith',
    '디모데후서 1:7':'faith',
    '마태복음 7:7':'prayer',
    '야고보서 5:16':'prayer',
    '데살로니가전서 5:17':'prayer',
    '시편 100:4':'blessed',
    '빌립보서 4:4':'blessed',
    '데살로니가전서 5:18':'blessed',
    '마태복음 11:28':'new'
  };

  function pad2(n){return (n<10?'0':'')+n;}

  function localDateKey(d){
    d=d||new Date();
    if(typeof d==='string'){
      if(/^\d{4}-\d{2}-\d{2}$/.test(d))return d;
      d=new Date(d);
    }
    if(!(d instanceof Date)||isNaN(d.getTime()))d=new Date();
    return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
  }

  function parseDateKey(key){
    var m=String(key||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    return {y:+m[1],m:+m[2],day:+m[3]};
  }

  function dateFromKey(key){
    var p=parseDateKey(key);
    if(!p)return new Date();
    return new Date(p.y,p.m-1,p.day);
  }

  function timeZone(){
    try{
      return Intl.DateTimeFormat().resolvedOptions().timeZone||'local';
    }catch(e){
      return 'local';
    }
  }

  function formatDateLabel(key){
    var d=dateFromKey(key);
    try{
      return new Intl.DateTimeFormat('ko-KR',{month:'long',day:'numeric',weekday:'short'}).format(d);
    }catch(e){
      var p=parseDateKey(key);
      return p?p.m+'월 '+p.day+'일':'';
    }
  }

  function themeById(id){
    return THEMES[id]||THEMES.new;
  }

  function knownThemeId(id){
    id=String(id||'').trim();
    return THEMES[id]?id:'';
  }

  function themeImage(id){
    var t=knownThemeId(id)||'new';
    return THEME_IMGS[t]||THEME_IMGS.new;
  }

  function themePos(id){
    var t=knownThemeId(id)||'new';
    return THEME_POS[t]||THEME_POS.new;
  }

  function splitParagraphs(text){
    return String(text||'').split(/\n\s*\n/).map(function(s){return s.replace(/\n/g,' ').trim();}).filter(Boolean);
  }

  function dailyVerse(dateKey){
    var dv=root.GomnaDailyVerses;
    if(dv&&typeof dv.resolveVerse==='function'){
      return dv.resolveVerse({date:dateKey, locale:'ko'});
    }
    if(dv&&typeof dv.getVerseForDate==='function'){
      var v=dv.getVerseForDate(dateKey);
      var parsed=dv.parseRef?dv.parseRef(v.r):{book:'',chapter:1,startVerse:1,endVerse:1};
      return {
        date:dateKey,
        canonicalRef:v.r,
        refText:v.r,
        body:v.t,
        book:parsed.book,
        chapter:parsed.chapter,
        startVerse:parsed.startVerse,
        endVerse:parsed.endVerse
      };
    }
    return {date:dateKey,canonicalRef:'',refText:'',body:'',book:'',chapter:1,startVerse:1,endVerse:1};
  }

  function defaultExtras(verseText, theme){
    var t=theme||THEMES.new;
    return {
      title:t.title,
      shortMessage:String(t.teaser||'').replace(/\n/g,' '),
      reflection:t.reflection,
      question:t.question,
      question2:t.question2||'',
      action:t.step,
      prayer:t.prayer
    };
  }

  function resolve(opts){
    opts=opts||{};
    var today=localDateKey();
    var dateKey=localDateKey(opts.date||today);
    var themeId=knownThemeId(opts.theme);
    var mode=themeId?'theme':'daily';
    var verse;
    var theme;
    if(mode==='theme'){
      theme=themeById(themeId);
      var parsed=(root.GomnaDailyVerses&&root.GomnaDailyVerses.parseRef)
        ?root.GomnaDailyVerses.parseRef(theme.verseRef)
        :{book:'',chapter:1,startVerse:1,endVerse:1};
      verse={
        date:dateKey,
        canonicalRef:theme.verseRef,
        refText:theme.verseRef,
        body:theme.verseText,
        book:parsed.book,
        chapter:parsed.chapter,
        startVerse:parsed.startVerse,
        endVerse:parsed.endVerse
      };
    }else{
      verse=dailyVerse(dateKey);
      themeId=VERSE_THEME[verse.canonicalRef]||THEME_ORDER[(parseDateKey(dateKey)||{day:1}).day%THEME_ORDER.length];
      theme=themeById(themeId);
    }
    var extra=mode==='theme'?null:VERSE_EXTRAS[verse.canonicalRef];
    var seeded=extra||defaultExtras(verse.body, theme);
    var title=(mode==='theme'?theme.title:(VERSE_TITLE[verse.canonicalRef]||seeded.title||theme.title));
    var shortMessage=(mode==='theme')
      ?String(theme.teaser||'').replace(/\n/g,' ')
      :(extra?extra.shortMessage:(VERSE_SHORT[verse.canonicalRef]||seeded.shortMessage));
    var reflection=seeded.reflection;
    if(mode==='daily' && !extra){
      reflection='오늘 이 말씀이 건넵니다.\n'+verse.body+'\n\n하나님은 오늘 필요한 은혜를\n오늘 주십니다.\n\n이 한 구절을 마음에 두고\n하루를 걸어가십시오.';
    }
    if(mode==='theme'){
      title=theme.title;
      shortMessage=String(theme.teaser||'').replace(/\n/g,' ');
      reflection=theme.reflection;
      seeded={
        question:theme.question,
        question2:theme.question2||'',
        action:theme.step,
        prayer:theme.prayer
      };
    }
    return {
      date:dateKey,
      today:today,
      isToday:dateKey===today,
      isFuture:dateKey>today,
      timezone:timeZone(),
      mode:mode,
      verseRef:verse.refText||verse.canonicalRef,
      verseText:verse.body||'',
      canonicalRef:verse.canonicalRef,
      book:verse.book,
      chapter:verse.chapter,
      startVerse:verse.startVerse,
      endVerse:verse.endVerse,
      theme:theme.id,
      themeName:theme.name,
      themeSubtitle:THEME_SUB[theme.id],
      title:String(title).replace(/\n/g,' '),
      shortMessage:shortMessage,
      reflection:reflection,
      reflectionParts:splitParagraphs(reflection),
      questions:[seeded.question||theme.question, seeded.question2||theme.question2||''].filter(Boolean).slice(0,2),
      action:seeded.action||theme.step,
      prayer:seeded.prayer||theme.prayer,
      image:themeImage(theme.id),
      imagePos:themePos(theme.id),
      dateLabel:formatDateLabel(dateKey)
    };
  }

  function themesList(){
    return THEME_ORDER.map(function(id){
      var t=themeById(id);
      return {
        id:t.id,
        name:t.name,
        subtitle:THEME_SUB[id],
        image:themeImage(id),
        imagePos:themePos(id)
      };
    });
  }

  function readerUrl(model, mode){
    model=model||{};
    var qs=[];
    function add(k,v){
      if(v==null||v==='')return;
      qs.push(encodeURIComponent(k)+'='+encodeURIComponent(String(v)));
    }
    var start=model.startVerse||1;
    var end=model.endVerse||start;
    add('book', model.book);
    if(model.chapter)add('chapter', model.chapter);
    add('verse', start);
    add('verseStart', start);
    if(end>start)add('verseEnd', end);
    if(mode==='listen'){
      add('startVerse', start);
      add('endVerse', end);
      add('listen','1');
      add('source','home-card-listen');
    }else if(mode==='commentary'){
      add('commentary','1');
      add('source','home-card-commentary');
    }else{
      add('source','home-daily-read');
    }
    return 'reader.html?'+qs.join('&');
  }

  var api={
    THEME_ORDER:THEME_ORDER,
    THEME_IMGS:THEME_IMGS,
    THEME_SUB:THEME_SUB,
    THEMES:THEMES,
    localDateKey:localDateKey,
    parseDateKey:parseDateKey,
    dateFromKey:dateFromKey,
    formatDateLabel:formatDateLabel,
    timeZone:timeZone,
    themeById:themeById,
    knownThemeId:knownThemeId,
    themeImage:themeImage,
    themePos:themePos,
    themesList:themesList,
    resolve:resolve,
    readerUrl:readerUrl
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.GomnaMeditationData=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:this);
