import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const bridgeSource=fs.readFileSync(new URL('../js/gomna-login-entry.js',import.meta.url),'utf8');
const authSource=fs.readFileSync(new URL('../js/gomna-auth.js',import.meta.url),'utf8');
const authBindings=authSource.slice(authSource.indexOf('  function markBound('),authSource.indexOf('  function bindProviderButtons('));
const googleBinding=authSource.slice(authSource.indexOf('  function onGoogleButtonClick('),authSource.indexOf('  function onGoogleCredential('));
assert.ok(authBindings.includes('function bindProviderButton('));
const providerNames=['google','custom:naver','kakao'];

function fixture(page,{readyState='loading',bridge=true}={}){
  const html=fs.readFileSync(new URL('../'+page,import.meta.url),'utf8');
  const tags=html.match(/<button\b[^>]*class="[^"]*\blogin-provider\b[^>]*>/g)||[];
  assert.equal(tags.length,4,page+' must supply four original login controls');
  const calls=[],timers=[],documentHandlers=new Map(),windowHandlers=new Map(),observers=[];
  let mounted=false;
  const notice={hidden:true,textContent:''};
  function classList(names){
    const values=new Set(names.split(/\s+/));
    return {contains:name=>values.has(name),add:name=>values.add(name),remove:name=>values.delete(name),toString:()=>[...values].join(' ')};
  }
  const modal={hidden:false,classList:classList('login-overlay show'),closest:()=>null,
    querySelector:selector=>selector==='#loginNextStepNotice'?notice:null,
    contains:button=>Object.values(buttons).includes(button)&&button.isConnected};
  const document={readyState,body:null,
    getElementById:id=>mounted&&id==='loginModal'?modal:null,
    addEventListener(type,fn){if(!documentHandlers.has(type))documentHandlers.set(type,[]);documentHandlers.get(type).push(fn);}};
  class Observer{
    constructor(callback){this.callback=callback;this.active=false;observers.push(this);}
    observe(target,options){assert.equal(target,modal);assert.deepEqual(Array.from(options.attributeFilter),['class','hidden']);this.active=true;}
    disconnect(){this.active=false;}
  }
  const window={MutationObserver:Observer,setTimeout(fn,delay){assert.equal(delay,0,'readiness only waits for the remaining DOMContentLoaded listeners');timers.push(fn);},
    addEventListener(type,fn){if(!windowHandlers.has(type))windowHandlers.set(type,[]);windowHandlers.get(type).push(fn);}};
  const context=vm.createContext({window,document,BOUND_FLAG:'data-gomna-auth-bound',ALLOWED_PROVIDERS:['kakao','custom:naver'],
    startOAuth:provider=>calls.push('provider:'+provider),
    showLoginNextStepNotice:()=>calls.push('old-inline-fallback')});
  vm.runInContext(authBindings+'\n'+googleBinding,context);
  function dispatch(type,event={}){for(const fn of documentHandlers.get(type)||[]){fn(event);if(event.stopped)break;}}
  function tap(button,{detail=1,target=button}={}){
    const event={target,detail,defaultPrevented:false,stopped:false,
      preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;}};
    dispatch('click',event);
    if(!event.stopped){if(button.inline)button.inline();for(const fn of button.handlers||[])fn(event);}
    return event;
  }
  const buttons={};
  for(const tag of tags){
    const attrs=new Map([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
    const key=attrs.get('data-auth-provider')||'email';
    const button={tagName:'BUTTON',classList:classList(attrs.get('class')),isConnected:true,disabled:false,handlers:[],
      getAttribute:name=>attrs.get(name)||null,setAttribute:(name,value)=>attrs.set(name,value),removeAttribute:name=>attrs.delete(name),
      addEventListener(type,fn){assert.equal(type,'click');this.handlers.push(fn);},
      closest:selector=>selector==='#loginModal .login-provider'?button:null,
      click:()=>tap(button,{detail:0})};
    if(attrs.has('onclick'))button.inline=()=>vm.runInContext(attrs.get('onclick'),context);
    buttons[key]=button;
  }
  assert.deepEqual(Object.keys(buttons).sort(),['custom:naver','email','google','kakao']);
  // The synchronous head helper must tolerate neither body nor modal existing yet.
  if(bridge)vm.runInContext(bridgeSource,context);
  mounted=true;document.body={};
  function bindAuth({email=true,providers=true,throwEmail=false}={}){
    if(email)window.GomnaAuth={openEmailLogin(){calls.push('email');if(throwEmail)throw new Error('UI unavailable');}};
    if(providers)for(const provider of providerNames)context.bindProviderButton(buttons[provider]);
  }
  const scriptSrc=html.match(/<script\b[^>]*src="([^"]*\/gomna-auth\.js[^" ]*)"/)[1];
  function scriptEvent(type='load',src=scriptSrc){dispatch(type,{target:{tagName:'SCRIPT',src}});}
  function dcl(lateBinding){
    document.readyState='interactive';
    if(lateBinding)document.addEventListener('DOMContentLoaded',lateBinding);
    dispatch('DOMContentLoaded');while(timers.length)timers.shift()();
  }
  function mutation(records){for(const observer of observers)if(observer.active)observer.callback(records);}
  function close(kind){
    if(kind==='Escape')dispatch('keydown',{key:'Escape'});
    else if(kind==='pagehide')for(const fn of windowHandlers.get('pagehide')||[])fn();
    else if(kind==='programmatic'){
      const oldValue=modal.classList.toString();modal.classList.remove('show');mutation([{attributeName:'class',oldValue}]);
    }else if(kind==='close-reopen'){
      const oldValue=modal.classList.toString();modal.classList.remove('show');const closed=modal.classList.toString();modal.classList.add('show');
      mutation([{attributeName:'class',oldValue},{attributeName:'class',oldValue:closed}]);
    }else{
      const target=kind==='backdrop'?modal:{closest:selector=>selector==='#loginModal .login-close, #loginModal .login-skip'?{}:null};
      tap(target);
    }
  }
  return {buttons,calls,notice,tap,bindAuth,scriptEvent,dcl,close,modal,dispatch,window,mutation};
}

const scenarios=[
  ['cold email repeats retain one choice and replay once',f=>{
    for(let i=0;i<3;i++)assert.equal(f.tap(f.buttons.email).stopped,true);
    assert.deepEqual(f.calls,[]);assert.equal(f.buttons.email.getAttribute('aria-busy'),'true');
    f.bindAuth();f.scriptEvent();f.dcl();assert.deepEqual(f.calls,['email']);assert.equal(f.buttons.email.getAttribute('aria-busy'),null);
  }],
  ['ready email retains original immediate inline behavior',f=>{
    f.bindAuth();const event=f.tap(f.buttons.email,{detail:0});assert.equal(event.stopped,false);assert.deepEqual(f.calls,['email']);
  }],
  ...providerNames.map(provider=>['cold '+provider+' uses original Auth bind once',f=>{
    f.tap(f.buttons[provider]);f.tap(f.buttons[provider]);assert.deepEqual(f.calls,[]);
    f.bindAuth();f.scriptEvent();f.dcl();assert.deepEqual(f.calls,['provider:'+provider]);
    f.tap(f.buttons[provider],{detail:0});assert.deepEqual(f.calls,['provider:'+provider,'provider:'+provider]);
  }]),
  ['latest provider replaces the earlier choice',f=>{
    f.tap(f.buttons.google);f.tap(f.buttons.kakao);f.bindAuth();f.scriptEvent();assert.deepEqual(f.calls,['provider:kakao']);
  }],
  ['latest email replaces provider without duplicate navigation',f=>{
    f.tap(f.buttons.google);f.tap(f.buttons.email);f.bindAuth();f.scriptEvent();assert.deepEqual(f.calls,['email']);
  }],
  ['latest provider replaces email and nested icon target is retained',f=>{
    f.tap(f.buttons.email);f.tap(f.buttons['custom:naver'],{target:{closest:selector=>selector==='#loginModal .login-provider'?f.buttons['custom:naver']:null}});
    f.bindAuth();f.scriptEvent();assert.deepEqual(f.calls,['provider:custom:naver']);
  }],
  ...['close','skip','backdrop','Escape','pagehide','programmatic','close-reopen'].map(kind=>[kind+' cancels pending choice before a later reopen',f=>{
    f.tap(f.buttons.email);f.close(kind);f.modal.classList.add('show');f.bindAuth();f.scriptEvent();f.dcl();
    assert.deepEqual(f.calls,[]);assert.equal(f.buttons.email.getAttribute('aria-busy'),null);
  }]),
  ['later DOMContentLoaded Auth binding wins before readiness check',f=>{
    f.tap(f.buttons.google);f.dcl(()=>f.bindAuth());f.scriptEvent();assert.deepEqual(f.calls,['provider:google']);
  }],
  ['email late binding is replayed at DOMContentLoaded',f=>{
    f.tap(f.buttons.email);f.dcl(()=>f.bindAuth());assert.deepEqual(f.calls,['email']);
  }],
  ['load does not duplicate an intent already replayed at DOMContentLoaded',f=>{
    f.tap(f.buttons.kakao);f.dcl(()=>f.bindAuth());f.scriptEvent();assert.deepEqual(f.calls,['provider:kakao']);
  }],
  ['real script failure gives recovery instructions and remains retryable',f=>{
    f.tap(f.buttons.email);f.scriptEvent('error');assert.equal(f.notice.hidden,false);assert.match(f.notice.textContent,/새로고침/);
    assert.equal(f.buttons.email.disabled,false);assert.equal(f.buttons.email.getAttribute('aria-busy'),null);
    f.bindAuth();f.tap(f.buttons.email);assert.deepEqual(f.calls,['email']);assert.equal(f.notice.hidden,true);
  }],
  ['dependency failure at DOMContentLoaded reports actual failure',f=>{
    f.tap(f.buttons.google);f.dcl();assert.equal(f.notice.hidden,false);assert.match(f.notice.textContent,/열지 못했습니다/);assert.deepEqual(f.calls,[]);
  }],
  ['unrelated resource load and error cannot fail or replay Auth choice',f=>{
    f.tap(f.buttons.email);f.scriptEvent('error','js/unrelated.js');f.scriptEvent('load','js/unrelated.js');
    assert.equal(f.notice.hidden,true);f.bindAuth();f.scriptEvent();assert.deepEqual(f.calls,['email']);
  }],
  ['removed control cannot replay into an old login screen',f=>{
    f.tap(f.buttons.email);f.buttons.email.isConnected=false;f.bindAuth();f.scriptEvent();assert.deepEqual(f.calls,[]);
  }],
  ['visible modal changes retain pending intent',f=>{
    f.tap(f.buttons.email);f.mutation([{attributeName:'class',oldValue:'login-overlay show'}]);f.bindAuth();f.scriptEvent();assert.deepEqual(f.calls,['email']);
  }],
  ['bridge clears only its own failure notice',f=>{
    f.tap(f.buttons.email);f.scriptEvent('error');f.notice.textContent='Existing Auth notice';f.bindAuth();f.tap(f.buttons.email);
    assert.equal(f.notice.textContent,'Existing Auth notice');assert.equal(f.notice.hidden,false);
  }],
  ['programmatic hidden state cancels an intent',f=>{
    f.tap(f.buttons.kakao);f.modal.hidden=true;f.mutation([{attributeName:'hidden',oldValue:null}]);f.modal.hidden=false;
    f.bindAuth();f.scriptEvent();assert.deepEqual(f.calls,[]);
  }],
  ['existing bound provider ignores repeated module initialization',f=>{
    f.bindAuth();f.bindAuth();const event=f.tap(f.buttons.google,{detail:0});
    assert.equal(event.stopped,false);assert.deepEqual(f.calls,['provider:google']);
  }],
  ['failure before any tap is visible on the next unavailable choice',f=>{
    f.scriptEvent('error');assert.equal(f.notice.hidden,true);f.tap(f.buttons.kakao);
    assert.equal(f.notice.hidden,false);assert.match(f.notice.textContent,/새로고침/);assert.deepEqual(f.calls,[]);
  }]
];

for(const page of ['index.html','reader.html','meditation.html']){
  for(const [name,run] of scenarios)test(page+': '+name,()=>run(fixture(page)));
  test(page+': already completed page reports missing module without silent tap loss',()=>{
    const f=fixture(page,{readyState:'complete'});f.tap(f.buttons.email);assert.equal(f.notice.hidden,false);assert.deepEqual(f.calls,[]);
  });
  test(page+': baseline cold provider click has no handler',()=>{
    const f=fixture(page,{bridge:false});f.tap(f.buttons.google);f.bindAuth();f.scriptEvent();assert.deepEqual(f.calls,[]);
  });
}
