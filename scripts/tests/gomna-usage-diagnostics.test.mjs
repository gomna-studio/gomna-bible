import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../../js/gomna-usage-diagnostics.js',import.meta.url),'utf8');
function setup(consent=true){
 let time=0;const events=[],timers=[];
 function target(){const map={};return {addEventListener(n,f){(map[n]??=[]).push(f)},removeEventListener(n,f){map[n]=(map[n]||[]).filter(x=>x!==f)},emit(n,detail={}){for(const f of [...(map[n]||[])])f({detail})}}}
 const audio=Object.assign(target(),{currentTime:0,playbackRate:1,seeking:false,paused:true,readyState:0});
 const window=Object.assign(target(),{GomnaGa4:{allowed:()=>consent,track:(n,p)=>{events.push({n,p});return true}},GOMNA_AUDIO_ENGINE:{_state:{currentAudio:audio}}});
 const document=Object.assign(target(),{visibilityState:'visible'});
 vm.runInNewContext(code,{window,document,location:{pathname:'/reader.html',hash:''},performance:{now:()=>time},setInterval:(f,ms)=>timers.push({f,ms})});
 return {window,document,audio,events,advance(s,media=s){time+=s*1000;audio.currentTime+=media;audio.emit('timeupdate')},pulse(){timers.forEach(x=>x.f())},consent(v){consent=v},request(){window.emit('audio:request',{audioId:'one'});window.emit('audio:start',{audioId:'one',entry:{type:'bible'}})},get(n){return events.filter(e=>e.n===n)}};
}
test('counts actual playing time, excludes paused wall time and seek jumps',()=>{
 const p=setup();p.request();p.advance(10);p.audio.emit('pause');p.advance(30,0);p.audio.seeking=true;p.advance(1,200);p.audio.emit('seeking');p.audio.seeking=false;p.audio.emit('seeked');p.advance(5);p.window.emit('audio:end');
 assert.equal(p.get('audio_listen_time').reduce((s,e)=>s+e.p.listen_seconds,0),15);
});
test('background audio counts but hidden screen time does not',()=>{
 const p=setup();p.pulse();p.request();p.advance(5);p.document.visibilityState='hidden';p.document.emit('visibilitychange');p.advance(20);p.pulse();
 assert.equal(p.get('audio_listen_time').reduce((s,e)=>s+e.p.listen_seconds,0),25);
 assert.equal(p.get('screen_observed').reduce((s,e)=>s+e.p.visible_seconds,0),5);
});
test('slow request fires once, actual start records measured delay once',()=>{
 const p=setup();p.request();p.advance(4,0);p.pulse();p.pulse();p.audio.emit('playing');p.audio.emit('playing');
 assert.equal(p.get('audio_start_slow').length,1);assert.equal(p.get('audio_started').length,1);assert.equal(p.get('audio_started')[0].p.startup_seconds,4);
});
test('consent denial and revocation do not send accumulated audio',()=>{
 const p=setup(false);p.request();p.advance(20);p.pulse();assert.equal(p.events.length,0);
 p.consent(true);p.request();p.advance(5);p.consent(false);p.pulse();p.consent(true);p.advance(2);p.window.emit('audio:end');
 assert.equal(p.get('audio_listen_time').reduce((s,e)=>s+e.p.listen_seconds,0),2);
});
test('failure is deduplicated and stale errors excluded',()=>{
 const p=setup();p.request();p.window.emit('audio:error',{audioId:'old',reason:'play_error'});p.window.emit('audio:diagnostic-failure',{audioId:'one',reason:'manifest_loading'});p.window.emit('audio:error',{audioId:'one',reason:'play_error'});
 assert.equal(p.get('audio_failure').length,1);assert.equal(p.get('audio_failure')[0].p.failure_reason,'manifest_loading');
});
