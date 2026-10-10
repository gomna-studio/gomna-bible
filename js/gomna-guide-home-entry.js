(function(){
  'use strict';
  function largeImageSrc(thumbnail){
    return thumbnail.src.replace(/\.webp(?=\?|$)/,'-large.webp');
  }
  function openImageOnlyViewer(trigger,thumbnail){
    var scrollers=[];
    for(var node=trigger.parentElement;node&&node!==document.documentElement;node=node.parentElement){
      if(node.scrollHeight>node.clientHeight||node.scrollWidth>node.clientWidth)scrollers.push([node,node.scrollTop,node.scrollLeft]);
    }
    var pageX=window.scrollX,pageY=window.scrollY;
    var viewer=document.createElement('dialog');
    viewer.className='guide-image-viewer';
    viewer.setAttribute('aria-label',thumbnail.alt+' 확대 이미지. 이미지를 누르면 닫힙니다.');
    viewer.tabIndex=-1;
    var image=document.createElement('img');
    image.alt=thumbnail.alt;
    image.decoding='async';
    image.draggable=false;
    image.onload=function(){viewer.classList.add('is-ready');};
    image.onerror=function(){image.onerror=null;image.src=thumbnail.src;};
    image.src=largeImageSrc(thumbnail);
    viewer.appendChild(image);
    // A close tap must start inside the viewer, so the opening tap can never close it.
    var tapStarted=false,multiTouch=false,touchCount=0,startX=0,startY=0,moved=false;
    viewer.addEventListener('pointerdown',function(e){
      if(!e.isPrimary)return;
      tapStarted=true;moved=false;startX=e.clientX;startY=e.clientY;
    });
    viewer.addEventListener('pointermove',function(e){
      if(tapStarted&&e.isPrimary&&Math.abs(e.clientX-startX)+Math.abs(e.clientY-startY)>12)moved=true;
    });
    viewer.addEventListener('touchstart',function(e){
      touchCount=e.touches.length;
      multiTouch=touchCount>1;
    },{passive:true});
    viewer.addEventListener('touchmove',function(e){
      if(e.touches.length<2)e.preventDefault();
    },{passive:false});
    viewer.addEventListener('touchend',function(e){
      touchCount=e.touches.length;
    },{passive:true});
    viewer.addEventListener('wheel',function(e){e.preventDefault();},{passive:false});
    viewer.addEventListener('click',function(e){
      e.preventDefault();
      e.stopPropagation();
      var shouldClose=tapStarted&&!moved&&!multiTouch&&touchCount===0;
      tapStarted=false;moved=false;
      if(touchCount===0)multiTouch=false;
      if(shouldClose)viewer.close();
    });
    viewer.addEventListener('keydown',function(e){
      if(e.key!=='Escape')return;
      e.preventDefault();
      e.stopPropagation();
      viewer.close();
    });
    viewer.addEventListener('cancel',function(e){e.preventDefault();viewer.close();});
    viewer.addEventListener('close',function(){
      viewer.remove();
      scrollers.forEach(function(item){item[0].scrollTop=item[1];item[0].scrollLeft=item[2];});
      if(window.scrollX!==pageX||window.scrollY!==pageY)window.scrollTo(pageX,pageY);
      if(trigger.isConnected)trigger.focus({preventScroll:true});
    });
    document.body.appendChild(viewer);
    viewer.showModal();
    viewer.focus({preventScroll:true});
  }
  if(!window.gomnaGuideImageZoomInstalled){
    window.gomnaGuideImageZoomInstalled=true;
    document.addEventListener('click',function(event){
      var trigger=event.target.closest('#scriptureAllGuidesBody .guide-image-open');
      if(!trigger)return;
      var thumbnail=trigger.querySelector('img');
      if(!thumbnail)return;
      event.preventDefault();
      openImageOnlyViewer(trigger,thumbnail);
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
