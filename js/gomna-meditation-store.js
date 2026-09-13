/*! 은혜의말씀 — MeditationStore (local-first, versioned)
 * logged-in: user id namespace / logged-out: guest
 * 나중에 Supabase sync로 바꾸기 쉽게 adapter 형태로 둔다.
 */
(function(root){
  'use strict';

  var VERSION=1;
  var PREFIX='gomna.meditation.v1:';
  var BADGES=[
    {id:'first', name:'첫걸음', days:1, image:'assets/meditation/badges/badge-001-first-step.png'},
    {id:'stay', name:'머무름', days:7, image:'assets/meditation/badges/badge-007-stay.png'},
    {id:'walk', name:'동행', days:30, image:'assets/meditation/badges/badge-030-companion.png'},
    {id:'deep', name:'깊어짐', days:50, image:'assets/meditation/badges/badge-050-deeper.png'},
    {id:'root', name:'뿌리내림', days:100, image:'assets/meditation/badges/badge-100-rooted.png'},
    {id:'grow', name:'자라남', days:200, image:'assets/meditation/badges/badge-200-growing.png'},
    {id:'fruit', name:'열매', days:365, image:'assets/meditation/badges/badge-365-fruit.png'}
  ];

  function dataApi(){
    return root.GomnaMeditationData||{};
  }

  function todayKey(){
    return (dataApi().localDateKey||function(){
      var d=new Date();
      var p=function(n){return (n<10?'0':'')+n;};
      return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
    })();
  }

  function tz(){
    return (dataApi().timeZone&&dataApi().timeZone())||'local';
  }

  function accountId(){
    try{
      if(root.GomnaAuth&&typeof root.GomnaAuth.isSignedIn==='function'&&root.GomnaAuth.isSignedIn()){
        var a=root.GomnaAuth.getAccount&&root.GomnaAuth.getAccount();
        if(a&&a.id)return String(a.id);
      }
    }catch(e){}
    return '';
  }

  function namespace(){
    var id=accountId();
    return id?('user:'+id):'guest';
  }

  function storageKey(ns){
    return PREFIX+(ns||namespace());
  }

  function emptyState(){
    return {version:VERSION, days:{}, seenBadges:{}};
  }

  function safeParse(raw){
    if(!raw)return emptyState();
    try{
      var parsed=JSON.parse(raw);
      if(!parsed||typeof parsed!=='object')return emptyState();
      if(!parsed.days||typeof parsed.days!=='object')parsed.days={};
      if(!parsed.seenBadges||typeof parsed.seenBadges!=='object')parsed.seenBadges={};
      parsed.version=VERSION;
      return parsed;
    }catch(e){
      return emptyState();
    }
  }

  var mem={};

  function read(ns){
    ns=ns||namespace();
    try{
      var raw=root.localStorage?root.localStorage.getItem(storageKey(ns)):null;
      var state=safeParse(raw);
      mem[ns]=state;
      return state;
    }catch(e){
      if(!mem[ns])mem[ns]=emptyState();
      return mem[ns];
    }
  }

  function write(state, ns){
    ns=ns||namespace();
    mem[ns]=state;
    try{
      if(root.localStorage)root.localStorage.setItem(storageKey(ns), JSON.stringify(state));
      return true;
    }catch(e){
      return false;
    }
  }

  function dayRecord(dateKey, ns){
    var state=read(ns);
    var rec=state.days[dateKey];
    return rec&&typeof rec==='object'?rec:null;
  }

  function upsertDay(dateKey, patch, ns){
    ns=ns||namespace();
    var state=read(ns);
    var prev=state.days[dateKey]||{
      date:dateKey,
      timezone:tz(),
      verseRef:'',
      verseText:'',
      themeKey:'',
      title:'',
      note:'',
      questionNote:'',
      actionCompleted:false,
      meditationCompleted:false,
      completedAt:''
    };
    var next={};
    var k;
    for(k in prev){
      if(Object.prototype.hasOwnProperty.call(prev,k))next[k]=prev[k];
    }
    for(k in patch){
      if(Object.prototype.hasOwnProperty.call(patch,k))next[k]=patch[k];
    }
    next.date=dateKey;
    state.days[dateKey]=next;
    write(state, ns);
    return next;
  }

  function completedKeys(ns){
    var state=read(ns);
    var keys=Object.keys(state.days).filter(function(k){
      return !!(state.days[k]&&state.days[k].meditationCompleted);
    }).sort();
    return keys;
  }

  function totalDays(ns){
    return completedKeys(ns).length;
  }

  function monthCount(dateKey, ns){
    var prefix=String(dateKey||todayKey()).slice(0,7);
    return completedKeys(ns).filter(function(k){return k.indexOf(prefix)===0;}).length;
  }

  function addDays(key, n){
    var api=dataApi();
    var d=api.dateFromKey?api.dateFromKey(key):new Date();
    d.setDate(d.getDate()+n);
    return api.localDateKey?api.localDateKey(d):todayKey();
  }

  function startOfWeek(dateKey){
    var api=dataApi();
    var d=api.dateFromKey?api.dateFromKey(dateKey||todayKey()):new Date();
    var dow=d.getDay();
    var offset=dow===0?6:dow-1;
    d.setDate(d.getDate()-offset);
    return api.localDateKey?api.localDateKey(d):todayKey();
  }

  function weekDays(dateKey, ns){
    var start=startOfWeek(dateKey||todayKey());
    var labels=['월','화','수','목','금','토','일'];
    var out=[], i;
    for(i=0;i<7;i++){
      var key=addDays(start, i);
      var rec=dayRecord(key, ns);
      out.push({
        date:key,
        label:labels[i],
        done:!!(rec&&rec.meditationCompleted),
        isToday:key===todayKey(),
        isFuture:key>todayKey()
      });
    }
    return out;
  }

  function weekDoneCount(dateKey, ns){
    return weekDays(dateKey, ns).filter(function(d){return d.done;}).length;
  }

  function streak(ns){
    var keys=completedKeys(ns);
    if(!keys.length)return 0;
    var set={};
    keys.forEach(function(k){set[k]=true;});
    var cursor=todayKey();
    if(!set[cursor])cursor=addDays(cursor, -1);
    if(!set[cursor])return 0;
    var n=0;
    while(set[cursor]){
      n+=1;
      cursor=addDays(cursor, -1);
    }
    return n;
  }

  function badgeForTotal(n){
    var current=null, next=BADGES[0], i;
    for(i=0;i<BADGES.length;i++){
      if(n>=BADGES[i].days)current=BADGES[i];
      if(n<BADGES[i].days){
        next=BADGES[i];
        break;
      }
      next=null;
    }
    return {current:current, next:next, total:n};
  }

  function unlockedBadges(ns){
    var n=totalDays(ns);
    return BADGES.filter(function(b){return n>=b.days;});
  }

  function pendingBadgeReveal(ns){
    ns=ns||namespace();
    var state=read(ns);
    var n=totalDays(ns);
    var pending=[], i;
    for(i=0;i<BADGES.length;i++){
      var b=BADGES[i];
      if(n>=b.days && !state.seenBadges[b.id]){
        pending.push(b);
      }
    }
    return pending;
  }

  function markBadgeSeen(id, ns){
    ns=ns||namespace();
    var state=read(ns);
    if(!state.seenBadges[id]){
      state.seenBadges[id]=todayKey();
      write(state, ns);
    }
    return state.seenBadges[id];
  }

  function badgeEarnedOn(id, ns){
    var state=read(ns);
    return state.seenBadges[id]||'';
  }

  function saveNote(dateKey, note, extra, ns){
    extra=extra||{};
    return upsertDay(dateKey, {
      note:String(note==null?'':note),
      questionNote:extra.questionNote==null?((dayRecord(dateKey,ns)||{}).questionNote||''):String(extra.questionNote),
      verseRef:extra.verseRef||((dayRecord(dateKey,ns)||{}).verseRef||''),
      verseText:extra.verseText||((dayRecord(dateKey,ns)||{}).verseText||''),
      themeKey:extra.themeKey||((dayRecord(dateKey,ns)||{}).themeKey||''),
      title:extra.title||((dayRecord(dateKey,ns)||{}).title||''),
      timezone:tz()
    }, ns);
  }

  function setAction(dateKey, done, extra, ns){
    extra=extra||{};
    return upsertDay(dateKey, {
      actionCompleted:!!done,
      verseRef:extra.verseRef||((dayRecord(dateKey,ns)||{}).verseRef||''),
      verseText:extra.verseText||((dayRecord(dateKey,ns)||{}).verseText||''),
      themeKey:extra.themeKey||((dayRecord(dateKey,ns)||{}).themeKey||''),
      title:extra.title||((dayRecord(dateKey,ns)||{}).title||'')
    }, ns);
  }

  function completeDay(dateKey, extra, ns){
    extra=extra||{};
    ns=ns||namespace();
    var existing=dayRecord(dateKey, ns);
    var already=!!(existing&&existing.meditationCompleted);
    var rec=upsertDay(dateKey, {
      meditationCompleted:true,
      completedAt:(existing&&existing.completedAt)||new Date().toISOString(),
      timezone:tz(),
      verseRef:extra.verseRef||(existing&&existing.verseRef)||'',
      verseText:extra.verseText||((existing&&existing.verseText)||''),
      themeKey:extra.themeKey||((existing&&existing.themeKey)||''),
      title:extra.title||((existing&&existing.title)||''),
      note:extra.note==null?((existing&&existing.note)||''):String(extra.note),
      actionCompleted:extra.actionCompleted==null?!!(existing&&existing.actionCompleted):!!extra.actionCompleted
    }, ns);
    return {
      record:rec,
      added:!already,
      total:totalDays(ns),
      badges:pendingBadgeReveal(ns)
    };
  }

  function recentCompleted(limit, ns){
    var keys=completedKeys(ns).slice().reverse();
    if(limit)keys=keys.slice(0, limit);
    return keys.map(function(k){return read(ns).days[k];});
  }

  function notesList(ns){
    var state=read(ns);
    return Object.keys(state.days).sort().reverse().map(function(k){
      return state.days[k];
    }).filter(function(rec){
      return rec&&String(rec.note||'').trim();
    });
  }

  function monthGrid(year, month, ns){
    var first=new Date(year, month-1, 1);
    var startDow=first.getDay();
    var mondayIndex=startDow===0?6:startDow-1;
    var daysIn=new Date(year, month, 0).getDate();
    var cells=[], i;
    for(i=0;i<mondayIndex;i++)cells.push(null);
    for(i=1;i<=daysIn;i++){
      var key=year+'-'+((month<10?'0':'')+month)+'-'+((i<10?'0':'')+i);
      var rec=dayRecord(key, ns);
      cells.push({
        date:key,
        day:i,
        done:!!(rec&&rec.meditationCompleted),
        isToday:key===todayKey(),
        isFuture:key>todayKey()
      });
    }
    return cells;
  }

  function progressCopy(ns){
    var info=badgeForTotal(totalDays(ns));
    if(!info.next){
      return {
        current:info.current,
        next:null,
        remain:0,
        text:'말씀 동행의 열매를 맺었습니다'
      };
    }
    var remain=info.next.days-info.total;
    return {
      current:info.current,
      next:info.next,
      remain:remain,
      text:info.next.name+'까지 말씀과 함께할 날 '+remain+'일'
    };
  }

  var api={
    VERSION:VERSION,
    BADGES:BADGES,
    namespace:namespace,
    accountId:accountId,
    storageKey:storageKey,
    read:read,
    dayRecord:dayRecord,
    upsertDay:upsertDay,
    saveNote:saveNote,
    setAction:setAction,
    completeDay:completeDay,
    completedKeys:completedKeys,
    totalDays:totalDays,
    monthCount:monthCount,
    weekDays:weekDays,
    weekDoneCount:weekDoneCount,
    startOfWeek:startOfWeek,
    streak:streak,
    badgeForTotal:badgeForTotal,
    unlockedBadges:unlockedBadges,
    pendingBadgeReveal:pendingBadgeReveal,
    markBadgeSeen:markBadgeSeen,
    badgeEarnedOn:badgeEarnedOn,
    recentCompleted:recentCompleted,
    notesList:notesList,
    monthGrid:monthGrid,
    progressCopy:progressCopy,
    todayKey:todayKey
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.GomnaMeditationStore=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:this);
