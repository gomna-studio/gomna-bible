/*! 은혜의말씀 — 묵상 UI */
(function(){
  'use strict';

  var Data=window.GomnaMeditationData;
  var Store=window.GomnaMeditationStore;
  var app=document.getElementById('gmdApp');
  var reduce=false;
  try{reduce=window.matchMedia('(prefers-reduced-motion:reduce)').matches;}catch(e){}

  function el(html){
    var d=document.createElement('div');
    d.innerHTML=String(html||'').trim();
    return d.firstElementChild;
  }
  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function refHtml(ref){
    var r=esc(ref||'');
    if(!r)return '';
    return r+' <span class="gmd-krv">KRV</span>';
  }
  function text(node, s){if(node)node.textContent=s==null?'':String(s);}
  function params(){
    try{return new URLSearchParams(location.search);}catch(e){return new URLSearchParams();}
  }
  function go(next, replace){
    var u=new URL(location.href);
    var p=new URLSearchParams();
    Object.keys(next||{}).forEach(function(k){
      if(next[k]==null||next[k]==='')return;
      p.set(k, String(next[k]));
    });
    var qs=p.toString();
    var href=u.pathname+(qs?('?'+qs):'');
    if(replace)history.replaceState({gmd:1}, '', href);
    else history.pushState({gmd:1}, '', href);
    render();
  }

  function badgeAsset(b){
    return (b&&b.image)||'assets/meditation/badges/badge-001-first-step.png';
  }
  function badgeImg(b, on){
    return '<span class="gmd-badge'+(on?'':' is-off')+'"><img src="'+esc(badgeAsset(b))+'" alt=""></span>';
  }

  function imgTag(src, pos, eager, alt){
    return '<img src="'+esc(src)+'" alt="'+esc(alt||'')+'" '+(eager?'':'loading="lazy" decoding="async"')+(eager?' fetchpriority="high"':' decoding="async"')+' style="object-position:'+esc(pos||'center')+'">';
  }

  function currentModel(){
    var p=params();
    var date=p.get('date')||Store.todayKey();
    if(date>Store.todayKey())date=Store.todayKey();
    return Data.resolve({date:date, theme:p.get('theme')||''});
  }

  function viewName(){
    var p=params();
    if(p.get('view'))return p.get('view');
    return 'session';
  }

  function snapshot(model){
    return {
      verseRef:model.verseRef,
      verseText:model.verseText,
      themeKey:model.theme,
      title:model.title
    };
  }

  function renderMain(){
    return renderSession();
  }

  function companionBlock(model){
    var walkTotal=Store.totalDays();
    var monthN=Store.monthCount(model.date);
    var streakN=Store.streak();
    var prog=Store.progressCopy();
    var week=Store.weekDays(model.date);
    var weekHtml=week.map(function(d){
      return '<span class="'+(d.done?'is-on':'')+(d.isToday?' is-today':'')+'"><i class="gmd-dot" aria-hidden="true"></i>'+esc(d.label)+'</span>';
    }).join('');
    return '<section class="gmd-step" id="gmdWalkPreview">'+
      '<h2>말씀 동행 기록</h2>'+
      '<div class="gmd-walk-stats">'+
        '<div><b>'+walkTotal+'일</b><span>누적 완료일</span></div>'+
        '<div><b>'+monthN+'일</b><span>이번 달</span></div>'+
        '<div><b>'+streakN+'일</b><span>현재 연속</span></div>'+
      '</div>'+
      '<div class="gmd-week" aria-label="이번 주 말씀 동행">'+weekHtml+'</div>'+
      '<p class="gmd-progress">'+esc(prog.text)+'</p>'+
      '<p class="gmd-progress">연속이 끊겨도 누적 완료일은 사라지지 않습니다.</p>'+
      '<button type="button" class="gmd-link" data-gmd-view="walk">말씀 동행 자세히 보기 →</button>'+
    '</section>';
  }

  function badgesBlock(){
    var unlocked=Store.unlockedBadges();
    var unlockedIds={};
    unlocked.forEach(function(b){unlockedIds[b.id]=true;});
    var badges=Store.BADGES.map(function(b){
      var on=!!unlockedIds[b.id];
      return '<button type="button" class="gmd-badge-btn'+(on?'':' is-off')+'" data-gmd-badge="'+esc(b.id)+'" aria-label="'+esc(b.name)+(on?' 획득':' 미획득')+'">'+
        badgeImg(b,on)+'<span>'+esc(b.name)+'</span></button>';
    }).join('');
    return '<section class="gmd-step" id="gmdBadges"><h2>배지</h2><div class="gmd-badges">'+badges+'</div></section>';
  }

  function calendarBlock(){
    ensureCal();
    var cells=Store.monthGrid(calCursor.y, calCursor.m);
    var head=['월','화','수','목','금','토','일'].map(function(s){return '<b>'+s+'</b>';}).join('');
    var body=cells.map(function(c){
      if(!c)return '<i></i>';
      var cls=(c.done?' is-done':'')+(c.isToday?' is-today':'')+(c.isFuture?' is-future':'');
      return '<button type="button" class="'+cls.trim()+'" data-gmd-cal="'+esc(c.date)+'" '+(c.isFuture?'disabled':'')+' aria-label="'+esc(c.date)+'">'+c.day+'</button>';
    }).join('');
    return '<section class="gmd-step" id="gmdCalendar">'+
      '<div class="gmd-cal-head">'+
        '<button type="button" class="gmd-cal-nav" id="gmdCalPrev" aria-label="이전 달">←</button>'+
        '<h2>'+calCursor.y+'년 '+calCursor.m+'월</h2>'+
        '<button type="button" class="gmd-cal-nav" id="gmdCalNext" aria-label="다음 달">→</button>'+
      '</div><div class="gmd-cal">'+head+body+'</div>'+
    '</section>';
  }

  function historyBlock(){
    var past=Store.recentCompleted(8);
    var html=past.length?past.map(function(r){
      var note=String(r.note||'').trim();
      return '<button type="button" class="gmd-row gmd-row-plain" data-gmd-date="'+esc(r.date)+'">'+
        '<span><strong>'+esc(Data.formatDateLabel(r.date))+'</strong>'+
        '<span>'+esc(r.verseRef||'')+(note?(' · '+note.slice(0,48)):'')+' · 완료</span></span></button>';
    }).join(''):'<p class="gmd-empty">아직 마친 묵상이 없습니다.</p>';
    return '<section class="gmd-step" id="gmdHistory"><h2>지난 묵상 회고</h2><div class="gmd-list">'+html+'</div>'+
      (past.length?'<button type="button" class="gmd-link" data-gmd-view="history">지난 묵상 모두 보기 →</button>':'')+
    '</section>';
  }

  function commentaryUrl(model){
    model=model||{};
    var qs=[];
    function add(k,v){
      if(v==null||v==='')return;
      qs.push(encodeURIComponent(k)+'='+encodeURIComponent(String(v)));
    }
    var verse=model.startVerse!=null&&model.startVerse!==''?model.startVerse:model.verse;
    add('book', model.book);
    add('chapter', model.chapter);
    add('verse', verse);
    add('verseStart', verse);
    add('commentary','1');
    add('source','meditation-commentary');
    return 'reader.html?'+qs.join('&');
  }

  function renderSession(){
    var model=currentModel();
    if(model.isFuture)model=Data.resolve({date:Store.todayKey()});
    var rec=Store.dayRecord(model.date)||{};
    var readUrl=Data.readerUrl(model,'read');
    var listenUrl=Data.readerUrl(model,'listen');
    var commUrl=commentaryUrl(model);
    var prose=model.reflectionParts.map(function(p){return '<p>'+esc(p)+'</p>';}).join('');
    var qs=model.questions.map(function(q){return '<p class="gmd-q">'+esc(q)+'</p>';}).join('');
    var prayerLines=esc(model.prayer).split('\n').join('<br>');
    var done=!!rec.meditationCompleted;
    return '<div class="gmd-wrap gmd-session">'+
      '<header class="gmd-header"><h1>묵상</h1><p>'+esc(model.dateLabel)+'</p></header>'+
      '<section class="gmd-step" id="gmdStepWord">'+
        '<p class="gmd-kicker gmd-kicker-ink">오늘의 말씀</p>'+
        '<p class="gmd-ref">'+refHtml(model.verseRef)+'</p>'+
        '<p class="gmd-verse">'+esc(model.verseText)+'</p>'+
        '<div class="gmd-actions">'+
          '<a class="gmd-btn" href="'+esc(readUrl)+'">말씀 읽기</a>'+
          '<a class="gmd-btn" href="'+esc(listenUrl)+'">말씀 듣기</a>'+
        '</div>'+
      '</section>'+
      '<section class="gmd-step gmd-pause">'+
        '<h2>잠시 머물기</h2>'+
        '<p>말씀을 읽거나 들은 뒤, 잠시 이 한 구절 앞에 머물러 보세요.</p>'+
      '</section>'+
      '<section class="gmd-step">'+
        '<h2>오늘의 묵상</h2>'+
        '<div class="gmd-prose">'+prose+'</div>'+
        '<a class="gmd-link" href="'+esc(commUrl)+'" data-gmd-commentary="1">말씀풀이 더 깊이 보기 →</a>'+
      '</section>'+
      '<section class="gmd-step">'+
        '<h2>묵상 질문</h2>'+qs+
        '<p class="gmd-status">짧은 메모</p>'+
        '<textarea class="gmd-area" id="gmdQ" rows="3" inputmode="text" enterkeyhint="done" placeholder="마음에 머문 한 줄을 남겨보세요.">'+esc(rec.questionNote||'')+'</textarea>'+
      '</section>'+
      '<section class="gmd-step">'+
        '<h2>오늘의 한 걸음</h2>'+
        '<p class="gmd-prose">'+esc(model.action)+'</p>'+
      '</section>'+
      '<section class="gmd-step gmd-pray">'+
        '<p class="gmd-pray-rule">— 오늘의 기도 —</p>'+
        '<p class="gmd-verse">'+prayerLines+'</p>'+
      '</section>'+
      '<section class="gmd-step">'+
        '<h2>오늘 내 마음 기록</h2>'+
        '<textarea class="gmd-area" id="gmdNote" inputmode="text" enterkeyhint="done" placeholder="지금 마음에 떠오르는 것을 자유롭게 적어보세요.">'+esc(rec.note||'')+'</textarea>'+
        '<div class="gmd-actions" style="margin-top:10px"><button type="button" class="gmd-btn" id="gmdSave">저장</button></div>'+
        '<p class="gmd-status" id="gmdSaveStatus"></p>'+
      '</section>'+
      '<div class="gmd-actions" style="margin:8px 0 16px">'+
        '<button type="button" class="gmd-btn gmd-btn-primary" id="gmdFinish">'+(done?'오늘의 묵상 완료 ✓':'오늘의 묵상 마치기')+'</button>'+
      '</div>'+
      companionBlock(model)+
      badgesBlock()+
      calendarBlock()+
      historyBlock()+
      '<section class="gmd-step">'+
        '<h2>9종 말씀풀이</h2>'+
        '<p class="gmd-progress">더 깊이 보고 싶을 때, 기존 말씀풀이로 이어갑니다.</p>'+
        '<a class="gmd-link" href="'+esc(commUrl)+'" data-gmd-commentary="1">말씀풀이 더 깊이 보기 →</a>'+
      '</section>'+
    '</div>';
  }

  function renderDone(){
    var n=Store.weekDoneCount();
    var week=Store.weekDays();
    var weekHtml=week.map(function(d){
      return '<span class="'+(d.done?'is-on':'')+(d.isToday?' is-today':'')+'"><i class="gmd-dot"></i>'+esc(d.label)+'</span>';
    }).join('');
    return '<div class="gmd-wrap gmd-done">'+
      '<header class="gmd-header"><h2>오늘도 말씀과 함께했습니다.</h2>'+
      '<p>이번 주 '+n+'일 말씀과 함께했어요</p></header>'+
      '<div class="gmd-week" style="max-width:320px;margin:18px auto">'+weekHtml+'</div>'+
      '<div class="gmd-actions" style="justify-content:center">'+
        '<button type="button" class="gmd-btn gmd-btn-primary" data-gmd-view="main">묵상으로</button>'+
      '</div></div>';
  }

  var calCursor={y:0,m:0};
  function ensureCal(){
    var now=new Date();
    if(!calCursor.y){calCursor.y=now.getFullYear();calCursor.m=now.getMonth()+1;}
  }

  function renderWalk(){
    ensureCal();
    var total=Store.totalDays();
    var monthN=Store.monthCount(Store.todayKey());
    var streakN=Store.streak();
    var prog=Store.progressCopy();
    var unlocked=Store.unlockedBadges();
    var unlockedIds={};
    unlocked.forEach(function(b){unlockedIds[b.id]=true;});
    var badges=Store.BADGES.map(function(b){
      var on=!!unlockedIds[b.id];
      return '<button type="button" class="gmd-badge-btn'+(on?'':' is-off')+'" data-gmd-badge="'+esc(b.id)+'">'+
        badgeImg(b,on)+'<span>'+esc(b.name)+'</span></button>';
    }).join('');
    return '<div class="gmd-wrap">'+
      '<button type="button" class="gmd-back" data-gmd-view="main">← 묵상</button>'+
      '<header class="gmd-header"><h1>말씀 동행</h1><p>하루를 놓쳐도 누적된 동행은 사라지지 않습니다.</p></header>'+
      '<div class="gmd-walk"><div class="gmd-walk-stats">'+
        '<div><b>'+total+'일</b><span>누적 완료일</span></div>'+
        '<div><b>'+monthN+'일</b><span>이번 달</span></div>'+
        '<div><b>'+streakN+'일</b><span>현재 연속</span></div>'+
      '</div><p class="gmd-progress">'+esc(prog.text)+'</p></div>'+
      calendarBlock()+
      '<section class="gmd-section"><h2>말씀 동행 배지</h2><div class="gmd-badges">'+badges+'</div></section></div>';
  }

  function renderHistory(){
    var past=Store.recentCompleted(365);
    var html=past.length?past.map(function(r){
      var note=String(r.note||'').trim();
      return '<button type="button" class="gmd-row gmd-row-plain" data-gmd-date="'+esc(r.date)+'">'+
        '<span><strong>'+esc(Data.formatDateLabel(r.date))+'</strong>'+
        '<span>'+esc(r.verseRef||'')+(note?(' · '+note.slice(0,72)):'')+' · 완료</span></span></button>';
    }).join(''):'<p class="gmd-empty">아직 마친 묵상이 없습니다.</p>';
    return '<div class="gmd-wrap"><button type="button" class="gmd-back" data-gmd-view="main">← 묵상</button>'+
      '<header class="gmd-header"><h1>지난 묵상</h1></header><div class="gmd-list">'+html+'</div></div>';
  }

  function renderNotes(){
    var notes=Store.notesList();
    var html=notes.length?notes.map(function(r){
      return '<button type="button" class="gmd-note" data-gmd-note="'+esc(r.date)+'">'+
        imgTag(Data.themeImage(r.themeKey),Data.themePos(r.themeKey),false,'')+
        '<span><strong>'+esc(Data.formatDateLabel(r.date))+' · '+esc(r.verseRef||'')+'</strong><span>'+esc(String(r.note||'').slice(0,120))+'</span></span></button>';
    }).join(''):'<p class="gmd-empty">아직 적어 둔 마음이 없습니다.</p>';
    return '<div class="gmd-wrap"><button type="button" class="gmd-back" data-gmd-view="main">← 묵상</button>'+
      '<header class="gmd-header"><h1>나의 묵상</h1><p>이 기기의 이 계정에만 보입니다.</p></header><div class="gmd-list">'+html+'</div></div>';
  }

  function renderNoteDetail(date){
    var rec=Store.dayRecord(date)||{};
    var model=Data.resolve({date:date, theme:rec.themeKey||''});
    if(rec.verseRef)model.verseRef=rec.verseRef;
    if(rec.verseText)model.verseText=rec.verseText;
    return '<div class="gmd-wrap">'+
      '<button type="button" class="gmd-back" data-gmd-view="notes">← 나의 묵상</button>'+
      '<header class="gmd-header"><h1>'+esc(Data.formatDateLabel(date))+'</h1><p>'+esc(rec.verseRef||model.verseRef)+'</p></header>'+
      '<section class="gmd-step"><p class="gmd-verse">'+esc(rec.verseText||model.verseText)+'</p></section>'+
      '<section class="gmd-step"><h2>내 마음 기록</h2><p class="gmd-prose">'+esc(rec.note||'기록한 마음이 없습니다.')+'</p></section>'+
      '<p class="gmd-progress">'+(rec.meditationCompleted?'완료':'미완료')+'</p>'+
    '</div>';
  }

  function openBadgeSheet(id){
    var b=Store.BADGES.filter(function(x){return x.id===id;})[0];
    if(!b)return;
    var earned=Store.badgeEarnedOn(id);
    var unlocked=Store.totalDays()>=b.days;
    var recent=Store.recentCompleted(b.days).slice(0,8);
    var list=recent.map(function(r){
      return '<p class="gmd-progress">'+esc(Data.formatDateLabel(r.date))+' · '+esc(r.title||r.verseRef||'')+'</p>';
    }).join('');
    var sheet=document.getElementById('gmdSheet');
    if(!sheet)return;
    sheet.innerHTML='<div class="gmd-sheet-card" role="dialog" aria-labelledby="gmdBadgeTitle">'+
      '<button type="button" class="gmd-back" data-gmd-close-sheet>닫기</button>'+
      badgeImg(b,unlocked)+
      '<h2 id="gmdBadgeTitle">'+esc(b.name)+'</h2>'+
      '<p class="gmd-progress">누적 '+b.days+'일 말씀 동행</p>'+
      (earned?'<p class="gmd-progress">받은 날 '+esc(Data.formatDateLabel(earned))+'</p>':'<p class="gmd-progress">아직 받지 않았습니다.</p>')+
      (unlocked?'<p style="margin:16px 0 8px;font-weight:700">지난 묵상 돌아보기</p>'+list:'')+
      '</div>';
    sheet.hidden=false;
  }

  function showReveal(badge){
    var box=document.getElementById('gmdReveal');
    if(!box||!badge)return;
    box.innerHTML='<div class="gmd-reveal-card">'+
      badgeImg(badge,true)+
      '<p class="gmd-kicker gmd-kicker-ink">새로운 말씀 동행 배지를 받았습니다.</p>'+
      '<h2>'+esc(badge.name)+' · '+badge.days+'일</h2>'+
      '<button type="button" class="gmd-btn gmd-btn-primary" data-gmd-close-reveal>확인</button></div>';
    box.hidden=false;
    Store.markBadgeSeen(badge.id);
  }

  function bindSession(){
    var model=currentModel();
    var note=document.getElementById('gmdNote');
    var q=document.getElementById('gmdQ');
    var status=document.getElementById('gmdSaveStatus');
    var saveTimer=0;
    function persist(show){
      Store.saveNote(model.date, note?note.value:'', Object.assign(snapshot(model),{
        questionNote:q?q.value:''
      }));
      if(show&&status)status.textContent='저장했습니다.';
    }
    function schedule(){
      if(saveTimer)clearTimeout(saveTimer);
      saveTimer=setTimeout(function(){persist(false);}, 400);
    }
    if(note){
      note.addEventListener('input', schedule);
    }
    if(q)q.addEventListener('input', schedule);
    var save=document.getElementById('gmdSave');
    if(save)save.addEventListener('click', function(){persist(true);});
    bindNoteFields();
    var finish=document.getElementById('gmdFinish');
    if(finish){
      finish.addEventListener('click', function(){
        persist(false);
        var rec=Store.dayRecord(model.date)||{};
        var result=Store.completeDay(model.date, Object.assign(snapshot(model),{
          note:note?note.value:'',
          actionCompleted:!!rec.actionCompleted
        }));
        render();
        var pending=result.badges||[];
        if(pending.length){
          window.setTimeout(function(){showReveal(pending[0]);}, reduce?0:240);
        }
      });
    }
  }

  function bindNoteFields(){
    ['gmdQ','gmdNote'].forEach(function(id){
      var field=document.getElementById(id);
      if(!field)return;
      field.addEventListener('touchstart', function(ev){
        ev.stopPropagation();
      }, {passive:true});
      field.addEventListener('pointerdown', function(ev){
        ev.stopPropagation();
        try{field.focus({preventScroll:true});}catch(e){try{field.focus();}catch(err){}}
      });
      field.addEventListener('click', function(ev){
        ev.stopPropagation();
      });
    });
  }

  function bindWalk(){
    var prev=document.getElementById('gmdCalPrev');
    var next=document.getElementById('gmdCalNext');
    if(prev)prev.addEventListener('click', function(){
      calCursor.m-=1;
      if(calCursor.m<1){calCursor.m=12;calCursor.y-=1;}
      render({keepScroll:true});
    });
    if(next)next.addEventListener('click', function(){
      calCursor.m+=1;
      if(calCursor.m>12){calCursor.m=1;calCursor.y+=1;}
      render({keepScroll:true});
    });
  }

  function render(opts){
    opts=opts||{};
    if(!app)return;
    var view=viewName();
    var p=params();
    if(view==='session')app.innerHTML=renderSession();
    else if(view==='done')app.innerHTML=renderDone();
    else if(view==='walk')app.innerHTML=renderWalk();
    else if(view==='history')app.innerHTML=renderHistory();
    else if(view==='notes')app.innerHTML=renderNotes();
    else if(view==='note' && p.get('date'))app.innerHTML=renderNoteDetail(p.get('date'));
    else app.innerHTML=renderMain();
    if(view==='session'){
      bindSession();
      bindWalk();
    }
    if(view==='walk')bindWalk();
    var ae=document.activeElement;
    var typing=ae&&(ae.id==='gmdQ'||ae.id==='gmdNote');
    if(!opts.keepScroll && !typing){
      try{window.scrollTo(0,0);}catch(e){}
    }
  }

  document.addEventListener('click', function(ev){
    var node=ev.target;
    if(node&&node.closest&&node.closest('a[href], textarea, input, select, option'))return;
    var t=ev.target&&ev.target.closest?ev.target.closest('[data-gmd-view]:not(.gmd-wrap),[data-gmd-open],[data-gmd-theme],[data-gmd-date],[data-gmd-note],[data-gmd-badge],[data-gmd-close-sheet],[data-gmd-close-reveal],[data-gmd-cal]'):null;
    if(!t)return;
    if(t.hasAttribute('data-gmd-close-sheet')){
      var sheet=document.getElementById('gmdSheet');
      if(sheet)sheet.hidden=true;
      return;
    }
    if(t.hasAttribute('data-gmd-close-reveal')){
      var rev=document.getElementById('gmdReveal');
      if(rev)rev.hidden=true;
      return;
    }
    if(t.hasAttribute('data-gmd-badge')){
      openBadgeSheet(t.getAttribute('data-gmd-badge'));
      return;
    }
    if(t.hasAttribute('data-gmd-theme')){
      go({theme:t.getAttribute('data-gmd-theme'), view:'session', date:Store.todayKey()});
      return;
    }
    if(t.hasAttribute('data-gmd-date')){
      go({view:'session', date:t.getAttribute('data-gmd-date')});
      return;
    }
    if(t.hasAttribute('data-gmd-note')){
      go({view:'note', date:t.getAttribute('data-gmd-note')});
      return;
    }
    if(t.hasAttribute('data-gmd-cal')){
      var key=t.getAttribute('data-gmd-cal');
      if(key>Store.todayKey())return;
      go({view:'session', date:key});
      return;
    }
    if(t.getAttribute('data-gmd-open')==='session'){
      go({view:'session', date:Store.todayKey()});
      return;
    }
    if(t.hasAttribute('data-gmd-view')){
      var v=t.getAttribute('data-gmd-view');
      if(v==='main')go({});
      else go({view:v});
    }
  });

  document.addEventListener('click', function(ev){
    var sheet=document.getElementById('gmdSheet');
    if(sheet&&!sheet.hidden&&ev.target===sheet)sheet.hidden=true;
    var rev=document.getElementById('gmdReveal');
    if(rev&&!rev.hidden&&ev.target===rev)rev.hidden=true;
  });
  window.addEventListener('popstate', render);

  /* 로그인: Home과 같은 GomnaAuth.openAccountView 입구 */
  var loginModalLastFocus=null;
  function isLoginModalOpen(){
    var overlay=document.getElementById('loginModal');
    return !!(overlay&&overlay.classList.contains('show'));
  }
  function openLoginModal(source){
    var overlay=document.getElementById('loginModal');
    if(!overlay)return;
    overlay.setAttribute('data-login-source',source||'');
    overlay.classList.add('show');
    overlay.setAttribute('aria-hidden','false');
    document.documentElement.classList.add('login-modal-open');
    try{
      loginModalLastFocus=document.activeElement;
      var box=overlay.querySelector('.login-box');
      if(box)box.focus({preventScroll:true});
    }catch(e){}
  }
  function closeLoginModal(){
    var overlay=document.getElementById('loginModal');
    if(!overlay)return;
    overlay.classList.remove('show');
    overlay.setAttribute('aria-hidden','true');
    document.documentElement.classList.remove('login-modal-open');
    try{if(loginModalLastFocus)loginModalLastFocus.focus();}catch(e){}
    loginModalLastFocus=null;
    syncMe();
    render();
  }
  window.openLoginModal=openLoginModal;
  window.closeLoginModal=closeLoginModal;
  window.handleHomeAccountBtn=function(ev){
    if(ev&&ev.preventDefault)ev.preventDefault();
    if(window.GomnaAuth&&typeof window.GomnaAuth.openAccountView==='function'){
      window.GomnaAuth.openAccountView('home-tab-me');
      return;
    }
    openLoginModal('home-tab-me');
  };
  function setHomeAccountState(state){
    var signedIn=state==='signed-in';
    var me=document.querySelector('.gomna-home-tab[data-ghd-nav="me"]');
    if(!me)return;
    me.classList.toggle('is-signed-in', signedIn);
    me.setAttribute('aria-label', signedIn?'나':'로그인');
    var label=me.querySelector('[data-ghd-me-label]');
    if(label){
      label.textContent=signedIn?'나':'로그인';
      label.setAttribute('data-ghd-me-signed', signedIn?'1':'0');
    }
  }
  var lastNs=Store.namespace();
  window.GomnaHomeAccount={
    setState:function(state){
      setHomeAccountState(state);
      var ns=Store.namespace();
      if(ns!==lastNs){
        lastNs=ns;
        render();
      }
    },
    setAvatar:function(){}
  };
  function syncMe(){
    var signed=false;
    try{signed=!!(window.GomnaAuth&&window.GomnaAuth.isSignedIn&&window.GomnaAuth.isSignedIn());}catch(e){}
    setHomeAccountState(signed?'signed-in':'signed-out');
  }

  document.addEventListener('keydown', function(e){
    if(e.key!=='Escape')return;
    var rev=document.getElementById('gmdReveal');
    if(rev&&!rev.hidden){rev.hidden=true;return;}
    var sheet=document.getElementById('gmdSheet');
    if(sheet&&!sheet.hidden){sheet.hidden=true;return;}
    if(isLoginModalOpen())closeLoginModal();
  });

  render();
  syncMe();
  var n=0, timer=setInterval(function(){
    syncMe();
    if(++n>=40)clearInterval(timer);
  }, 80);
})();
