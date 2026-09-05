/* GOMNA HOME 3-CARD STACK 20260904
   Backup 로직(fillCopy, flip, social, reader target)을 3장만 쓰도록 재구성.
   묵상 패널·8장 덱·휠 가로채기는 복구하지 않는다. */
(function(){
  var root, stage, cards=[], count=3, progress=0, raf=0, reduce=false;
  var pointerY=0, pointerX=0, pointerT=0, pointerMoved=false, scrollQuiet=true, scrollQuietTimer=0;
  var openScrollY=0, flipping=false;
  var LIKE_KEY='gomna_daily_verse_likes';
  var COMMENT_KEY='gomna_daily_verse_comments';
  var SHARE_KEY='gomna_daily_verse_shares';
  var NOTE_KEY='gomna_home_response_';

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
  function fillSlot(card, sel, text){
    var el=card&&card.querySelector(sel);
    setText(el, text);
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
      return {
        cardId:'1', contentId:'daily-message-'+day+'-'+slugRef(key),
        title:'오늘의 메시지', reference:key, translation:ver,
        frontText:extra.message, verse:body,
        message:extra.meaning+'\n\n'+extra.remember,
        meaning:extra.meaning, remember:extra.remember,
        scriptureTarget:key, commentaryTarget:key
      };
    }
    return {
      cardId:'2', contentId:'daily-response-'+day+'-'+slugRef(key),
      title:'오늘의 응답', reference:key, translation:ver,
      frontText:extra.meditation, verse:body,
      meditation:extra.meditation, prayer:extra.prayer, practice:extra.practice,
      scriptureTarget:key
    };
  }
  function cardFromEl(el){return el&&el.closest?el.closest('.gomna-home-card'):null;}
  function isAction(el){
    return el&&el.closest&&el.closest('.gomna-home-act, .gomna-home-related, .gomna-home-ctrl, .gomna-home-ctrl-item, .gomna-home-link, .gomna-home-note-save, button, a, input, textarea');
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
      fillSlot(card, '[data-ghd-open-heading]', detail.headline||'');
      fillSlot(card, '[data-ghd-open-verse]', detail.verse);
      fillSlot(card, '[data-ghd-open-message]', detail.message||detail.meaning||'');
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
      fillSlot(card, '[data-ghd-open-meditation]', detail.meditation||'');
      fillSlot(card, '[data-ghd-open-prayer]', detail.prayer||'');
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
  function stepH(){
    var step=root&&root.querySelector('.gomna-home-deck-step');
    return (step&&step.offsetHeight)||Math.round(viewH()*0.72);
  }
  function progressFromScroll(){
    if(!root)return 0;
    var y=Math.max(0, window.scrollY-root.offsetTop);
    return clamp(y/stepH(), 0, count-1);
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
    progress=0;
    cards.forEach(function(card,i){
      var front=i===0;
      if(!card.classList.contains('is-open'))card.style.height='';
      card.style.width='100%';
      card.style.transform=front?'translate3d(-50%,0,0)':'translate3d(-50%,140%,0)';
      card.style.transition=(instant||reduce)?'none':'transform 80ms linear';
      card.classList.toggle('is-active', front);
      card.classList.toggle('is-behind', !front);
      card.setAttribute('aria-hidden', front?'false':'true');
      if(front)card.setAttribute('tabindex','0');
      else card.removeAttribute('tabindex');
      card.style.zIndex=front?'12':'8';
    });
  }
  function onScroll(){
    if(!root.querySelector('.gomna-home-card.is-open'))flipping=false;
    if(flipping){
      if(Math.abs(window.scrollY-openScrollY)>1)window.scrollTo(0, openScrollY);
      return;
    }
    if(raf)return;
    raf=requestAnimationFrame(function(){
      raf=0;
      apply(progressFromScroll(), false);
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
    openScrollY=window.scrollY;
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
  function bindCard(card){
    var sc=card.querySelector('.gomna-home-detail-scroll');
    if(sc && sc.getAttribute('data-ghd-scroll-bound')!=='1'){
      sc.setAttribute('data-ghd-scroll-bound','1');
      ['touchstart','touchmove','wheel'].forEach(function(type){
        sc.addEventListener(type, function(ev){ev.stopPropagation();},{passive:true});
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
      toggleOpen(card);
    });
    card.addEventListener('keydown', function(ev){
      if(ev.key==='Enter'||ev.key===' '){
        if(isAction(ev.target))return;
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
    count=1;
    fillCopy();
    syncGreeting();
    cards.forEach(bindCard);
    bindActions();
    apply(0, true);
    window.addEventListener('scroll', onScroll, {passive:true});
    window.addEventListener('resize', function(){apply(progressFromScroll(), true);}, {passive:true});
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
