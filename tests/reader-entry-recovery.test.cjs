const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { JSDOM, VirtualConsole } = require(require.resolve('jsdom', { paths:[process.env.GOMNA_QA_MODULES || process.cwd()] }));
const html = fs.readFileSync(path.join(__dirname, '../reader.html'), 'utf8');
const source = html.match(/<script id="reader-panel-entry-boot">([\s\S]*?)<\/script>/)[1];
const style = html.match(/<style id="reader-panel-entry-style">([\s\S]*?)<\/style>/)[1];
const markup = html.match(/<div id="readerEntryRecovery"[\s\S]*?<script>if \(typeof window\.__gomnaMountPanelEntry/)[0].split('<script>')[0];
function boot(query = '?easy=1', target = 'easyView', options = {}) {
  const virtualConsole = new VirtualConsole(), errors = [], events = [];
  virtualConsole.on('jsdomError', e => errors.push(e));
  const dom = new JSDOM('<html><head><style>' + style + '</style></head><body>' + markup + '<div id="' + target + '"><div id="verseList"><div class="verse-item">말씀</div></div></div></body></html>', {
    url:'https://preview.test/reader.html' + query, runScripts:'outside-only', virtualConsole
  });
  const w=dom.window, jobs=new Map(); let now=0, sequence=0, hidden=false, allowed=false;
  w.Date.now=()=>now;
  w.setTimeout=(fn,ms=0)=>{const id=++sequence; jobs.set(id,{fn,at:now+ms});return id;};
  w.clearTimeout=id=>jobs.delete(id);
  w.requestAnimationFrame=fn=>w.setTimeout(fn,16);
  w.cancelAnimationFrame=w.clearTimeout;
  Object.defineProperty(w.document,'visibilityState',{configurable:true,get:()=>hidden?'hidden':'visible'});
  Object.defineProperty(w.document,'hidden',{configurable:true,get:()=>hidden});
  w.GomnaGa4={allowed:()=>allowed,track:(name,props)=>events.push({name,...props})};
  if (options.theme) w.localStorage.setItem('gomna_theme_v1',options.theme);
  w.matchMedia=()=>({matches:!!options.deviceDark});
  w.eval(source);
  if(w.__gomnaMountPanelEntry)w.__gomnaMountPanelEntry();
  const root=w.document.documentElement, view=w.document.getElementById(target);
  const run={w,root,view,events,errors,jobs,close:()=>w.close(),shell:w.document.getElementById('readerEntryRecovery'),
    consent(value){allowed=value;},
    advance(ms){const end=now+ms; let limit=10000;while(limit--){const first=[...jobs].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!first)break;jobs.delete(first[0]);now=first[1].at;first[1].fn();}assert(limit>0,'bounded scheduled work');now=end;},
    visible(value){hidden=!value;w.document.dispatchEvent(new w.Event('visibilitychange'));},
    ready(){view.classList.add('active');return w.__gomnaRevealPanelEntry();},
    click(id){w.document.getElementById(id).click();},
    pending:()=>root.classList.contains('reader-panel-entry-pending')};
  return run;
}
function withRun(fn,query,target,options){const r=boot(query,target,options);try{fn(r);}finally{r.close();}}
test('normal Find and Archive reveal immediately without showing loading UI',()=>{
  for(const [query,target]of[['?easy=1','easyView'],['?favorites=1','favView']])withRun(r=>{
    assert.equal(r.ready(),true);assert(!r.pending());assert(r.shell.hidden);r.advance(6000);assert(r.shell.hidden);assert.equal(r.jobs.size,0);
  },query,target);
});
test('slow entry has status and escape after500ms, retry at5s, no wrong panel exposure',()=>withRun(r=>{
  r.advance(499);assert(r.shell.hidden);r.advance(1);assert(!r.shell.hidden);assert(r.w.document.getElementById('readerEntryRetry').hidden);
  assert.match(r.w.document.getElementById('readerEntryMessage').textContent,/찾기/);
  assert.equal(r.w.getComputedStyle(r.w.document.body).visibility,'hidden');assert.equal(r.w.getComputedStyle(r.shell).visibility,'visible');
  r.advance(4500);assert(!r.w.document.getElementById('readerEntryRetry').hidden);assert.match(r.w.document.getElementById('readerEntryMessage').textContent,/시간이 걸리고/);assert(r.pending());
}));
test('late readiness hides recovery; local retry avoids reloading any document',()=>withRun(r=>{
  r.advance(5000);r.w.initializeLocalPanelEntry=()=>r.ready();r.click('readerEntryRetry');assert(!r.pending());assert(r.shell.hidden);assert.equal(r.errors.length,0);r.advance(20000);assert(r.shell.hidden);
}));
test('hidden time is excluded and foreground does not instantly time out',()=>withRun(r=>{
  r.advance(300);r.visible(false);r.advance(60000);assert(r.shell.hidden);r.visible(true);r.advance(199);assert(r.shell.hidden);r.advance(1);assert(!r.shell.hidden);assert(r.w.document.getElementById('readerEntryRetry').hidden);r.advance(4500);assert(!r.w.document.getElementById('readerEntryRetry').hidden);
}));
test('back cancels old readiness and bfcache return can recover selected destination',()=>withRun(r=>{
  let backs=0;r.w.history.pushState({},'',r.w.location.href);r.w.history.back=()=>backs++;r.advance(500);r.click('readerEntryBack');assert.equal(backs,1);assert.equal(r.ready(),false);assert(r.pending());
  r.w.dispatchEvent(new r.w.PageTransitionEvent('pageshow',{persisted:true}));assert.equal(r.ready(),true);assert(!r.pending());
}));
test('explicit retry reload is blocked for all protected audio states and dirty editing',()=>{
  for(const field of ['isPlaying','isLoading','isPaused','queueActive','isRecovering'])withRun(r=>{
    r.advance(5000);r.w.GOMNA_AUDIO_ENGINE={getState:()=>({[field]:true})};r.click('readerEntryRetry');assert.equal(r.errors.length,0);assert.match(r.w.document.getElementById('readerEntryMessage').textContent,/재생 중/);
  });
  withRun(r=>{r.advance(5000);const input=r.w.document.createElement('input');r.w.document.body.appendChild(input);input.dispatchEvent(new r.w.Event('input',{bubbles:true}));r.click('readerEntryRetry');assert.equal(r.errors.length,0);});
});
test('safe explicit retry attempts only same-document reload and preserves local storage',()=>withRun(r=>{
  r.w.localStorage.setItem('test-preserved','saved');r.advance(5000);r.click('readerEntryRetry');assert.equal(r.w.localStorage.getItem('test-preserved'),'saved');assert.equal(r.w.location.search,'?easy=1');assert(r.errors.some(e=>/navigation/.test(e.message)),'JSDOM observed explicit navigation call, physical reload is browser-tested');
}));
test('consent is required for telemetry and slow/ready lifecycle is not duplicated',()=>withRun(r=>{
  r.advance(5000);assert.equal(r.events.length,0);r.consent(true);r.ready();assert.deepEqual(r.events.map(e=>e.name),['screen_open_start','screen_open_ready']);assert.equal(r.events[1].screen,'find');assert.equal(r.events[1].elapsed_ms,5000);
}));
test('Reader still waits for actual passage and stable frames, then removes recovery',()=>withRun(r=>{
  r.advance(5000);r.ready();assert(r.pending());r.advance(1000);assert(!r.pending());assert(r.shell.hidden);
},'?book=시편&chapter=19','verseView'));
test('home picker delegates its own recovery and document recovery precedes blocking scripts',()=>withRun(r=>{
  assert(!r.pending());assert(r.shell.hidden);assert.equal(r.w.__gomnaMountPanelEntry,undefined);
  const mount=html.indexOf("if (typeof window.__gomnaMountPanelEntry");
  const head=html.slice(0,html.indexOf('</head>'));
  assert(!/<script\b(?=[^>]*\bsrc=)(?![^>]*\b(?:defer|async)\b)[^>]*>/.test(head));
  assert(mount<html.indexOf('src="/js/gomna-screen-transition.js'));
  assert(html.indexOf('src="/analytics-control.js')<html.indexOf('src="/js/gomna-ga4.js'));
  assert.match(html,/requestId: new URLSearchParams\(location.search\).get\('pickerRequest'\)/);
},'?source=home-bible-picker','verseView'));

test('dependency failure gives immediate actionable recovery; noncritical scripts do not',()=>withRun(r=>{
  r.consent(true);
  const unrelated=r.w.document.createElement('script');r.w.document.body.appendChild(unrelated);unrelated.dispatchEvent(new r.w.Event('error'));assert(r.shell.hidden);
  const critical=r.w.document.createElement('script');critical.setAttribute('data-reader-entry-dependency','');r.w.document.body.appendChild(critical);critical.dispatchEvent(new r.w.Event('error'));
  assert(!r.shell.hidden);assert(!r.w.document.getElementById('readerEntryRetry').hidden);assert.match(r.w.document.getElementById('readerEntryMessage').textContent,/열지 못했습니다/);assert(r.pending());
  assert.equal(r.events.filter(e=>e.name==='screen_open_error').length,1);r.ready();assert(!r.pending());
}));
test('recovery controls remain operable under outgoing pointer lock and do not expose body',()=>withRun(r=>{
  const css=r.w.document.createElement('style');css.textContent='html.gomna-route-leaving,html.gomna-route-leaving body{pointer-events:none}';r.w.document.head.appendChild(css);r.root.classList.add('gomna-route-leaving');r.advance(500);
  assert.equal(r.w.getComputedStyle(r.shell).pointerEvents,'auto');assert.equal(r.w.getComputedStyle(r.shell).visibility,'visible');assert.equal(r.w.getComputedStyle(r.w.document.body).visibility,'hidden');
}));
test('dark and automatic preference are read before any external theme script',()=>{
  for(const options of [{theme:'dark'},{theme:'auto',deviceDark:true}])withRun(r=>{
    assert.equal(r.root.getAttribute('data-gomna-theme'),'dark');r.advance(500);assert.equal(r.w.getComputedStyle(r.shell).backgroundColor,'rgb(21, 28, 38)');
  },'?easy=1','easyView',options);
});
test('cancel is recorded once and native active media prevents destructive retry',()=>withRun(r=>{
  r.consent(true);r.advance(5000);const audio=r.w.document.createElement('audio');Object.defineProperty(audio,'paused',{value:false});r.w.document.body.appendChild(audio);r.click('readerEntryRetry');assert.equal(r.errors.length,0);audio.remove();
  r.w.history.pushState({},'',r.w.location.href);r.w.history.back=()=>{};r.click('readerEntryBack');r.w.dispatchEvent(new r.w.PageTransitionEvent('pagehide'));assert.equal(r.events.filter(e=>e.name==='screen_open_cancel').length,1);assert.equal(r.ready(),false);
}));
test('cancelled Back or Home departure restores recovery instead of trapping retry',()=>{
  for(const action of ['readerEntryBack','readerEntryHome'])withRun(r=>{
    r.advance(500);r.w.history.pushState({},'',r.w.location.href);r.w.history.back=()=>{};
    if(action==='readerEntryHome')r.w.document.getElementById(action).addEventListener('click',e=>e.preventDefault());
    r.click(action);assert.equal(r.ready(),false);r.advance(5000);assert.equal(r.ready(),true);assert(!r.pending());
  });
});
test('protected activity refuses reload but offers a confirmed exit',()=>withRun(r=>{
  r.advance(5000);r.w.GOMNA_AUDIO_ENGINE={getState:()=>({isPaused:true})};r.click('readerEntryRetry');assert.equal(r.errors.length,0);
  let confirmations=0,backs=0;r.w.history.pushState({},'',r.w.location.href);r.w.history.back=()=>backs++;
  r.w.confirm=()=>{confirmations++;return false;};r.click('readerEntryBack');assert.equal(backs,0);
  r.w.confirm=()=>{confirmations++;return true;};r.click('readerEntryBack');assert.equal(confirmations,2);assert.equal(backs,1);assert.equal(r.ready(),false);
}));
