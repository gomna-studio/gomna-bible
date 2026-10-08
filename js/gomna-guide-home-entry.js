(function(){
  'use strict';
  if(!window.gomnaGuideImageZoomInstalled){
    window.gomnaGuideImageZoomInstalled=true;
    document.addEventListener('click',function(event){
      var trigger=event.target.closest('.guide-image-open');
      if(!trigger)return;
      var thumbnail=trigger.querySelector('img');
      if(!thumbnail)return;
      event.preventDefault();
      var dialog=document.createElement('dialog');
      dialog.className='guide-image-dialog';
      dialog.setAttribute('aria-label',thumbnail.alt+' 확대 이미지');
      var close=document.createElement('button');
      close.type='button';close.className='guide-image-close';close.textContent='×';
      close.setAttribute('aria-label','확대 이미지 닫기');
      var image=document.createElement('img');
      image.src=thumbnail.src.replace(/\.webp(?=\?|$)/,'-large.webp');
      image.alt=thumbnail.alt;
      image.onerror=function(){image.onerror=null;image.src=thumbnail.src;};
      dialog.appendChild(close);dialog.appendChild(image);document.body.appendChild(dialog);
      close.addEventListener('click',function(){dialog.close();});
      dialog.addEventListener('click',function(e){if(e.target===dialog)dialog.close();});
      dialog.addEventListener('close',function(){dialog.remove();if(trigger.isConnected)trigger.focus({preventScroll:true});});
      dialog.showModal();close.focus({preventScroll:true});
    });
  }
  if(new URLSearchParams(location.search).get('homeGuide')!=='1')return;
  function open(){
    try{
      if(typeof window.openAllScriptureGuides!=='function')return;
      window.openAllScriptureGuides();
      var overlay=document.getElementById('scriptureAllGuidesOverlay');
      var close=overlay&&overlay.querySelector('[data-all-guides-close]');
      if(close)close.addEventListener('click',function(){location.href='index.html';});
    }finally{
      document.documentElement.classList.remove('gomna-home-guide-entering');
    }
  }
  if(document.readyState!=='loading')open();
  else document.addEventListener('DOMContentLoaded',open,{once:true});
  window.addEventListener('pageshow',function(){
    if(document.readyState==='complete')document.documentElement.classList.remove('gomna-home-guide-entering');
  });
})();
