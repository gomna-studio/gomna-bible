/* Retain one login choice while the existing Auth module is still arriving. */
(function(){
  'use strict';
  var pending=null, observer=null;
  var settled=document.readyState==='complete';
  var ownNotice=null;
  var failureText='로그인 화면을 열지 못했습니다. 연결을 확인한 뒤 페이지를 새로고침해 주세요.';

  function isOpen(modal){
    return !!(modal&&modal.classList.contains('show')&&!modal.hidden);
  }
  function clearNotice(){
    if(ownNotice&&ownNotice.textContent===failureText){ownNotice.hidden=true;ownNotice.textContent='';}
    ownNotice=null;
  }
  function cancel(){
    if(pending&&pending.button)pending.button.removeAttribute('aria-busy');
    pending=null;
    if(observer){observer.disconnect();observer=null;}
  }
  function isReady(button){
    if(button.classList.contains('login-provider--email')){
      return !!(window.GomnaAuth&&typeof window.GomnaAuth.openEmailLogin==='function');
    }
    return button.getAttribute('data-gomna-auth-bound')==='1';
  }
  function fail(){
    var modal=pending&&pending.modal;
    cancel();
    if(!isOpen(modal))return;
    var notice=modal.querySelector('#loginNextStepNotice');
    if(notice){notice.textContent=failureText;notice.hidden=false;ownNotice=notice;}
  }
  function replay(){
    if(!pending)return false;
    var choice=pending;
    if(!isOpen(choice.modal)||!choice.button.isConnected||!choice.modal.contains(choice.button)){
      cancel();return false;
    }
    if(!isReady(choice.button))return false;
    cancel();clearNotice();
    try{choice.button.click();}catch(e){
      pending=choice;
      fail();
    }
    return true;
  }
  function watchClose(modal){
    if(typeof window.MutationObserver!=='function')return;
    observer=new window.MutationObserver(function(records){
      if(!pending)return;
      // A close followed by a reopen in the same turn still cancels the old tap.
      var reopened=records.some(function(record){
        return record.attributeName==='class'&&!/(?:^|\s)show(?:\s|$)/.test(record.oldValue||'');
      });
      if(!isOpen(modal)||reopened){cancel();clearNotice();}
    });
    observer.observe(modal,{attributes:true,attributeFilter:['class','hidden'],attributeOldValue:true});
  }
  document.addEventListener('click',function(event){
    var target=event.target&&event.target.closest?event.target:null;
    if(!target)return;
    var modal=document.getElementById('loginModal');
    if(target===modal||target.closest('#loginModal .login-close, #loginModal .login-skip')){
      cancel();clearNotice();return;
    }
    var button=target.closest('#loginModal .login-provider');
    if(!button||!isOpen(modal))return;
    var provider=button.getAttribute('data-auth-provider');
    if(!button.classList.contains('login-provider--email')&&provider!=='google'&&provider!=='kakao'&&provider!=='custom:naver')return;
    if(isReady(button)){cancel();clearNotice();return;}
    // Let already connected controls keep their native inline/direct handlers.
    event.preventDefault();event.stopImmediatePropagation();
    cancel();clearNotice();
    pending={button:button,modal:modal};
    button.setAttribute('aria-busy','true');
    watchClose(modal);
    if(settled)fail();
  },true);
  function isAuthScript(node){
    return !!(node&&node.tagName==='SCRIPT'&&/\/gomna-auth\.js(?:\?|$)/.test(node.src||''));
  }
  document.addEventListener('load',function(event){
    if(isAuthScript(event.target))replay();
  },true);
  document.addEventListener('error',function(event){
    if(!isAuthScript(event.target))return;
    settled=true;
    if(pending&&!replay())fail();
  },true);
  document.addEventListener('DOMContentLoaded',function(){
    // A later DOMContentLoaded listener can install the native Auth handlers.
    window.setTimeout(function(){settled=true;if(pending&&!replay())fail();},0);
  },{once:true});
  document.addEventListener('keydown',function(event){
    if(event.key==='Escape'){cancel();clearNotice();}
  },true);
  window.addEventListener('pagehide',function(){cancel();clearNotice();});
})();
