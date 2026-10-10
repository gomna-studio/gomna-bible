/* Bible people/stories preview: isolated home explorer, existing Reader playback. */
(function () {
  'use strict';
  const items = window.GOMNA_BIBLE_LIBRARY_DATA || [];
  const key = 'gomna-bible-library-v1';
  const states = {people: {q:'', group:'전체', scroll:0}, stories: {q:'', group:'전체', scroll:0}};
  let panel, scroll, current = null, opener, restored = false;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14 6-6 6 6 6"/></svg>';
  function revealWithImage(container, img) {
    container.style.visibility='hidden';
    container.setAttribute('aria-busy','true');
    let deadline;
    function current(){return container.isConnected && container.contains(img);}
    function reveal(ready){
      if(!current()){clearTimeout(deadline);return;}
      img.hidden=!ready;
      img.style.display=ready?'':'none';
      requestAnimationFrame(()=>{
        if(!current())return;
        container.style.visibility='';container.removeAttribute('aria-busy');
      });
    }
    // A slow portrait must not keep its title or entire story blank.
    // Healthy loads still reveal photo and text together; late photos can join.
    deadline=setTimeout(()=>reveal(false),1500);
    let loaded;
    try{
      loaded=img.decode ? img.decode() : new Promise((resolve,reject)=>{
        if(img.complete)return img.naturalWidth>0?resolve():reject();
        img.onload=resolve;img.onerror=reject;
      });
    }catch(_){loaded=Promise.reject();}
    Promise.resolve(loaded).then(()=>{
      clearTimeout(deadline);reveal(img.naturalWidth>0);
    },()=>{
      clearTimeout(deadline);reveal(false);
    });
  }
  function route() {
    const m = location.hash.match(/^#bible-library\/(people|stories)(?:\/([a-z-]+))?$/);
    return m ? {kind:m[1], id:m[2] || ''} : null;
  }
  function save() {
    if (current && !current.id && scroll) states[current.kind].scroll = scroll.scrollTop;
    try { sessionStorage.setItem(key, JSON.stringify(states)); } catch (_) {}
  }
  function readerUrl(item) {
    const p = new URLSearchParams({book:item.book, chapter:item.chapter, verse:item.start,
      verseStart:item.start, verseEnd:item.end, startVerse:item.start, endVerse:item.end,
      source:'guide-related'});
    p.set('libraryKind',item.kind);
    p.set('libraryId',item.id);
    p.set('libraryName',item.name);
    return 'reader.html?' + p.toString();
  }
  function image(item, detail, eager) {
    return '<img src="' + esc(item.image) + '" alt="" ' + (detail?'fetchpriority="high"':eager?'loading="eager"':'loading="lazy"') + ' decoding="sync"' + (item.imageWidth ? ' width="'+item.imageWidth+'" height="'+item.imageHeight+'" style="aspect-ratio:'+item.imageWidth+'/'+item.imageHeight+'"' : '') + '>';
  }
  function tile(item, index) {
    return '<button class="gbl-tile" data-gbl-item="'+item.id+'">'+image(item,false,index < 6)+'<span class="gbl-tile-copy"><strong>'+esc(item.name)+'</strong><span>'+esc(item.title)+'</span></span></button>';
  }
  function results() {
    const s=states[current.kind], q=s.q.trim().toLocaleLowerCase();
    const matches=items.filter(i=>i.kind===current.kind && (s.group==='전체'||i.group===s.group || (s.group==='신약'&&i.group==='비유')) && (!q||(i.name+' '+i.title+' '+i.book).toLocaleLowerCase().includes(q)));
    panel.querySelector('#gblCount').textContent=(current.kind==='people'?'성경 속 인물':'성경 속 이야기')+' · '+matches.length;
    panel.querySelector('#gblResults').innerHTML=matches.length?matches.map(tile).join(''):'<p class="gbl-empty">찾는 내용이 없어요.<br>다른 이름이나 제목으로 찾아보세요.</p>';
    panel.querySelectorAll('.gbl-tile').forEach(tile=>revealWithImage(tile,tile.querySelector('img')));
  }
  function list() {
    const s=states[current.kind], people=current.kind==='people';
    s.q='';
    scroll.innerHTML='<div class="gbl-list"><div class="gbl-tabs" role="group" aria-label="탐색 종류"><button data-gbl-kind="people" aria-pressed="'+people+'">인물로 보기</button><button data-gbl-kind="stories" aria-pressed="'+!people+'">이야기로 보기</button></div>'+'<div class="gbl-filters" role="group" aria-label="성경 분류">'+(people?['전체','구약','신약']:['전체','구약','신약','비유']).map(g=>'<button data-gbl-group="'+g+'" aria-pressed="'+(s.group===g)+'">'+g+'</button>').join('')+'</div><h2 id="gblCount" aria-live="polite"></h2><div id="gblResults" class="gbl-grid '+(people?'':'gbl-stories')+'"></div></div>';
    results();
    scroll.scrollTop=s.scroll;
  }
  function historyContext(item) {
    if (!item.history) return '';
    return '<section class="gbl-history"><h3>시대와 배경</h3><p class="gbl-body"><strong>'+esc(item.history.era)+'</strong><br>'+esc(item.history.place)+'</p><p class="gbl-body">'+esc(item.history.text)+'</p></section>';
  }
  function storyContent(item) {
    if (item.article) {
      const paragraphs=item.article.paragraphs.map(text=>'<p class="gbl-body">'+esc(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')+'</p>').join('');
      return '<section class="gbl-history"><h3>'+esc(item.article.heading)+'</h3>'+paragraphs+'</section>';
    }
    return historyContext(item)+'<h3>'+esc(item.kind==='people'?item.name+'의 이야기':item.group==='비유'?'예수님이 들려주신 비유':'성경 속 이야기')+'</h3><p class="gbl-body">'+esc(item.body)+'</p>';
  }
  function detail(item) {
    const related=items.filter(i=>i.id!==item.id && i.book===item.book).slice(0,3);
    scroll.innerHTML='<article class="gbl-detail '+(item.kind==='people'?'gbl-person-detail':'')+'"><div class="gbl-hero">'+image(item,true)+'</div><div class="gbl-article"><p class="gbl-eyebrow">'+esc(item.group)+' · '+esc(item.book)+'</p><h2>'+esc(item.title)+'</h2><p class="gbl-intro">'+esc(item.intro)+'</p><hr>'+storyContent(item)+'<section class="gbl-scripture"><p>함께 읽는 말씀</p><h3>'+esc(item.book)+' '+item.chapter+'장 '+item.start+'–'+item.end+'절</h3><div class="gbl-actions"><a href="'+esc(readerUrl(item))+'">말씀 보기</a></div></section><section class="gbl-question"><h3>오늘 생각해 볼 질문</h3><p>'+esc(item.question)+'</p></section>'+(related.length?'<section class="gbl-related"><h3>함께 만나는 이야기</h3>'+related.map(i=>'<button data-gbl-related="'+i.id+'"><span>'+esc(i.name)+'</span><span aria-hidden="true">›</span></button>').join(''):'')+'</div></article>';
    scroll.scrollTop=0;
    revealWithImage(scroll.querySelector('.gbl-detail'),scroll.querySelector('.gbl-hero img'));
  }
  function layout() {
    if (!panel || panel.hidden) return;
    const nav=document.getElementById('gomnaHomeTabbar');
    const v=window.visualViewport;
    const height=v?v.height:innerHeight, top=v?v.offsetTop:0;
    const navTop=nav?nav.getBoundingClientRect().top:height+top;
    panel.style.top=top+'px';
    panel.style.height=Math.max(180,Math.min(height,navTop-top))+'px';
  }
  function render() {
    const next=route();
    if (!next) { closeView(); return; }
    const item=next.id?items.find(i=>i.id===next.id && i.kind===next.kind):null;
    if(next.id&&!item) {history.replaceState(history.state,'','#bible-library/'+next.kind); next.id='';}
    current=next;
    panel.hidden=false;
    document.body.classList.add('gbl-open');
    const feed=document.getElementById('gomnaHomeFeed');
    if(feed)feed.inert=true;
    panel.querySelector('#gblTitle').textContent=item?item.name:'성경 속 이야기와 인물';
    panel.querySelector('[data-gbl-back]').setAttribute('aria-label',item?'목록으로 돌아가기':'홈으로 돌아가기');
    layout();
    if(item)detail(item);else list();
    panel.querySelector('#gblTitle').focus({preventScroll:true});
  }
  function navigate(kind,id,replace) {
    save();
    const url='#bible-library/'+kind+(id?'/'+id:'');
    history[replace?'replaceState':'pushState'](Object.assign({},history.state,{gbl:true}),'',url);
    render();
  }
  function closeView() {
    if(!panel)return;
    panel.hidden=true;
    document.body.classList.remove('gbl-open');
    const feed=document.getElementById('gomnaHomeFeed');
    if(feed)feed.inert=false;
    current=null;
  }
  function home() {
    save(); history.replaceState(Object.assign({},history.state,{gbl:false}),'',location.pathname+location.search); closeView();
    if(opener && opener.isConnected)opener.focus({preventScroll:true});
  }
  function back() {
    if(current && current.id)navigate(current.kind,'',true);else home();
  }
  function init() {
    if(document.getElementById('gomnaBibleLibrary'))return;
    try {const stored=JSON.parse(sessionStorage.getItem(key)||'null');for(const k of ['people','stories'])if(stored&&stored[k]) {states[k].q=typeof stored[k].q==='string'?stored[k].q.slice(0,80):'';states[k].group=['전체','구약','신약','비유'].includes(stored[k].group)?stored[k].group:'전체';states[k].scroll=Math.max(0,Number(stored[k].scroll)||0);}}catch(_){}
    panel=document.createElement('section');panel.id='gomnaBibleLibrary';panel.hidden=true;panel.setAttribute('aria-labelledby','gblTitle');
    panel.innerHTML='<header class="gbl-header"><button data-gbl-back aria-label="홈으로 돌아가기">'+icon+'</button><h1 id="gblTitle" tabindex="-1"></h1><button data-gbl-home aria-label="탐색 닫고 홈으로">×</button></header><div class="gbl-scroll"></div>';
    document.body.appendChild(panel);scroll=panel.querySelector('.gbl-scroll');
    document.addEventListener('click',e=>{
      const entry=e.target.closest('[data-gbl-open]');
      if(entry){e.preventDefault();e.stopPropagation();opener=entry;navigate(entry.dataset.gblOpen,entry.dataset.gblId || '',false);return;}
      // Keep the current library screen in place while another destination
      // loads. Closing it here exposed the underlying home card in between.
      if(current && e.target.closest('#gomnaHomeTabbar [data-ghd-nav="home"]'))home();
    },true);
    panel.addEventListener('click',e=>{
      const b=e.target.closest('button');if(!b)return;
      if(b.hasAttribute('data-gbl-back'))back();
      else if(b.hasAttribute('data-gbl-home'))home();
      else if(b.dataset.gblKind && b.dataset.gblKind!==current.kind)navigate(b.dataset.gblKind,'',true);
      else if(b.dataset.gblGroup){states[current.kind].group=b.dataset.gblGroup;states[current.kind].scroll=0;panel.querySelectorAll('[data-gbl-group]').forEach(x=>x.setAttribute('aria-pressed',x===b));results();save();}
      else if(b.dataset.gblItem)navigate(current.kind,b.dataset.gblItem,false);
      else if(b.dataset.gblRelated){const i=items.find(x=>x.id===b.dataset.gblRelated);if(i)navigate(i.kind,i.id,false);}
    });
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();back();}});
    window.addEventListener('popstate',()=>{save();render();});
    window.addEventListener('hashchange',()=>{if(JSON.stringify(route())!==JSON.stringify(current)){save();render();}});
    window.addEventListener('pagehide',save);
    window.addEventListener('pageshow',()=>{if(restored)render();restored=true;});
    window.addEventListener('resize',layout);
    if(window.visualViewport){visualViewport.addEventListener('resize',layout);visualViewport.addEventListener('scroll',layout);}
    if(window.ResizeObserver){const nav=document.getElementById('gomnaHomeTabbar');if(nav)new ResizeObserver(layout).observe(nav);}
    render();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
