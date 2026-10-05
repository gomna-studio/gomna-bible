/* Third home card: person selector and direct library detail links. */
(function () {
  'use strict';
  function init() {
    var card = document.querySelector('.gomna-home-card[data-card="2"]');
    if (!card) return;
    var select = card.querySelector('[data-home-person-select]');
    var photo = card.querySelector('[data-home-person-photo]');
    var name = card.querySelector('[data-home-person-name]');
    var title = card.querySelector('[data-home-person-title]');
    var intro = card.querySelector('[data-home-person-intro]');
    var status = card.querySelector('[data-home-person-status]');
    var items = window.GOMNA_BIBLE_LIBRARY_DATA || [];
    select.replaceChildren();
    items.filter(function (item) { return item.kind === 'people'; }).forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name;
      option.selected = item.id === 'david';
      select.appendChild(option);
    });
    var picker=select.parentElement;
    var trigger=document.createElement('button');trigger.type='button';trigger.className='home-person-picker-trigger';trigger.textContent='다윗';trigger.setAttribute('aria-expanded','false');trigger.setAttribute('aria-controls','homePersonChoices');
    function setChoicesOpen(open){choices.hidden=!open;card.classList.toggle('home-person-picker-open',open);trigger.setAttribute('aria-expanded',String(open));}
    var choices=document.createElement('div');choices.id='homePersonChoices';choices.className='home-person-choices';setChoicesOpen(false);
    items.filter(function(x){return x.kind==='people';}).forEach(function(item){var b=document.createElement('button');b.type='button';b.textContent=item.name;b.dataset.personChoice=item.id;b.addEventListener('click',function(e){e.stopPropagation();setChoicesOpen(false);trigger.setAttribute('aria-expanded','false');select.value=item.id;select.dispatchEvent(new Event('change',{bubbles:true}));trigger.focus();});choices.appendChild(b);});
    picker.appendChild(trigger);card.appendChild(choices);select.hidden=true;
    trigger.addEventListener('click',function(e){e.stopPropagation();var cardRect=card.getBoundingClientRect(),buttonRect=trigger.getBoundingClientRect();choices.style.top=(buttonRect.bottom-cardRect.top)+'px';choices.style.maxHeight=Math.max(0,cardRect.bottom-buttonRect.bottom)+'px';setChoicesOpen(choices.hidden);trigger.setAttribute('aria-expanded',String(!choices.hidden));if(!choices.hidden){var active=choices.querySelector('[data-person-choice="'+select.value+'"]');if(active){active.focus({preventScroll:true});choices.scrollTop=Math.max(0,active.offsetTop-(choices.clientHeight-active.offsetHeight)/2);}}});
    card.addEventListener('keydown',function(e){if(e.key==='Escape'){setChoicesOpen(false);trigger.setAttribute('aria-expanded','false');trigger.focus();}});
    document.addEventListener('click',function(e){if(!picker.contains(e.target)&&!choices.contains(e.target)){setChoicesOpen(false);trigger.setAttribute('aria-expanded','false');}});
    var current = 'david', request = 0;
    function show(id) {
      var item = items.find(function (x) { return x.kind === 'people' && x.id === id; });
      if (!item) return;
      var token = ++request;
      var image = new Image();
      image.src = item.image;
      select.disabled = true; trigger.disabled=true;
      status.textContent = '사진 준비 중';
      var ready = image.decode ? image.decode() : new Promise(function (resolve, reject) {
        if (image.complete) { image.naturalWidth ? resolve() : reject(); return; }
        image.onload = resolve; image.onerror = reject;
      });
      ready.then(function () {
        if (token !== request) return;
        current = id;
        select.value = id;
        photo.src = item.image;
        photo.alt = item.name + ' 인물 소개 보기';
        name.textContent = item.name; trigger.textContent=item.name;
        title.textContent = item.title;
        intro.textContent = item.intro;
        card.querySelectorAll('[data-home-person-link]').forEach(function (link) {
          link.setAttribute('data-gbl-id', id);
          link.setAttribute('aria-label', item.name + ' 인물 소개 보기');
        });
        select.disabled = false; trigger.disabled=false;
        card.querySelector('.home-person-summary').removeAttribute('data-person-pending');
        status.textContent = '';
      }).catch(function () {
        if (token !== request) return;
        select.value = current;
        select.disabled = false; trigger.disabled=false;
        status.textContent = '사진을 불러오지 못했습니다. 다시 선택해 주세요.';
      });
    }
    select.addEventListener('change', function (event) {
      event.stopPropagation(); show(select.value);
    });
    show(current);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
