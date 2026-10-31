import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=fs.readFileSync(new URL('../js/gomna-home-feed.js',import.meta.url),'utf8');
const start=source.indexOf('  function openHomeBiblePicker(){');
const end=source.indexOf('  function init(){',start);
assert.ok(start>=0 && end>start);
const pickerSource=source.slice(start,end);

function fixture(){
  const names=new Set(), attributes=new Map([['data-ready','1']]);
  const overlay={hidden:true,
    classList:{add:(...values)=>values.forEach(v=>names.add(v)),remove:(...values)=>values.forEach(v=>names.delete(v))},
    getAttribute:key=>attributes.get(key),setAttribute:(key,value)=>attributes.set(key,value)};
  const rootClasses=new Set(),messages=[],stack=[null];
  let backPending=false,backCalls=0;
  const history={
    get state(){return stack.at(-1);},
    pushState(state){stack.push(state);},
    back(){backCalls++;backPending=true;}
  };
  const context=vm.createContext({
    homeBiblePickerHistoryPending:false,homeBiblePickerReopenRequested:false,homeDeparting:false,
    history,root:{querySelector:()=>null},
    document:{getElementById:()=>overlay,documentElement:{classList:{add:value=>rootClasses.add(value),remove:value=>rootClasses.delete(value)}}},
    ensureHomeBiblePicker:()=>overlay,cancelPendingCardOpens(){},
    tellHomeBiblePicker:action=>messages.push(action),closeViewer(){},closeCard(){},closeSheets(){}
  });
  vm.runInContext(pickerSource,context);
  return {context,overlay,stack,messages,get backCalls(){return backCalls;},
    completeClose(){assert.ok(backPending);backPending=false;stack.pop();context.onHomeHistoryPop();},
    browserBack(){stack.pop();context.onHomeHistoryPop();}
  };
}

test('rapid close/reopen waits for the previous history close and remains open afterward',()=>{
  const f=fixture();
  f.context.openHomeBiblePicker();
  f.context.closeHomeBiblePicker(false);
  f.context.openHomeBiblePicker();
  assert.equal(f.overlay.hidden,true,'do not expose a drawer the old popstate would close');
  assert.equal(f.context.homeBiblePickerReopenRequested,true);
  assert.equal(f.stack.length,2);
  f.completeClose();
  assert.equal(f.overlay.hidden,false,'the last user request wins after history settles');
  assert.equal(f.stack.length,2,'reopen owns exactly one new picker entry');
  assert.equal(f.stack.at(-1).ghd,'bible-picker');
  assert.equal(f.context.homeBiblePickerHistoryPending,false);
  assert.equal(f.backCalls,1);
});

test('multiple quick reopen taps create only one new entry and Back closes it normally',()=>{
  const f=fixture();
  f.context.openHomeBiblePicker();f.context.closeHomeBiblePicker(false);
  f.context.openHomeBiblePicker();f.context.openHomeBiblePicker();
  f.completeClose();
  assert.equal(f.overlay.hidden,false);assert.equal(f.stack.length,2);
  f.browserBack();
  assert.equal(f.overlay.hidden,true);assert.equal(f.stack.length,1);
  assert.equal(f.backCalls,1,'browser Back does not recursively call history.back');
});

test('an explicit close cancels a queued reopen even while the drawer is already hidden',()=>{
  const f=fixture();
  f.context.openHomeBiblePicker();f.context.closeHomeBiblePicker(false);
  f.context.openHomeBiblePicker();f.context.closeHomeBiblePicker(false);
  f.completeClose();
  assert.equal(f.overlay.hidden,true);assert.equal(f.stack.length,1);
});

test('departure or pagehide cannot resurrect a queued picker',()=>{
  for(const hidePage of [false,true]){
    const f=fixture();
    f.context.openHomeBiblePicker();f.context.closeHomeBiblePicker(false);f.context.openHomeBiblePicker();
    if(hidePage)f.context.resetHomeBiblePickerHistory();else f.context.homeDeparting=true;
    f.completeClose();
    assert.equal(f.overlay.hidden,true);assert.equal(f.stack.length,1);
  }
});

test('failed history.back releases the queue so another open remains usable',()=>{
  const f=fixture();
  f.context.openHomeBiblePicker();
  f.context.history.back=()=>{throw new Error('history unavailable');};
  f.context.closeHomeBiblePicker(false);
  assert.equal(f.context.homeBiblePickerHistoryPending,false);
  f.context.openHomeBiblePicker();
  assert.equal(f.overlay.hidden,false);assert.equal(f.stack.length,2);
});

test('normal close remains closed; close/popstate/pagehide use the shipped handlers',()=>{
  const f=fixture();
  f.context.openHomeBiblePicker();f.context.closeHomeBiblePicker(false);f.completeClose();
  assert.equal(f.overlay.hidden,true);assert.equal(f.stack.length,1);
  assert.match(source,/addEventListener\('popstate', onHomeHistoryPop\)/);
  assert.match(source,/addEventListener\('pagehide',resetHomeBiblePickerHistory\)/);
});
