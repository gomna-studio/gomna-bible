/* GOMNA HOME 3-CARD STACK 20260904
   Backup 로직(fillCopy, flip, social, reader target)을 3장만 쓰도록 재구성.
   묵상 패널·8장 덱·휠 가로채기는 복구하지 않는다. */
(function(){
  var root, stage, cards=[], count=3, progress=0, raf=0, reduce=false;
  var pointerY=0, pointerX=0, pointerT=0, pointerMoved=false, scrollQuiet=true, scrollQuietTimer=0;
  var openScrollY=0, flipping=false;
  var card2Settled=false, card3Settled=false, allowCard3=false, allowCard1From2=false, allowCard2From3=false;
  var awaitingDir=false, gestureLive=false, gestureEndedSinceSettle=false;
  var settleAnim=false, settleAnimTimer=0, wheelIdleTimer=0, lastP=0;
  var pinching=false, pinchScrollY=0, lifeImgsPreloaded=false;
  var swipeDrag=null, swipeHandled=false;
  var SETTLE_AT=0.32;
  var SETTLE_MS=180;
  var SWIPE_PX=36;
  var SWIPE_VEL=0.28;
  var H_SWIPE_PX=28;
  var H_SWIPE_VEL=0.22;
  var AXIS_PX=16;
  var AXIS_RATIO=1.25;
  var LIFE_THEME_IMGS={
    new:'assets/home/meditation/v5-card-new-life.png?v=20260908-mist-v1',
    prayer:'assets/home/meditation/v10-card-prayer-life.png?v=20260909-clean-v1',
    blessed:'assets/home/meditation/v5-card-blessed-life.png?v=20260908-mist-v1',
    faith:'assets/home/meditation/v6-card-faith-life.png?v=20260908-partial-v1',
    love:'assets/home/meditation/v10-card-love-life.png?v=20260909-clean-v1',
    wisdom:'assets/home/meditation/v5-card-wisdom-life.png?v=20260908-mist-v1',
    hope:'assets/home/meditation/v5-card-hope-life.png?v=20260908-mist-v1'
  };
  var LIKE_KEY='gomna_daily_verse_likes';
  var COMMENT_KEY='gomna_daily_verse_comments';
  var SHARE_KEY='gomna_daily_verse_shares';
  var NOTE_KEY='gomna_home_response_';
  var LIFE_THEME_DEFAULT='new';
  var lifeThemeId=LIFE_THEME_DEFAULT;
  var STORY_PERSON_DEFAULT='david';
  var storyPersonId=STORY_PERSON_DEFAULT;
  var STORY_PEOPLE=[
    {id:'abraham', name:'아브라함'},
    {id:'moses', name:'모세'},
    {id:'david', name:'다윗'},
    {id:'joseph', name:'요셉'},
    {id:'ruth', name:'룻'},
    {id:'esther', name:'에스더'},
    {id:'paul', name:'바울'}
  ];
  var LIFE_THEMES=[
    {
      id:'new', name:'새로운 삶',
      title:'다시 시작해도\n괜찮습니다',
      verseRef:'고린도후서 5:17',
      teaser:'어제의 실패가 오늘을 결정하지 않습니다.\n하나님 안에서는 다시 시작할 수 있습니다.',
      reflection:'어제의 실수가\n오늘의 나를 결정하지 않습니다.\n\n하나님은 닫힌 문 앞에서도\n새로운 길을 준비하십니다.',
      question:'오늘 하나님이 새롭게 하시기를 바라는 삶의 한 부분은 무엇입니까?',
      step:'오늘 하나만 새롭게 시작해 보세요.',
      prayer:'주님, 어제에 머물지 않고\n오늘 주시는 새 길을 걷게 하소서.'
    },
    {
      id:'prayer', name:'기도하는 삶',
      title:'말이 없어도\n기도는 시작됩니다',
      verseRef:'빌립보서 4:6-7',
      teaser:'아무것도 염려하지 말고, 감사함으로 아뢰십시오.\n구할 것이 있을 때 먼저 하나님께 맡기는 길이 있습니다.',
      reflection:'무슨 말을 해야 할지\n모르는 날이 있습니다.\n\n그저 주님 앞에 머무는 것,\n그것도 기도입니다.',
      question:'오늘 하나님께 아뢰고 싶은 한 가지는 무엇입니까?',
      step:'지금 마음에 가장 무거운 한 가지를\n주님께 말씀드려 보세요.',
      prayer:'주님, 염려를 품고 홀로 서 있지 않고\n모든 마음을 주님께 맡기게 하소서.'
    },
    {
      id:'blessed', name:'복된 삶',
      title:'주님 안에\n뿌리내린 삶이 복입니다',
      verseRef:'시편 1:1-3',
      teaser:'복 있는 사람은 하나님의 말씀을 즐거워합니다.\n그 삶은 시냇가에 심은 나무처럼 자리를 잡습니다.',
      reflection:'복은 많이 가지는 데서\n시작되지 않습니다.\n\n하나님의 말씀 곁에 머무는 사람에게\n조용히 스며듭니다.',
      question:'오늘 말씀을 즐거워하는 삶은 어떤 모습일까요?',
      step:'오늘 잠시 멈추고\n말씀 한 절을 마음에 머물게 하세요.',
      prayer:'주님, 세상의 기준보다\n주님 안의 복을 먼저 구하게 하소서.'
    },
    {
      id:'faith', name:'믿음의 삶',
      title:'보이지 않아도\n걸을 수 있습니다',
      verseRef:'히브리서 11:1',
      teaser:'믿음은 바라는 것들의 실상이요\n보이지 않는 것들의 증거입니다.',
      reflection:'믿음은 모든 답을 아는 확신이 아니라\n\n주님이 함께하신다는 약속을\n붙드는 용기입니다.',
      question:'오늘 보이지 않아도 주님께 맡기고 싶은 일은 무엇입니까?',
      step:'오늘 두려운 일 하나 앞에서\n작은 순종을 선택하세요.',
      prayer:'주님, 보이지 않는 길에서도\n주님의 손을 신뢰하게 하소서.'
    },
    {
      id:'love', name:'사랑하는 삶',
      title:'사랑은 가까운 사람부터\n시작됩니다',
      verseRef:'요한복음 13:34',
      teaser:'사랑은 우리가 먼저 만들어 내는 것이 아닙니다.\n이미 받은 사랑에서 흘러나옵니다.',
      reflection:'사랑은 큰 말보다\n\n따뜻한 시선과\n다정한 기다림으로 전해집니다.\n\n주님의 사랑이 오늘\n우리의 말과 표정에 머물게 하소서.',
      question:'오늘 내가 받은 사랑을 누구에게 전할 수 있을까요?',
      step:'오늘 한 사람에게\n따뜻한 말 한마디를 건네 보세요.',
      prayer:'주님, 받은 사랑을\n흘려보내는 하루가 되게 하소서.'
    },
    {
      id:'wisdom', name:'지혜로운 삶',
      title:'지혜가 필요할 때\n하나님께 구하십시오',
      verseRef:'야고보서 1:5',
      teaser:'오늘 필요한 지혜는 멀리 있지 않습니다.\n하나님은 구하는 자에게 후히 주십니다.',
      reflection:'지혜는 서두르지 않고\n주님의 뜻을 분별하는 마음입니다.\n\n조용히 묻는 사람에게\n하나님은 길을 밝혀 보여 주십니다.',
      question:'오늘 지혜가 필요한 선택 한 가지는 무엇입니까?',
      step:'오늘 결정해야 할 한 가지를 두고\n먼저 기도하세요.',
      prayer:'주님, 제 생각보다\n주님의 지혜를 먼저 따르게 하소서.'
    },
    {
      id:'hope', name:'소망의 삶',
      title:'끝이 보이지 않아도\n빛은 옵니다',
      verseRef:'로마서 15:13',
      teaser:'소망은 내일을 스스로 그리는 힘이 아닙니다.\n하나님을 바라보기에 오늘을 견디는 힘입니다.',
      reflection:'소망은 상황이 좋아져서 생기는\n마음이 아닙니다.\n\n하나님이 여전히 일하고 계심을\n믿는 눈입니다.',
      question:'오늘 하나님께 맡기며 기다릴 소망은 무엇입니까?',
      step:'오늘 감사할 이유 하나를 적으며\n내일을 바라보세요.',
      prayer:'주님, 흔들리는 마음에도\n하늘의 소망으로 저를 붙들어 주소서.'
    }
  ];

  function reduced(){
    try{return window.matchMedia('(prefers-reduced-motion:reduce)').matches;}catch(e){return false;}
  }
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function feedView(){
    if(typeof _verseView==='function')return _verseView(new Date());
    var v=(typeof getVerseForDate==='function')?getVerseForDate(new Date()):{t:'',r:''};
    return {refText:v.r||'',bibleVersion:'KRV',body:v.t||'',tagText:'오늘의 말씀'};
  }
  function displayRef(view){
    var ref=String((view&&view.refText)||'').trim();
    var ver=String((view&&view.bibleVersion)||'KRV').trim()||'KRV';
    return ref?ref+' · '+ver:'';
  }
  function foldPoeticLines(parts, max){
    var lines=parts.slice();
    var i, best, mergeAt;
    while(lines.length>max){
      mergeAt=0;
      best=Infinity;
      for(i=0;i<lines.length-1;i++){
        if(lines[i].length<best){
          best=lines[i].length;
          mergeAt=i;
        }
      }
      if(mergeAt===0){
        lines[0]=lines[0]+' '+lines.splice(1,1)[0];
      }else{
        lines[mergeAt-1]=lines[mergeAt-1]+' '+lines.splice(mergeAt,1)[0];
      }
    }
    return lines;
  }
  function verseLines(text){
    var t=String(text||'').replace(/^["“]+|["”]+$/g,'').trim();
    var parts=t.split(/(?<=(?:니라|리라|버리라|리로다|로다|도다|오라|말고|일에|간구로|것을|함으로))\s+/).map(function(s){return s.trim();}).filter(Boolean);
    if(parts.length>=4)return foldPoeticLines(parts, 5);
    if(parts.length>=2)return parts;
    var words=t.split(/\s+/).filter(Boolean);
    if(words.length>=6){
      var n=Math.ceil(words.length/3);
      var lines=[], i=0;
      for(;i<words.length;i+=n)lines.push(words.slice(i,i+n).join(' '));
      return lines;
    }
    if(t.length<=24)return [t];
    return [t.slice(0,14), t.slice(14,28), t.slice(28)].filter(Boolean);
  }
  function setText(el, text){if(el)el.textContent=text||'';}
  function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');}
  function fillPoem(el, text){
    if(!el)return;
    var raw=String(text||'').trim();
    if(!raw){el.innerHTML='';return;}
    el.innerHTML=raw.split(/\n\s*\n/).map(function(block){
      var lines=block.split('\n').map(function(s){return s.trim();}).filter(Boolean);
      return '<p class="gomna-home-leaf-stanza">'+lines.map(function(s){
        return '<span>'+escapeHtml(s)+'</span>';
      }).join('')+'</p>';
    }).join('');
  }
  function fillSlot(card, sel, text){
    var el=card&&card.querySelector(sel);
    setText(el, text);
  }
  function fillSlots(card, sel, text){
    if(!card)return;
    card.querySelectorAll(sel).forEach(function(el){setText(el, text);});
  }
  function pad2(n){return (n<10?'0':'')+n;}
  function dateKey(d){
    d=d||new Date();
    return d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate());
  }
  function slugRef(ref){return String(ref||'').trim().replace(/\s+/g,'-').replace(/:/g,'-');}
  function parseRef(ref){
    var m=String(ref||'').trim().match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
    if(!m)return null;
    var start=parseInt(m[3],10);
    return {book:m[1].trim(),chapter:parseInt(m[2],10),verse:start,startVerse:start,endVerse:m[4]?parseInt(m[4],10):start};
  }
  function readJson(key, fallback){
    try{var raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch(e){return fallback;}
  }
  function writeJson(key, value){
    try{localStorage.setItem(key, JSON.stringify(value));}catch(e){}
  }
  function lifeThemeById(id){
    var i;
    for(i=0;i<LIFE_THEMES.length;i++){
      if(LIFE_THEMES[i].id===id)return LIFE_THEMES[i];
    }
    return LIFE_THEMES[0];
  }
  function currentLifeTheme(){return lifeThemeById(lifeThemeId);}
  function storyPersonById(id){
    var i;
    for(i=0;i<STORY_PEOPLE.length;i++){
      if(STORY_PEOPLE[i].id===id)return STORY_PEOPLE[i];
    }
    return STORY_PEOPLE[2];
  }
  function currentStoryPerson(){return storyPersonById(storyPersonId);}
  function extrasFor(key){
    var map={
      '베드로전서 5:7':{
        headline:'맡길 곳이 있습니다',
        message:'기도는 상황보다 먼저 마음의 방향을 바꿉니다.',
        meaning:'아직 오지 않은 일까지 오늘의 마음으로 감당하면 오늘 필요한 평안까지 잃게 됩니다.',
        body:'혼자 끌어안고 있던 걱정도\n하나님 앞에서는 내려놓을 수 있습니다.\n\n아직 오지 않은 일까지\n오늘의 마음으로 붙들면\n오늘 필요한 평안까지 잃게 됩니다.\n\n지금 그 한 가지를\n주님께 맡기십시오.',
        related:'시편 55:22',
        remember:'오늘 주어진 하루의 은혜만 받으십시오.',
        meditation:'오늘 무엇을 하나님께 맡기시겠습니까?',
        prayer:'하나님, 혼자 붙들던 염려를 주님께 맡기게 해 주세요.',
        practice:'오늘 통제하려 했던 한 가지를 내려놓으세요.'
      },
      '빌립보서 4:6':{
        headline:'염려 대신 아뢰는 길',
        message:'기도는 상황보다 먼저 마음의 방향을 바꿉니다.',
        meaning:'염려를 붙드는 대신 감사함으로 하나님께 아뢰는 것이 오늘의 길입니다.',
        body:'아무것도 염려하지 말라는 말씀은\n감정을 지우라는 뜻이 아닙니다.\n\n구할 것이 있을 때\n먼저 하나님께 아뢰라는 초대입니다.\n\n오늘 붙들고 있는 염려가 있다면\n감사함으로 그 이름을 부르십시오.\n도움은 기도 다음에 옵니다.',
        related:'베드로전서 5:7',
        remember:'구할 것을 감사함으로 아뢰십시오.',
        meditation:'오늘 무엇을 하나님께 맡기시겠습니까?',
        prayer:'하나님, 염려 대신 기도로 마음을 돌려 주세요.',
        practice:'한 가지 염려를 기도로 바꾸어 보세요.'
      },
      '시편 46:1':{
        headline:'피난처가 있다는 것',
        message:'환난 중에도 하나님은 가장 가까운 피난처입니다.',
        meaning:'힘이 되어 주시는 하나님을 기억하는 것이 오늘의 평안입니다.',
        body:'하나님은\n어려움이 모두 지나간 뒤에\n우리 곁에 오시는 분이 아닙니다.\n\n마음이 흔들리고\n앞이 보이지 않는 바로 그 순간에도\n숨을 곳이 되어 주십니다.\n\n오늘 혼자 견디고 있는 일이 있다면\n조금 내려놓아도 괜찮습니다.\n\n도움은 멀리 있지 않습니다.\n하나님께서 지금도 가까이 계십니다.',
        related:'이사야 41:10',
        remember:'하나님은 환난 중에 만날 큰 도움이십니다.',
        meditation:'오늘 무엇을 하나님께 맡기시겠습니까?',
        prayer:'하나님, 오늘 필요한 도움을 구합니다.',
        practice:'피난처이신 하나님을 한 번 소리 내어 고백하세요.'
      }
    };
    return map[key]||{
      headline:'오늘 이 말씀이 건네는 것',
      message:'기도는 상황보다 먼저 마음의 방향을 바꿉니다.',
      meaning:'하나님은 오늘 필요한 은혜를 오늘 주십니다.',
      body:'하나님은 오늘 필요한 은혜를\n오늘 주십니다.\n\n이 한 구절을 마음에 두고\n하루를 걸어가십시오.',
      remember:'오늘 한 구절만 마음에 남기십시오.',
      meditation:'오늘 무엇을 하나님께 맡기시겠습니까?',
      prayer:'하나님, 이 말씀대로 오늘을 살게 해 주세요.',
      practice:'가장 작은 순종 하나를 걸어가세요.'
    };
  }
  function cardDetail(id, view){
    view=view||feedView();
    var body=String((view&&view.body)||'').trim();
    var key=String((view&&view.refText)||'').trim();
    var day=dateKey(view&&view.selDate);
    var ver=(view&&view.bibleVersion)||'KRV';
    var extra=extrasFor(key);
    if(id==='0'){
      return {
        cardId:'0', contentId:'daily-verse-'+day+'-'+slugRef(key),
        title:'오늘의 메시지', reference:key, translation:ver,
        frontText:body, verse:body,
        headline:extra.headline||extra.message,
        message:extra.body||extra.meaning||extra.message,
        related:extra.related||'',
        audioTarget:key, scriptureTarget:key, commentaryTarget:key
      };
    }
    if(id==='1'){
      var theme=currentLifeTheme();
      return {
        cardId:'1', contentId:'daily-life-'+theme.id+'-'+day,
        title:'오늘의 묵상', theme:theme.name, reference:theme.verseRef, translation:ver,
        headline:theme.title, frontText:theme.teaser, verse:body,
        message:theme.reflection, meditation:theme.step||theme.question, prayer:theme.prayer,
        scriptureTarget:theme.verseRef, commentaryTarget:theme.verseRef
      };
    }
    var person=currentStoryPerson();
    var isDavid=person.id==='david';
    return {
      cardId:'2', contentId:'daily-story-'+person.id+'-'+day,
      title:'성경 속 이야기와 인물', theme:person.name,
      headline:isDavid?'넘어졌지만\n다시 하나님께 돌아온 사람':'',
      frontText:'',
      reference:isDavid?'사무엘상 16:13':'', translation:ver,
      message:isDavid
        ?'다윗은 실패와 두려움 속에서도\n하나님께 다시 돌아가는 사람이었습니다.\n이야기 속 인물의 삶은\n완벽한 기록이 아니라,\n주님께 돌아온 발걸음의 기록입니다.'
        :'그들의 이야기는\n지금도 우리에게 말씀합니다.',
      scriptureTarget:isDavid?'사무엘상 16:13':''
    };
  }
  function cardFromEl(el){return el&&el.closest?el.closest('.gomna-home-card'):null;}
  function isAction(el){
    return el&&el.closest&&el.closest('.gomna-home-act, .gomna-home-related, .gomna-home-ctrl, .gomna-home-ctrl-item, .gomna-home-link, .gomna-home-note-save, .gomna-home-life-rail, .gomna-home-life-chip, .gomna-home-poster-pills, .gomna-home-poster-pill, .gomna-home-poster-arrow, .gomna-home-leaf-cta, .gomna-home-leaf-btn, button, a, [role="button"], input, select, textarea');
  }
  function hideLegacyHome(){
    var nodes=document.querySelectorAll('#homeResumeCard, #today-word-card, .container > .quick-menu, .container > .home-menu-card, .container > .imprint-bottom');
    Array.prototype.forEach.call(nodes, function(el){
      el.setAttribute('hidden','');
      el.setAttribute('aria-hidden','true');
      el.setAttribute('inert','');
      try{el.inert=true;}catch(e){}
      var focusables=el.querySelectorAll('a,button,input,textarea,select,[tabindex]');
      Array.prototype.forEach.call(focusables, function(n){
        n.setAttribute('tabindex','-1');
      });
    });
  }
  function fillCopy(){
    if(!root)return;
    var view=feedView();
    cards.forEach(function(card){
      var id=card.getAttribute('data-card');
      var detail=cardDetail(id, view);
      card.setAttribute('data-content-id', detail.contentId||'');
      fillSlot(card, '.gomna-home-card-inner > [data-ghd-ref]', displayRef(view));
      fillSlot(card, '[data-ghd-open-title]', detail.title);
      fillSlot(card, '[data-ghd-open-ref]', detail.reference||'');
      fillSlots(card, '[data-ghd-life-name]', detail.theme||'');
      fillSlots(card, '[data-ghd-life-ref]', detail.reference||'');
      fillSlots(card, '[data-ghd-story-name]', detail.theme||'');
      fillSlots(card, '[data-ghd-story-ref]', detail.reference||'');
      var heading=card.querySelector('[data-ghd-open-heading]');
      var headingHtml=String(detail.headline||'').split('\n').map(function(s){
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
      }).join('<br>');
      if(heading){
        heading.innerHTML=headingHtml;
        heading.hidden=!detail.headline;
      }
      card.querySelectorAll('[data-ghd-open-ref], [data-ghd-life-ref], [data-ghd-story-ref]').forEach(function(refEl){
        refEl.hidden=!detail.reference;
      });
      var storyCtrl=card.querySelector('.gomna-home-ctrl-story');
      if(storyCtrl)storyCtrl.hidden=!detail.scriptureTarget;
      fillSlot(card, '[data-ghd-open-verse]', detail.verse);
      var poem=card.querySelector('[data-ghd-poem]');
      if(poem)fillPoem(poem, detail.message||detail.meaning||'');
      else fillSlot(card, '[data-ghd-open-message]', detail.message||detail.meaning||'');
      var related=card.querySelector('[data-ghd-open-related]');
      if(related){
        if(detail.related){
          related.hidden=false;
          related.textContent='함께 읽을 말씀 · '+detail.related;
        }else{
          related.hidden=true;
          related.textContent='';
        }
      }
      fillSlot(card, '[data-ghd-open-remember]', detail.remember||'');
      var stepEl=card.querySelector('[data-ghd-open-meditation]');
      if(stepEl&&stepEl.classList.contains('gomna-home-leaf-copy'))fillPoem(stepEl, detail.meditation||'');
      else fillSlot(card, '[data-ghd-open-meditation]', detail.meditation||'');
      var prayEl=card.querySelector('[data-ghd-open-prayer]');
      if(prayEl&&prayEl.classList.contains('gomna-home-leaf-copy'))fillPoem(prayEl, detail.prayer||'');
      else fillSlot(card, '[data-ghd-open-prayer]', detail.prayer||'');
      fillSlot(card, '[data-ghd-open-practice]', detail.practice||'');
      var lines=card.querySelector('[data-ghd-lines]');
      if(lines){
        lines.innerHTML=verseLines(detail.frontText||detail.verse).map(function(s){
          return '<li>'+s.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</li>';
        }).join('');
      }
      var lead=card.querySelector('[data-ghd-lead]');
      if(lead&&detail.frontText){
        lead.innerHTML=String(detail.frontText).split('\n').map(function(s){
          return s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
        }).join('<br>');
      }
      var note=card.querySelector('[data-ghd-note]');
      if(note){
        try{note.value=localStorage.getItem(NOTE_KEY+dateKey())||'';}catch(e){note.value='';}
      }
    });
    var listenTitle=document.getElementById('gomnaHomeListenTitle');
    if(listenTitle)listenTitle.textContent=displayRef(view)||'오늘의 말씀 듣기';
    syncSocial();
    syncGreeting();
    syncLifeChips();
    syncStoryChips();
  }
  function syncLifeChips(){
    if(!root)return;
    root.querySelectorAll('[data-ghd-life-chip]').forEach(function(btn){
      var on=btn.getAttribute('data-ghd-life-chip')===lifeThemeId;
      btn.setAttribute('aria-pressed', on?'true':'false');
      btn.classList.toggle('is-on', on);
    });
    var lifeCard=root.querySelector('.gomna-home-card[data-card="1"]');
    if(lifeCard)lifeCard.setAttribute('data-life-theme', lifeThemeId);
  }
  function syncStoryChips(){
    if(!root)return;
    root.querySelectorAll('[data-ghd-story-chip]').forEach(function(btn){
      var on=btn.getAttribute('data-ghd-story-chip')===storyPersonId;
      btn.setAttribute('aria-pressed', on?'true':'false');
      btn.classList.toggle('is-on', on);
    });
  }
  function selectLifeTheme(id, ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var theme=lifeThemeById(id);
    if(!theme)return;
    preloadLifeThemeImages();
    lifeThemeId=theme.id;
    fillCopy();
    var lifeCard=root&&root.querySelector('.gomna-home-card[data-card="1"]');
    if(lifeCard && !lifeCard.classList.contains('is-open'))openCard(lifeCard);
  }
  function selectStoryPerson(id, ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var person=storyPersonById(id);
    if(!person)return;
    storyPersonId=person.id;
    fillCopy();
  }
  function focusPrayer(card){
    if(!card)return;
    if(!card.classList.contains('is-open'))openCard(card);
    window.setTimeout(function(){
      var el=card.querySelector('[data-ghd-pray-target]');
      if(!el)return;
      try{el.scrollIntoView({block:'nearest', behavior:reduce?'auto':'smooth'});}catch(e){}
      if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','-1');
      try{el.focus({preventScroll:true});}catch(e){try{el.focus();}catch(err){}}
    }, reduce?0:80);
  }
  function safeDisplayName(raw){
    var name=String(raw||'').trim();
    if(!name)return '';
    if(name==='undefined'||name==='null')return '';
    if(name.indexOf('@')!==-1)return '';
    if(name==='계정 연결 전'||name==='내 정보'||name==='로그인')return '';
    return name;
  }
  function syncGreeting(){
    var el=document.getElementById('gomnaHomeHello');
    if(!el)return;
    var name='';
    try{
      if(window.GomnaAuth&&typeof window.GomnaAuth.isSignedIn==='function'&&window.GomnaAuth.isSignedIn()&&typeof window.GomnaAuth.getAccount==='function'){
        var info=window.GomnaAuth.getAccount();
        name=safeDisplayName(info&&info.name);
      }
    }catch(e){}
    el.textContent='';
    if(name){
      var b=document.createElement('b');
      b.textContent=name;
      el.appendChild(b);
      el.appendChild(document.createTextNode('님, 오늘도 평안하세요'));
    }else{
      el.textContent='잠시 머물러 보세요';
    }
  }
  function syncSocial(){
    if(!root)return;
    var likes=readJson(LIKE_KEY,{});
    var comments=readJson(COMMENT_KEY,{});
    var shares=readJson(SHARE_KEY,{});
    var card=root.querySelector('.gomna-home-card[data-card="0"]');
    if(!card)return;
    var id=card.getAttribute('data-content-id');
    var likeOn=!!likes[id];
    var likeBtn=card.querySelector('[data-ghd-like]');
    if(likeBtn)likeBtn.setAttribute('aria-pressed', likeOn?'true':'false');
    var likeN=card.querySelector('[data-ghd-like] .gomna-home-act-count');
    if(likeN)likeN.textContent=String(likeOn?1:0);
    var commentN=card.querySelector('[data-ghd-comment] .gomna-home-act-count');
    if(commentN)commentN.textContent=String((comments[id]||[]).length);
    var shareN=card.querySelector('[data-ghd-share] .gomna-home-act-count');
    if(shareN)shareN.textContent=shares[id]?'공유 '+shares[id]:'공유';
  }
  function applyReaderTarget(card){
    var detail=cardDetail(card&&card.getAttribute('data-card'));
    var t=parseRef(detail&&(detail.scriptureTarget||detail.reference));
    if(typeof setHomeFeedReaderTarget==='function')setHomeFeedReaderTarget(t);
    return t;
  }
  function openCardReader(card, mode){
    applyReaderTarget(card||cards[0]);
    if(typeof openDailyVerse==='function')openDailyVerse(mode);
  }
  function viewH(){return (window.visualViewport&&window.visualViewport.height)||window.innerHeight;}
  function deckScrollY(){return root?root.scrollTop:window.scrollY;}
  function pinDeckScroll(y){
    if(root && Math.abs(root.scrollTop-y)>1)root.scrollTop=y;
  }
  function stepH(){
    var step=root&&root.querySelector('.gomna-home-deck-step');
    return (step&&step.offsetHeight)||Math.round(viewH()*0.72);
  }
  function syncStepSize(){
    if(!root||!stage)return;
    var h=Math.max(280, Math.round((stage.clientHeight||viewH()*0.62)*0.84));
    root.style.setProperty('--ghd-step-h', h+'px');
  }
  function progressFromScroll(){
    if(!root)return 0;
    return clamp(deckScrollY()/stepH(), 0, count-1);
  }
  function lockY(){return stepH();}
  function lockY3(){return stepH()*2;}
  function dirCommitPx(){return Math.max(14, Math.round(stepH()*0.025));}
  function preloadLifeThemeImages(){
    if(lifeImgsPreloaded)return;
    lifeImgsPreloaded=true;
    Object.keys(LIFE_THEME_IMGS).forEach(function(id){
      var img=new Image();
      img.decoding='async';
      img.src=LIFE_THEME_IMGS[id];
    });
  }
  function maybePreloadLife(){
    if(!lifeImgsPreloaded && progressFromScroll()>=0.18)preloadLifeThemeImages();
  }
  function resetStackGate(){
    card2Settled=false;
    card3Settled=false;
    allowCard3=false;
    allowCard1From2=false;
    allowCard2From3=false;
    awaitingDir=false;
    gestureEndedSinceSettle=false;
    settleAnim=false;
    pinching=false;
    lastP=0;
    if(root)root.removeAttribute('data-ghd-card2');
  }
  function gatedProgress(p){
    if(card3Settled && !allowCard2From3 && p<2)return 2;
    if(!allowCard3 && !card3Settled && p>1)return 1;
    if(card2Settled && !allowCard1From2 && p<1)return 1;
    return p;
  }
  function startSettleTo1(){
    card2Settled=false;
    card3Settled=false;
    allowCard3=false;
    allowCard1From2=false;
    allowCard2From3=false;
    awaitingDir=false;
    gestureEndedSinceSettle=!gestureLive;
    settleAnim=true;
    if(settleAnimTimer)clearTimeout(settleAnimTimer);
    settleAnimTimer=setTimeout(function(){settleAnim=false;settleAnimTimer=0;}, SETTLE_MS+40);
    pinDeckScroll(0);
    lastP=0;
    if(root)root.removeAttribute('data-ghd-card2');
    apply(0, false);
  }
  function startSettleTo2(){
    card2Settled=true;
    card3Settled=false;
    allowCard3=false;
    allowCard1From2=false;
    allowCard2From3=false;
    awaitingDir=false;
    gestureEndedSinceSettle=!gestureLive;
    settleAnim=true;
    if(settleAnimTimer)clearTimeout(settleAnimTimer);
    settleAnimTimer=setTimeout(function(){settleAnim=false;settleAnimTimer=0;}, SETTLE_MS+40);
    pinDeckScroll(lockY());
    lastP=1;
    if(root)root.setAttribute('data-ghd-card2','settled');
    apply(1, false);
  }
  function startSettleTo3(){
    card3Settled=true;
    card2Settled=false;
    allowCard3=false;
    allowCard1From2=false;
    allowCard2From3=false;
    awaitingDir=false;
    gestureEndedSinceSettle=!gestureLive;
    settleAnim=true;
    if(settleAnimTimer)clearTimeout(settleAnimTimer);
    settleAnimTimer=setTimeout(function(){settleAnim=false;settleAnimTimer=0;}, SETTLE_MS+40);
    pinDeckScroll(lockY3());
    lastP=2;
    if(root)root.removeAttribute('data-ghd-card2');
    apply(2, false);
  }
  function isTouchPointer(ev){
    return !!(ev && ev.pointerType==='touch');
  }
  function markGestureStart(ev){
    if(isTouchPointer(ev))return;
    if(ev && ev.touches && ev.touches.length>=2){
      pinching=true;
      pinchScrollY=deckScrollY();
      awaitingDir=false;
      return;
    }
    if(pinching)return;
    gestureLive=true;
    if((card2Settled || card3Settled) && gestureEndedSinceSettle)awaitingDir=true;
  }
  function markGestureEnd(ev){
    if(isTouchPointer(ev))return;
    if(ev && ev.touches && ev.touches.length>=1)return;
    if(pinching){
      pinching=false;
      gestureLive=false;
      return;
    }
    gestureLive=false;
    if(card2Settled || card3Settled)gestureEndedSinceSettle=true;
    if(swipeHandled){
      swipeHandled=false;
      return;
    }
    if(card2Settled && !allowCard3 && !allowCard1From2){
      pinDeckScroll(lockY());
      apply(1, true);
    }else if(card3Settled && !allowCard2From3){
      pinDeckScroll(lockY3());
      apply(2, true);
    }else if(allowCard3 && !card3Settled){
      if(progressFromScroll()>=1.08)startSettleTo3();
      else startSettleTo2();
    }else if(allowCard2From3 && !card2Settled){
      if(progressFromScroll()<=1.92)startSettleTo2();
      else startSettleTo3();
    }else if(allowCard1From2 && !card2Settled){
      if(progressFromScroll()<=0.92)startSettleTo1();
      else startSettleTo2();
    }
  }
  function onDeckWheel(){
    markGestureStart();
    if(wheelIdleTimer)clearTimeout(wheelIdleTimer);
    wheelIdleTimer=setTimeout(markGestureEnd, 180);
  }
  function swipePoint(ev){
    if(ev.touches && ev.touches[0])return {x:ev.touches[0].clientX, y:ev.touches[0].clientY};
    if(ev.changedTouches && ev.changedTouches[0])return {x:ev.changedTouches[0].clientX, y:ev.changedTouches[0].clientY};
    if(typeof ev.clientX==='number')return {x:ev.clientX, y:ev.clientY};
    return null;
  }
  function lifeDetailOpen(){
    var card=root&&root.querySelector('.gomna-home-card[data-card="1"]');
    return !!(card && card.classList.contains('is-open'));
  }
  function activeStackIndex(){
    if(card3Settled)return 2;
    if(card2Settled)return 1;
    return Math.round(clamp(lastP, 0, 2));
  }
  function pointInGestureCard(x, y){
    var card=root&&root.querySelector('.gomna-home-card.is-active');
    if(!card)return false;
    if(card.classList.contains('is-open') && card.getAttribute('data-card')!=='1')return false;
    var r=card.getBoundingClientRect();
    return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
  }
  function beginSwipe(x, y, pointerId){
    if(pinching || swipeDrag)return false;
    var lifeOpen=lifeDetailOpen();
    if(flipping && !lifeOpen)return false;
    if(document.documentElement.classList.contains('gomna-home-viewer-open'))return false;
    if(document.querySelector('.ghd-sheet.is-open'))return false;
    if(root.querySelector('.gomna-home-card.is-open:not([data-card="1"])'))return false;
    if(!pointInGestureCard(x, y))return false;
    swipeDrag={
      y:y,
      x:x,
      lastX:x,
      lastY:y,
      t:Date.now(),
      scroll:deckScrollY(),
      swiping:false,
      axis:'',
      pointerId:pointerId,
      lifeOpen:lifeOpen,
      from:activeStackIndex()
    };
    swipeHandled=false;
    pointerMoved=false;
    if(!lifeOpen)markGestureStart();
    return true;
  }
  function applySwipeMove(x, y, ev){
    if(!swipeDrag || pinching)return;
    if(flipping && !swipeDrag.lifeOpen)return;
    var dy=y-swipeDrag.y;
    var dx=x-swipeDrag.x;
    swipeDrag.lastX=x;
    swipeDrag.lastY=y;
    if(!swipeDrag.axis){
      var adx=Math.abs(dx), ady=Math.abs(dy);
      if(adx<AXIS_PX && ady<AXIS_PX)return;
      if(adx>ady*AXIS_RATIO){
        swipeDrag.axis='x';
        swipeDrag.swiping=true;
        pointerMoved=true;
      }else if(ady>adx*AXIS_RATIO){
        if(swipeDrag.lifeOpen){
          swipeDrag=null;
          return;
        }
        swipeDrag.axis='y';
        swipeDrag.swiping=true;
        pointerMoved=true;
      }else{
        return;
      }
    }
    if(ev && ev.cancelable)ev.preventDefault();
    if(swipeDrag.lifeOpen || swipeDrag.axis!=='y')return;
    var maxY=stepH()*(count-1);
    pinDeckScroll(clamp(swipeDrag.scroll-dy, 0, maxY));
  }
  function onSwipeStart(ev){
    if(ev.touches && ev.touches.length!==1){
      swipeDrag=null;
      return;
    }
    var p=swipePoint(ev);
    if(!p)return;
    beginSwipe(p.x, p.y, null);
  }
  function onSwipeMove(ev){
    if(ev.touches && ev.touches.length!==1){
      swipeDrag=null;
      return;
    }
    var p=swipePoint(ev);
    if(!p)return;
    applySwipeMove(p.x, p.y, ev);
  }
  function onPtrStart(ev){
    if(!ev.isPrimary){
      swipeDrag=null;
      return;
    }
    if(ev.pointerType==='mouse' && ev.buttons!==1)return;
    if(beginSwipe(ev.clientX, ev.clientY, ev.pointerId) && root){
      try{root.setPointerCapture(ev.pointerId);}catch(err){}
    }
  }
  function onPtrMove(ev){
    if(!swipeDrag)return;
    if(swipeDrag.pointerId!=null && ev.pointerId!==swipeDrag.pointerId)return;
    applySwipeMove(ev.clientX, ev.clientY, ev);
  }
  function settleTo(i){
    if(i>=2)startSettleTo3();
    else if(i===1)startSettleTo2();
    else startSettleTo1();
  }
  function finishSwipe(from, up, down){
    if(up){
      settleTo(Math.min(2, from+1));
      return;
    }
    if(down){
      settleTo(Math.max(0, from-1));
      return;
    }
    settleTo(from);
  }
  function applyLayerSwipe(left, right){
    if(!left && !right)return;
    if(lifeDetailOpen()){
      if(right){
        var life=root.querySelector('.gomna-home-card[data-card="1"]');
        closeCard(life, false);
      }
      return;
    }
    var i=activeStackIndex();
    if(right){
      if(i>=2)startSettleTo2();
      else if(i===1)startSettleTo1();
      return;
    }
    if(i<=0)startSettleTo2();
    else if(i===1)startSettleTo3();
  }
  function endSwipe(ev){
    if(pinching){
      swipeDrag=null;
      return;
    }
    var drag=swipeDrag;
    swipeDrag=null;
    if(!drag)return;
    if(drag.pointerId!=null && ev && ev.pointerId!=null && ev.pointerId!==drag.pointerId){
      swipeDrag=drag;
      return;
    }
    if(!drag.swiping || !drag.axis){
      markGestureEnd(ev && ev.pointerType==='touch'?null:ev);
      return;
    }
    var p={x:drag.lastX, y:drag.lastY};
    var dt=Math.max(16, Date.now()-drag.t);
    swipeHandled=true;
    if(ev && ev.cancelable)ev.preventDefault();
    if(drag.axis==='x'){
      var dx=p.x-drag.x;
      var velX=dx/dt;
      var left=dx<=-H_SWIPE_PX || velX<=-H_SWIPE_VEL;
      var right=dx>=H_SWIPE_PX || velX>=H_SWIPE_VEL;
      applyLayerSwipe(left, right);
    }else{
      var dy=p.y-drag.y;
      var vel=-dy/dt;
      var up=dy<=-SWIPE_PX || vel>=SWIPE_VEL;
      var down=dy>=SWIPE_PX || vel<=-SWIPE_VEL;
      finishSwipe(drag.from, up, down);
    }
    gestureLive=false;
    if(card2Settled || card3Settled)gestureEndedSinceSettle=true;
    swipeDrag=null;
  }
  function onSwipeEnd(ev){
    endSwipe(ev);
  }
  function onPtrEnd(ev){
    endSwipe(ev);
  }
  function bindDeckSwipe(){
    if(!root || root.getAttribute('data-ghd-swipe-bound')==='1')return;
    root.setAttribute('data-ghd-swipe-bound','1');
    document.addEventListener('touchstart', onSwipeStart, {passive:true, capture:true});
    document.addEventListener('touchmove', onSwipeMove, {passive:false, capture:true});
    document.addEventListener('touchend', onSwipeEnd, {passive:false, capture:true});
    document.addEventListener('touchcancel', onSwipeEnd, {passive:true, capture:true});
    document.addEventListener('pointerdown', onPtrStart, {passive:true, capture:true});
    document.addEventListener('pointermove', onPtrMove, {passive:false, capture:true});
    document.addEventListener('pointerup', onPtrEnd, {passive:false, capture:true});
    document.addEventListener('pointercancel', onPtrEnd, {passive:true, capture:true});
  }
  function layoutNums(){
    var stageH=stage?stage.clientHeight:Math.round(viewH()*0.62);
    return {
      sliver:0,
      peek:0,
      stageH:stageH,
      frontH:Math.max(280, stageH)
    };
  }
  function apply(p, instant){
    p=gatedProgress(p);
    progress=p;
    var L=layoutNums();
    var peek=16;
    var scaleStep=0.08;
    var reserved=p*peek;
    var cardH=Math.max(280, L.stageH-reserved);
    var parkY=L.stageH+32;
    var dur=(instant||reduce)?'none':(settleAnim?'transform '+SETTLE_MS+'ms ease-out':'transform 80ms linear');
    cards.forEach(function(card,i){
      var behind=Math.max(0, p-i);
      var incoming=Math.max(0, i-p);
      var scale=1-(behind*scaleStep);
      var y;
      if(incoming>=1)y=parkY;
      else if(incoming>0)y=reserved+incoming*(parkY-reserved);
      else y=reserved-(behind*peek);
      var active=behind<0.42 && incoming<0.42;
      if(!card.classList.contains('is-open'))card.style.height=cardH+'px';
      card.style.width='100%';
      card.style.transform='translate3d(-50%,'+y+'px,0) scale('+scale+')';
      card.style.transition=dur;
      card.classList.toggle('is-active', active);
      card.classList.toggle('is-behind', !active);
      card.setAttribute('aria-hidden', active?'false':'true');
      if(active)card.setAttribute('tabindex','0');
      else card.removeAttribute('tabindex');
      card.style.zIndex=String(10+i);
      if(!active && !pinching){
        var inner=card.querySelector('.gomna-home-card-inner');
        if(inner && inner.getAttribute('data-ghd-pinch') && inner.getAttribute('data-ghd-pinch')!=='1'){
          inner.setAttribute('data-ghd-pinch','1');
          inner.style.transform='';
        }
      }
    });
    if(root)root.setAttribute('data-ghd-active', String(Math.round(p)));
  }
  function onScroll(){
    if(pinching){
      pinDeckScroll(pinchScrollY);
      return;
    }
    if(!root.querySelector('.gomna-home-card.is-open'))flipping=false;
    if(flipping){
      pinDeckScroll(openScrollY);
      return;
    }
    maybePreloadLife();
    var raw=progressFromScroll();
    var lock=lockY();
    var commit=dirCommitPx();
    if(card3Settled && !allowCard2From3){
      if(awaitingDir){
        if(deckScrollY()<lockY3()-commit){
          allowCard2From3=true;
          card3Settled=false;
          awaitingDir=false;
        }else{
          lastP=2;
          return;
        }
      }else{
        pinDeckScroll(lockY3());
        apply(2, !settleAnim);
        lastP=2;
        return;
      }
    }
    if(card2Settled && !allowCard3 && !allowCard1From2){
      if(awaitingDir){
        var y=deckScrollY();
        if(y>lock+commit){
          allowCard3=true;
          card2Settled=false;
          awaitingDir=false;
          if(root)root.removeAttribute('data-ghd-card2');
        }else if(y<lock-commit){
          allowCard1From2=true;
          card2Settled=false;
          awaitingDir=false;
          if(root)root.removeAttribute('data-ghd-card2');
        }else{
          lastP=1;
          return;
        }
      }else{
        pinDeckScroll(lock);
        apply(1, !settleAnim);
        lastP=1;
        return;
      }
    }
    if(raw<0.12){
      allowCard3=false;
      allowCard1From2=false;
      allowCard2From3=false;
      card2Settled=false;
      card3Settled=false;
      awaitingDir=false;
      if(root)root.removeAttribute('data-ghd-card2');
    }
    if(!card2Settled && !allowCard3 && !card3Settled && lastP<1 && raw>=SETTLE_AT && raw>=lastP){
      startSettleTo2();
      return;
    }
    if(allowCard3 && !card3Settled && raw>=(1+SETTLE_AT) && raw>=lastP){
      startSettleTo3();
      return;
    }
    if(allowCard2From3 && !card2Settled && lastP>1 && raw<=(2-SETTLE_AT) && raw<=lastP){
      startSettleTo2();
      return;
    }
    if(allowCard1From2 && !card2Settled && raw<=0.22 && raw<=lastP){
      startSettleTo1();
      return;
    }
    if(raf)return;
    raf=requestAnimationFrame(function(){
      raf=0;
      lastP=progressFromScroll();
      apply(lastP, false);
    });
  }
  function closeCard(card, skipHistory){
    if(!card||!card.classList.contains('is-open'))return;
    card.classList.remove('is-open');
    card.querySelectorAll('.gomna-home-card-face').forEach(function(face){
      face.classList.toggle('is-shown', face.getAttribute('data-face')==='tease');
    });
    card.style.height='';
    flipping=false;
    document.documentElement.classList.remove('gomna-home-card-open');
    if(!skipHistory && history.state && history.state.ghd==='flip'){
      try{history.back();}catch(e){}
    }
    apply(progressFromScroll(), true);
  }
  function resetHomeToFirstCard(){
    closeSheets();
    closeViewer(true);
    if(cards&&cards.length){
      cards.forEach(function(card){closeCard(card, true);});
    }
    flipping=false;
    resetStackGate();
    if(root)root.scrollTop=0;
    window.scrollTo(0, 0);
    apply(0, true);
    try{
      if(history.state && (history.state.ghd==='flip' || history.state.ghd==='viewer')){
        history.replaceState({}, '', location.href);
      }
    }catch(e){}
  }
  function openCard(card){
    if(!card||!card.classList.contains('is-active')||card.classList.contains('is-open'))return;
    if(Math.abs(progress-cards.indexOf(card))>0.12)return;
    openScrollY=deckScrollY();
    flipping=true;
    card.classList.add('is-open');
    card.querySelectorAll('.gomna-home-card-face').forEach(function(face){
      face.classList.toggle('is-shown', face.getAttribute('data-face')==='open');
    });
    document.documentElement.classList.add('gomna-home-card-open');
    var sc=card.querySelector('.gomna-home-detail-scroll');
    if(sc)sc.scrollTop=0;
    try{history.pushState({ghd:'flip',card:card.getAttribute('data-card')}, '');}catch(e){}
  }
  function toggleOpen(card){
    if(card.classList.contains('is-open'))closeCard(card, false);
    else openCard(card);
  }
  function pinchDist(ev){
    if(!ev.touches || ev.touches.length<2)return 0;
    var a=ev.touches[0], b=ev.touches[1];
    var dx=a.clientX-b.clientX, dy=a.clientY-b.clientY;
    return Math.sqrt(dx*dx+dy*dy);
  }
  function bindPinch(card){
    var id=card.getAttribute('data-card');
    if(id!=='0' && id!=='1')return;
    var inner=card.querySelector('.gomna-home-card-inner');
    if(!inner || inner.getAttribute('data-ghd-pinch-bound')==='1')return;
    inner.setAttribute('data-ghd-pinch-bound','1');
    var startDist=0, base=1;
    card.addEventListener('touchstart', function(ev){
      if(ev.touches.length<2)return;
      if(!card.classList.contains('is-active') && !card.classList.contains('is-open'))return;
      pinching=true;
      pinchScrollY=deckScrollY();
      awaitingDir=false;
      gestureLive=false;
      startDist=pinchDist(ev)||1;
      base=parseFloat(inner.getAttribute('data-ghd-pinch')||'1')||1;
    }, {passive:true});
    card.addEventListener('touchmove', function(ev){
      if(!pinching || ev.touches.length<2)return;
      if(ev.cancelable)ev.preventDefault();
      var s=clamp(base*(pinchDist(ev)/startDist), 1, 1.72);
      inner.setAttribute('data-ghd-pinch', String(s));
      inner.style.transform=s===1?'':'scale('+s+')';
      pinDeckScroll(pinchScrollY);
    }, {passive:false});
    function endPinch(ev){
      if(ev.touches && ev.touches.length>=2)return;
      if(!pinching)return;
      pinching=false;
      var s=parseFloat(inner.getAttribute('data-ghd-pinch')||'1')||1;
      if(s<1.04){
        inner.setAttribute('data-ghd-pinch','1');
        inner.style.transform='';
      }
    }
    card.addEventListener('touchend', endPinch, {passive:true});
    card.addEventListener('touchcancel', endPinch, {passive:true});
  }
  function bindCard(card){
    bindPinch(card);
    var sc=card.querySelector('.gomna-home-detail-scroll');
    if(sc && sc.getAttribute('data-ghd-scroll-bound')!=='1'){
      sc.setAttribute('data-ghd-scroll-bound','1');
      ['touchstart','touchmove','wheel'].forEach(function(type){
        sc.addEventListener(type, function(ev){
          if(ev.touches && ev.touches.length>=2)return;
          ev.stopPropagation();
        },{passive:true});
      });
      sc.addEventListener('scroll', function(){
        scrollQuiet=false;
        if(scrollQuietTimer)clearTimeout(scrollQuietTimer);
        scrollQuietTimer=setTimeout(function(){scrollQuiet=true;}, 160);
      }, {passive:true});
    }
    card.addEventListener('pointerdown', function(ev){
      pointerY=ev.clientY; pointerX=ev.clientX; pointerT=Date.now(); pointerMoved=false;
    });
    card.addEventListener('pointermove', function(ev){
      if(Math.abs(ev.clientY-pointerY)>12||Math.abs(ev.clientX-pointerX)>12)pointerMoved=true;
    });
    card.addEventListener('click', function(ev){
      if(isAction(ev.target)||pointerMoved)return;
      if(Date.now()-pointerT>420)return;
      if(card.classList.contains('is-open')&&!scrollQuiet)return;
      if(card.getAttribute('data-card')==='1' && !card.classList.contains('is-open'))return;
      toggleOpen(card);
    });
    card.addEventListener('keydown', function(ev){
      if(ev.key==='Enter'||ev.key===' '){
        if(isAction(ev.target))return;
        if(card.getAttribute('data-card')==='1' && !card.classList.contains('is-open'))return;
        ev.preventDefault();
        toggleOpen(card);
      }
    });
  }
  function toggleLike(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var card=cardFromEl(ev&&ev.currentTarget);
    var id=card&&card.getAttribute('data-content-id');
    if(!id)return;
    var likes=readJson(LIKE_KEY,{});
    if(likes[id])delete likes[id]; else likes[id]=true;
    writeJson(LIKE_KEY, likes);
    syncSocial();
  }
  function openComments(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var card=cardFromEl(ev&&ev.currentTarget);
    renderComments(card&&card.getAttribute('data-content-id'));
    openSheet('ghdCommentSheet');
  }
  function renderComments(id){
    var list=document.getElementById('ghdCommentList');
    var sheet=document.getElementById('ghdCommentSheet');
    if(sheet)sheet.setAttribute('data-content-id', id||'');
    if(!list)return;
    var items=readJson(COMMENT_KEY,{})[id]||[];
    list.innerHTML='';
    if(!items.length){
      var empty=document.createElement('li');
      empty.textContent='아직 남긴 댓글이 없습니다.';
      list.appendChild(empty);
      return;
    }
    items.forEach(function(item){
      var li=document.createElement('li');
      li.textContent=item;
      list.appendChild(li);
    });
  }
  function saveComment(){
    var sheet=document.getElementById('ghdCommentSheet');
    var input=document.getElementById('ghdCommentInput');
    var id=sheet&&sheet.getAttribute('data-content-id');
    var text=input&&input.value?input.value.trim():'';
    if(!id||!text)return;
    var all=readJson(COMMENT_KEY,{});
    var items=all[id]||[];
    items.push(text);
    all[id]=items;
    writeJson(COMMENT_KEY, all);
    input.value='';
    renderComments(id);
    syncSocial();
  }
  function shareCard(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var card=cardFromEl(ev&&ev.currentTarget)||cards[0];
    var detail=cardDetail(card&&card.getAttribute('data-card'));
    var data={
      title:'은혜의말씀',
      text:(detail.verse||'')+' ('+displayRef(feedView())+')',
      url:location.origin+location.pathname
    };
    var id=card&&card.getAttribute('data-content-id');
    function bump(){
      if(!id)return;
      var all=readJson(SHARE_KEY,{});
      all[id]=(all[id]||0)+1;
      writeJson(SHARE_KEY, all);
      syncSocial();
    }
    if(navigator.share){
      navigator.share(data).then(bump).catch(function(){});
      return;
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(data.text+' '+data.url).then(bump).catch(function(){});
    }
  }
  function relatedCard(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    openCardReader(cardFromEl(ev&&ev.currentTarget)||cards[0],'listen');
  }
  function openSheet(id){
    var sheet=document.getElementById(id);
    if(!sheet)return;
    sheet.hidden=false;
    sheet.classList.add('is-open');
    document.documentElement.classList.add('ghd-sheet-open');
  }
  function closeSheets(){
    document.querySelectorAll('.ghd-sheet.is-open').forEach(function(sheet){
      sheet.classList.remove('is-open');
      sheet.hidden=true;
    });
    document.documentElement.classList.remove('ghd-sheet-open');
  }
  function isiOS(){return /iP(hone|ad|od)/.test(navigator.userAgent||'');}
  function isStandalone(){
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true;
  }
  function notifyStatus(){
    if(!('Notification' in window)){
      return isiOS()
        ? '이 브라우저에서는 시스템 알림 설정을 직접 열 수 없습니다. iPhone에서 매일 말씀 알림을 쓰려면 은혜의말씀을 홈 화면에 추가한 뒤 알림을 허용해야 합니다. 지금은 발송 서버가 없어 구독 완료로 표시하지 않습니다.'
        : '이 브라우저에서는 알림 API를 지원하지 않습니다. 발송 서버도 아직 연결되어 있지 않습니다.';
    }
    if(Notification.permission==='denied'){
      return '알림이 차단되어 있습니다. 권한을 반복 요청하지 않습니다. 기기 설정에서 이 사이트의 알림을 허용한 뒤 다시 확인하세요. 매일 발송 서버는 아직 없습니다.';
    }
    if(isiOS() && !isStandalone()){
      return 'iPhone Safari에서는 홈 화면에 추가한 뒤에야 알림 권한을 요청할 수 있습니다. 공유 버튼 → 홈 화면에 추가를 먼저 진행하세요. 시스템 설정 화면은 웹에서 열 수 없습니다.';
    }
    if(Notification.permission==='granted'){
      return '이 기기에서 알림 권한은 허용되어 있습니다. 매일 말씀을 보내는 서버는 아직 연결되어 있지 않아 구독 완료로 표시하지 않습니다.';
    }
    return '말씀 알림은 매일 오늘의 말씀을 이 기기로 알려 주기 위한 기능입니다. 아래 알림 받기를 누른 뒤에만 권한을 요청합니다.';
  }
  function openNotify(){
    var guide=document.getElementById('ghdNotifyGuide');
    var ask=document.getElementById('ghdNotifyAsk');
    if(guide)guide.textContent=notifyStatus();
    if(ask){
      var canAsk=('Notification' in window) && Notification.permission==='default' && !(isiOS() && !isStandalone());
      ask.hidden=!canAsk;
    }
    openSheet('ghdNotifySheet');
  }
  function askNotify(){
    var guide=document.getElementById('ghdNotifyGuide');
    if(!('Notification' in window)){
      if(guide)guide.textContent=notifyStatus();
      return;
    }
    Notification.requestPermission().then(function(){
      if(guide)guide.textContent=notifyStatus();
      var ask=document.getElementById('ghdNotifyAsk');
      if(ask)ask.hidden=Notification.permission!=='default';
    });
  }
  function openMail(){
    var input=document.getElementById('ghdMailInput');
    var known=document.getElementById('homeAccountPanelEmail');
    var hint=document.getElementById('ghdMailHint');
    if(input&&known&&known.textContent&&!known.hidden)input.value=known.textContent.trim();
    if(hint)hint.textContent='이메일 주소와 수신 동의만 이 기기에서 받을 수 있습니다. 확인 메일·발송 서버는 아직 연결되어 있지 않습니다.';
    openSheet('ghdMailSheet');
  }
  function saveMail(){
    var input=document.getElementById('ghdMailInput');
    var agree=document.getElementById('ghdMailAgree');
    var hint=document.getElementById('ghdMailHint');
    var email=input&&input.value?input.value.trim():'';
    if(!email || email.indexOf('@')<1){
      if(hint)hint.textContent='이메일 주소를 확인해 주세요.';
      return;
    }
    if(agree && !agree.checked){
      if(hint)hint.textContent='수신 동의 후에만 저장할 수 있습니다. 발송은 아직 연결되지 않았습니다.';
      return;
    }
    try{localStorage.setItem('gomna_home_mail_intent', JSON.stringify({email:email,at:Date.now()}));}catch(e){}
    if(hint)hint.textContent='이 기기에 주소만 남겨 두었습니다. 확인 메일이나 구독 완료는 표시하지 않습니다. 발송 백엔드가 필요합니다.';
  }
  function saveNote(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var card=cardFromEl(ev&&ev.currentTarget);
    var note=card&&card.querySelector('[data-ghd-note]');
    if(!note)return;
    try{localStorage.setItem(NOTE_KEY+dateKey(), note.value.trim());}catch(e){}
  }
  function bindActions(){
    root.querySelectorAll('[data-ghd-like]').forEach(function(el){el.addEventListener('click', toggleLike);});
    root.querySelectorAll('[data-ghd-comment]').forEach(function(el){el.addEventListener('click', openComments);});
    root.querySelectorAll('[data-ghd-share]').forEach(function(el){el.addEventListener('click', shareCard);});
    root.querySelectorAll('[data-ghd-related]').forEach(function(el){el.addEventListener('click', relatedCard);});
    root.querySelectorAll('[data-ghd-listen]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        openCardReader(cardFromEl(el),'listen');
      });
    });
    root.querySelectorAll('[data-ghd-read]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        openCardReader(cardFromEl(el),'read');
      });
    });
    root.querySelectorAll('[data-ghd-commentary]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        openCardReader(cardFromEl(el),'commentary');
      });
    });
    root.querySelectorAll('[data-ghd-note-save]').forEach(function(el){el.addEventListener('click', saveNote);});
    root.querySelectorAll('[data-ghd-life-chip]').forEach(function(el){
      el.addEventListener('click', function(ev){
        selectLifeTheme(el.getAttribute('data-ghd-life-chip'), ev);
      });
    });
    root.querySelectorAll('[data-ghd-story-chip]').forEach(function(el){
      el.addEventListener('click', function(ev){
        selectStoryPerson(el.getAttribute('data-ghd-story-chip'), ev);
      });
    });
    root.querySelectorAll('[data-ghd-open-arrow]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        openCard(cardFromEl(el));
      });
    });
    root.querySelectorAll('[data-ghd-pray]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        focusPrayer(cardFromEl(el));
      });
    });
    root.querySelectorAll('[data-ghd-back]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        closeCard(cardFromEl(el), false);
      });
    });
    document.querySelectorAll('[data-ghd-notify]').forEach(function(el){el.addEventListener('click', function(ev){ev.preventDefault();openNotify();});});
    document.querySelectorAll('[data-ghd-mail]').forEach(function(el){el.addEventListener('click', function(ev){ev.preventDefault();openMail();});});
    document.querySelectorAll('[data-ghd-sheet-close]').forEach(function(el){el.addEventListener('click', closeSheets);});
    var ask=document.getElementById('ghdNotifyAsk');
    if(ask)ask.addEventListener('click', askNotify);
    var mailSend=document.getElementById('ghdMailSend');
    if(mailSend)mailSend.addEventListener('click', saveMail);
    var commentSave=document.getElementById('ghdCommentSave');
    if(commentSave)commentSave.addEventListener('click', saveComment);
    document.querySelectorAll('[data-ghd-walk]').forEach(function(el){
      el.addEventListener('click', function(){
        var act=el.getAttribute('data-ghd-walk');
        if(act==='read')openCardReader(cards[0],'read');
        else if(act==='commentary')openCardReader(cards[0],'commentary');
        else if(act==='listen')openCardReader(cards[0],'listen');
        else if(act==='respond'){
          var dest=root.offsetTop + 2*stepH();
          window.scrollTo({top:dest, behavior:reduce?'auto':'smooth'});
          window.setTimeout(function(){openCard(cards[2]);}, reduce?0:420);
        }
      });
    });
    var media=document.getElementById('gomnaHomeMedia');
    if(media)media.addEventListener('click', openViewer);
    var viewerClose=document.getElementById('gomnaHomeViewerClose');
    if(viewerClose)viewerClose.addEventListener('click', function(){closeViewer(false);});
    document.querySelectorAll('[data-ghd-nav]').forEach(function(el){
      el.addEventListener('click', function(ev){
        var act=el.getAttribute('data-ghd-nav');
        if(act==='find')return;
        ev.preventDefault();
        if(act==='home')resetHomeToFirstCard();
        else if(act==='bible')openHomeBiblePicker();
        else if(act==='media'){
          window.scrollTo({top:0, behavior:reduce?'auto':'smooth'});
        }else if(act==='me' && typeof handleHomeAccountBtn==='function')handleHomeAccountBtn();
      });
    });
  }
  function openViewer(){
    var v=document.getElementById('gomnaHomeViewer');
    if(!v||v.classList.contains('is-open'))return;
    v.hidden=false;
    v.classList.add('is-open');
    document.documentElement.classList.add('gomna-home-viewer-open');
    try{history.pushState({ghd:'viewer'}, '');}catch(e){}
  }
  function closeViewer(skipHistory){
    var v=document.getElementById('gomnaHomeViewer');
    if(!v||!v.classList.contains('is-open'))return;
    v.classList.remove('is-open');
    v.hidden=true;
    document.documentElement.classList.remove('gomna-home-viewer-open');
    if(!skipHistory && history.state && history.state.ghd==='viewer'){
      try{history.back();}catch(e){}
    }
  }
  function ensureHomeBiblePicker(){
    var overlay=document.getElementById('homeBiblePickerOverlay');
    var frame;
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.id='homeBiblePickerOverlay';
    overlay.hidden=true;
    overlay.setAttribute('aria-hidden','true');
    frame=document.createElement('iframe');
    frame.id='homeBiblePickerFrame';
    frame.title='성경 선택';
    frame.setAttribute('allowtransparency','true');
    frame.src='reader.html?source=home-bible-picker';
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    return overlay;
  }
  function preloadHomeBiblePicker(){
    ensureHomeBiblePicker();
  }
  function markHomeBiblePickerReady(){
    var overlay=document.getElementById('homeBiblePickerOverlay');
    if(!overlay)return;
    overlay.setAttribute('data-ready','1');
    overlay.classList.add('is-ready');
    overlay.classList.remove('is-loading');
  }
  function tellHomeBiblePicker(action){
    var frame=document.getElementById('homeBiblePickerFrame');
    try{
      if(frame&&frame.contentWindow){
        frame.contentWindow.postMessage({source:'gomna-home-bible-picker',action:action},location.origin);
      }
    }catch(e){ /* ignore */ }
  }
  function openHomeBiblePicker(){
    var overlay=ensureHomeBiblePicker();
    overlay.hidden=false;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden','false');
    document.documentElement.classList.add('home-bible-picker-open');
    if(overlay.getAttribute('data-ready')==='1'){
      overlay.classList.add('is-ready');
      overlay.classList.remove('is-loading');
      tellHomeBiblePicker('open');
    }else{
      overlay.classList.add('is-loading');
      overlay.classList.remove('is-ready');
    }
    try{
      if(!(history.state&&history.state.ghd==='bible-picker')){
        history.pushState({ghd:'bible-picker'},'');
      }
    }catch(e){}
  }
  function closeHomeBiblePicker(skipHistory){
    var overlay=document.getElementById('homeBiblePickerOverlay');
    if(!overlay||overlay.hidden){
      document.documentElement.classList.remove('home-bible-picker-open');
      return;
    }
    overlay.hidden=true;
    overlay.classList.remove('is-open','is-loading');
    overlay.setAttribute('aria-hidden','true');
    document.documentElement.classList.remove('home-bible-picker-open');
    tellHomeBiblePicker('close-ui');
    if(!skipHistory && history.state && history.state.ghd==='bible-picker'){
      try{history.back();}catch(e){}
    }
  }
  function init(){
    root=document.getElementById('gomnaHomeFeed');
    stage=document.getElementById('gomnaHomeFeedStage');
    if(!root||!stage||root.getAttribute('data-ghd-bound')==='1')return;
    root.setAttribute('data-ghd-bound','1');
    document.body.classList.add('gomna-home-deck-on');
    hideLegacyHome();
    reduce=reduced();
    cards=Array.prototype.slice.call(root.querySelectorAll('.gomna-home-card[data-ghd-deck="home"]'));
    count=3;
    fillCopy();
    syncGreeting();
    cards.forEach(bindCard);
    bindActions();
    syncStepSize();
    apply(0, true);
    window.requestAnimationFrame(function(){syncStepSize();apply(progressFromScroll(), true);});
    bindDeckSwipe();
    root.addEventListener('scroll', onScroll, {passive:true});
    root.addEventListener('touchstart', markGestureStart, {passive:true});
    root.addEventListener('touchend', markGestureEnd, {passive:true});
    root.addEventListener('touchcancel', markGestureEnd, {passive:true});
    root.addEventListener('pointerdown', markGestureStart, {passive:true});
    root.addEventListener('pointerup', markGestureEnd, {passive:true});
    root.addEventListener('pointercancel', markGestureEnd, {passive:true});
    root.addEventListener('wheel', onDeckWheel, {passive:true});
    window.addEventListener('scroll', onScroll, {passive:true});
    window.addEventListener('resize', function(){syncStepSize();apply(progressFromScroll(), true);}, {passive:true});
    window.addEventListener('keydown', function(ev){
      if(ev.key==='Escape'){
        closeHomeBiblePicker(false);
        closeViewer(false);
        var open=root.querySelector('.gomna-home-card.is-open');
        if(open)closeCard(open, false);
        closeSheets();
      }
    });
    window.addEventListener('popstate', function(){
      closeHomeBiblePicker(true);
      closeViewer(true);
      var open=root.querySelector('.gomna-home-card.is-open');
      if(open)closeCard(open, true);
      closeSheets();
    });
    window.addEventListener('message', function(ev){
      var data=ev.data;
      if(ev.origin!==location.origin)return;
      if(!data||data.source!=='gomna-home-bible-picker')return;
      if(data.action==='ready')markHomeBiblePickerReady();
      if(data.action==='close')closeHomeBiblePicker(false);
    });
    window.setTimeout(preloadHomeBiblePicker, 280);
    if('requestIdleCallback' in window)window.requestIdleCallback(function(){preloadLifeThemeImages();},{timeout:900});
    else window.setTimeout(preloadLifeThemeImages, 480);
    var prev=window.__gomnaOnLangApplied;
    window.__gomnaOnLangApplied=function(){
      if(typeof prev==='function')try{prev();}catch(e){}
      fillCopy();
    };
  }

  window.GomnaHomeFeed={init:init,sync:fillCopy,syncSocial:syncSocial,syncGreeting:syncGreeting};
  window.toggleHomeDailyLike=toggleLike;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded', init);
  else init();
})();
