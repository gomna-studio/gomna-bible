/* Native click handlers remain the single source of navigation. */
(function(){
  'use strict';
  var tap=null;
  function control(el){return el&&el.closest?el.closest('#gomnaHomeTabbar .gomna-home-tab'):null;}
  document.addEventListener('touchstart',function(e){
    tap=null;
    if(e.touches.length!==1)return;
    var el=control(e.target),p=e.touches[0];
    if(el)tap={el:el,x:p.clientX,y:p.clientY,time:Date.now(),moved:false};
  },{passive:true});
  document.addEventListener('touchmove',function(e){
    if(!tap)return;
    if(e.touches.length!==1){tap=null;return;}
    var p=e.touches[0];
    if(Math.hypot(p.clientX-tap.x,p.clientY-tap.y)>12)tap.moved=true;
  },{passive:true});
  document.addEventListener('touchcancel',function(){tap=null;},{passive:true});
  document.addEventListener('touchend',function(e){
    var current=tap;tap=null;
    if(!current||current.moved||e.touches.length||Date.now()-current.time>=750||control(e.target)!==current.el)return;
    if(!e.cancelable)return;
    e.preventDefault(); // Suppress the later native click; dispatch exactly once now.
    current.el.click();
  },{passive:false});
})();
