/*! 은혜의말씀 — Home 1번 카드와 동일한 오늘의 말씀 30절 순환 (1~30일).
 * 푸시 payload도 이 파일만 사용한다. 임의 문구를 넣지 말 것.
 */
(function(root){
  'use strict';
  var VERSES=[
  {t:'네 시작은 미약하였으나 네 나중은 심히 창대하리라',r:'욥기 8:7',i18n:{en:'Though your beginning was small, yet your latter end would greatly increase.',ja:'あなたの初めは小さくあっても、あなたの終りは非常に大きくなるであろう。',zh:'你起初虽然微小，终久必甚发达。'}},
  {t:'여호와는 나의 목자시니 내게 부족함이 없으리로다',r:'시편 23:1',i18n:{en:'A Psalm by David. The LORD is my shepherd; I shall lack nothing.',ja:'主はわたしの牧者であって、わたしには乏しいことがない。',zh:'（大卫的诗）耶和华是我的牧者，我必不至缺乏。'}},
  {t:'너희 염려를 다 주께 맡겨 버리라 이는 저가 너희를 권고하심이니라',r:'베드로전서 5:7',i18n:{en:'casting all your worries on him, because he cares for you.',ja:'神はあなたがたをかえりみていて下さるのであるから、自分の思いわずらいを、いっさい神にゆだねるがよい。',zh:'你们要将一切的忧虑卸给神，因为他顾念你们。'}},
  {t:'아무 것도 염려하지 말고 오직 모든 일에 기도와 간구로 너희 구할 것을 감사함으로 하나님께 아뢰라',r:'빌립보서 4:6',i18n:{en:'In nothing be anxious, but in everything, by prayer and petition with thanksgiving, let your requests be made known to God.',ja:'何事も思い煩ってはならない。ただ、事ごとに、感謝をもって祈と願いとをささげ、あなたがたの求めるところを神に申し上げるがよい。',zh:'应当一无挂虑，只要凡事借着祷告、祈求，和感谢，将你们所要的告诉神。'}},
  {t:'하나님은 우리의 피난처시요 힘이시니 환난 중에 만날 큰 도움이시라',r:'시편 46:1',i18n:{en:'For the Chief Musician. By the sons of Korah. According to Alamoth. God is our refuge and strength, a very present help in trouble.',ja:'神はわれらの避け所また力である。悩める時のいと近き助けである。',zh:'（可拉后裔的诗歌，交与伶长。调用女音）神是我们的避难所，是我们的力量，是我们在患难中随时的帮助。'}},
  {t:'하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 저를 믿는 자마다 멸망치 않고 영생을 얻게 하려 하심이니라',r:'요한복음 3:16',i18n:{en:'For God so loved the world, that he gave his only born Son, that whoever believes in him should not perish, but have eternal life.',ja:'神はそのひとり子を賜わったほどに、この世を愛して下さった。それは御子を信じる者がひとりも滅びないで、永遠の命を得るためである。',zh:'神爱世人，甚至将他的独生子赐给他们，叫一切信他的，不至灭亡，反得永生。'}},
  {t:'사랑하는 자들아 우리가 서로 사랑하자 사랑은 하나님께 속한 것이니',r:'요한일서 4:7',i18n:{en:'Beloved, let’s love one another, for love is of God; and everyone who loves has been born of God and knows God.',ja:'愛する者たちよ。わたしたちは互に愛し合おうではないか。愛は、神から出たものなのである。すべて愛する者は、神から生れた者であって、神を知っている。',zh:'亲爱的弟兄啊，我们应当彼此相爱，因为爱是从神来的。凡有爱心的，都是由神而生，并且认识神。'}},
  {t:'그런즉 믿음, 소망, 사랑, 이 세 가지는 항상 있을 것인데 그 중에 제일은 사랑이라',r:'고린도전서 13:13',i18n:{en:'But now faith, hope, and love remain—these three. The greatest of these is love.',ja:'このように、いつまでも存続するものは、信仰と希望と愛と、この三つである。このうちで最も大いなるものは、愛である。',zh:'如今常存的有信，有望，有爱，这三样，其中最大的是爱。'}},
  {t:'내가 확신하노니 사망이나 생명이나 다른 아무 피조물이라도 우리를 우리 주 그리스도 예수 안에 있는 하나님의 사랑에서 끊을 수 없으리라',r:'로마서 8:38-39',i18n:{en:'For I am persuaded that neither death, nor life, nor angels, nor principalities, nor things present, nor things to come, nor powers, nor height, nor depth, nor any other created thing will be able to separate us from God’s love which is in Christ Jesus our Lord.',ja:'わたしは確信する。死も生も、天使も支配者も、現在のものも将来のものも、力あるものも、 高いものも深いものも、その他どんな被造物も、わたしたちの主キリスト・イエスにおける神の愛から、わたしたちを引き離すことはできないのである。',zh:'因为我深信无论是死，是生，是天使，是掌权的，是有能的，是现在的事，是将来的事，是高处的，是低处的，是别的受造之物，都不能叫我们与神的爱隔绝；这爱是在我们的主基督耶稣里的。'}},
  {t:'내게 능력 주시는 자 안에서 내가 모든 것을 할 수 있느니라',r:'빌립보서 4:13',i18n:{en:'I can do all things through Christ who strengthens me.',ja:'わたしを強くして下さるかたによって、何事でもすることができる。',zh:'我靠着那加给我力量的，凡事都能作。'}},
  {t:'믿음은 바라는 것들의 실상이요 보지 못하는 것들의 증거니',r:'히브리서 11:1',i18n:{en:'Now faith is assurance of things hoped for, proof of things not seen.',ja:'さて、信仰とは、望んでいる事がらを確信し、まだ見ていない事実を確認することである。',zh:'信就是所望之事的实底，是未见之事的确据。'}},
  {t:'예수께서 이르시되 할 수 있거든이 무슨 말이냐 믿는 자에게는 능치 못할 일이 없느니라',r:'마가복음 9:23',i18n:{en:'Jesus said to him, “If you can believe, all things are possible to him who believes.”',ja:'イエスは彼に言われた、「もしできれば、と言うのか。信ずる者には、どんな事でもできる」。',zh:'耶稣对他说：「你若能信，在信的人，凡事都能。」'}},
  {t:'너희 중에 누구든지 지혜가 부족하거든 모든 사람에게 후히 주시고 꾸짖지 아니하시는 하나님께 구하라 그리하면 주시리라',r:'야고보서 1:5',i18n:{en:'But if any of you lacks wisdom, let him ask of God, who gives to all liberally and without reproach, and it will be given to him.',ja:'あなたがたのうち、知恵に不足している者があれば、その人は、とがめもせずに惜しみなくすべての人に与える神に、願い求めるがよい。そうすれば、与えられるであろう。',zh:'你们中间若有缺少智慧的，应当求那厚赐与众人、也不斥责人的神，主就必赐给他。'}},
  {t:'여호와의 말씀이니라 너희를 향한 나의 생각을 내가 아나니 평안이요 재앙이 아니니라 너희에게 미래와 희망을 주려 하는 생각이라',r:'예레미야 29:11',i18n:{en:'For I know the thoughts that I think toward you,” says the LORD, “thoughts of peace, and not of evil, to give you hope and a future.',ja:'主は言われる、わたしがあなたがたに対していだいている計画はわたしが知っている。それは災を与えようというのではなく、平安を与えようとするものであり、あなたがたに将来を与え、希望を与えようとするものである。',zh:'耶和华说：我知道我向你们所怀的意念是赐平安的意念，不是降灾祸的意念，要叫你们末后有指望。'}},
  {t:'우리가 알거니와 하나님을 사랑하는 자 곧 그 뜻대로 부르심을 입은 자들에게는 모든 것이 합력하여 선을 이루느니라',r:'로마서 8:28',i18n:{en:'We know that all things work together for good for those who love God, for those who are called according to his purpose.',ja:'神は、神を愛する者たち、すなわち、ご計画に従って召された者たちと共に働いて、万事を益となるようにして下さることを、わたしたちは知っている。',zh:'我们晓得万事都互相效力，叫爱神的人得益处，就是按他旨意被召的人。'}},
  {t:'오직 여호와를 앙망하는 자는 새 힘을 얻으리니 독수리의 날개치며 올라감 같을 것이요',r:'이사야 40:31',i18n:{en:'but those who wait for the LORD will renew their strength. They will mount up with wings like eagles. They will run, and not be weary. They will walk, and not faint.',ja:'しかし主を待ち望む者は新たなる力を得、わしのように翼をはって、のぼることができる。走っても疲れることなく、歩いても弱ることはない。',zh:'但那等候耶和华的必从新得力。他们必如鹰展翅上腾；他们奔跑却不困倦，行走却不疲乏。'}},
  {t:'너는 마음을 다하여 여호와를 의뢰하고 네 명철을 의지하지 말라',r:'잠언 3:5',i18n:{en:'Trust in the LORD with all your heart, and don’t lean on your own understanding.',ja:'心をつくして主に信頼せよ、自分の知識にたよってはならない。',zh:'你要专心仰赖耶和华，不可倚靠自己的聪明，'}},
  {t:'주의 말씀은 내 발에 등이요 내 길에 빛이니이다',r:'시편 119:105',i18n:{en:'Your word is a lamp to my feet, and a light for my path.',ja:'あなたのみ言葉はわが足のともしび、わが道の光です。',zh:'你的话是我脚前的灯，是我路上的光。'}},
  {t:'사람이 마음으로 자기의 길을 계획할지라도 그 걸음을 인도하시는 자는 여호와시니라',r:'잠언 16:9',i18n:{en:'A man’s heart plans his course, but the LORD directs his steps.',ja:'人は心に自分の道を考え計る、しかし、その歩みを導く者は主である。',zh:'人心筹算自己的道路；惟耶和华指引他的脚步。'}},
  {t:'강하고 담대하라 두려워 말며 놀라지 말라 네가 어디로 가든지 네 하나님 여호와가 너와 함께 하느니라',r:'여호수아 1:9',i18n:{en:'Haven’t I commanded you? Be strong and courageous. Don’t be afraid. Don’t be dismayed, for the LORD your God is with you wherever you go.”',ja:'わたしはあなたに命じたではないか。強く、また雄々しくあれ。あなたがどこへ行くにも、あなたの神、主が共におられるゆえ、恐れてはならない、おののいてはならない」。',zh:'我岂没有吩咐你么？你当刚强壮胆！不要惧怕，也不要惊惶；因为你无论往那里去，耶和华你的神必与你同在。」'}},
  {t:'두려워 말라 내가 너와 함께 함이니라 놀라지 말라 나는 네 하나님이 됨이니라',r:'이사야 41:10',i18n:{en:'Don’t you be afraid, for I am with you. Don’t be dismayed, for I am your God. I will strengthen you. Yes, I will help you. Yes, I will uphold you with the right hand of my righteousness.',ja:'恐れてはならない、わたしはあなたと共にいる。驚いてはならない、わたしはあなたの神である。わたしはあなたを強くし、あなたを助け、わが勝利の右の手をもって、あなたをささえる。',zh:'你不要害怕，因为我与你同在；不要惊惶，因为我是你的神。我必坚固你，我必帮助你；我必用我公义的右手扶持你。'}},
  {t:'마음을 강하게 하고 담대히 하라 그들을 두려워 말라 그들 앞에서 떨지 말라',r:'신명기 31:6',i18n:{en:'Be strong and courageous. Don’t be afraid or scared of them, for the LORD your God himself is who goes with you. He will not fail you nor forsake you.”',ja:'あなたがたは強く、かつ勇ましくなければならない。彼らを恐れ、おののいてはならない。あなたの神、主があなたと共に行かれるからである。主は決してあなたを見放さず、またあなたを見捨てられないであろう」。',zh:'你们当刚强壮胆，不要害怕，也不要畏惧他们，因为耶和华你的神和你同去。他必不撇下你，也不丢弃你。」'}},
  {t:'하나님이 우리에게 주신 것은 두려워하는 마음이 아니요 오직 능력과 사랑과 근신하는 마음이니',r:'디모데후서 1:7',i18n:{en:'For God didn’t give us a spirit of fear, but of power, love, and self-control.',ja:'というのは、神がわたしたちに下さったのは、臆する霊ではなく、力と愛と慎みとの霊なのである。',zh:'因为神赐给我们，不是胆怯的心，乃是刚强、仁爱、谨守的心。'}},
  {t:'구하라 그러면 너희에게 주실 것이요 찾으라 그러면 찾을 것이요 문을 두드리라 그러면 너희에게 열릴 것이니',r:'마태복음 7:7',i18n:{en:'“Ask, and it will be given you. Seek, and you will find. Knock, and it will be opened for you.',ja:'求めよ、そうすれば、与えられるであろう。捜せ、そうすれば、見いだすであろう。門をたたけ、そうすれば、あけてもらえるであろう。',zh:'「你们祈求，就给你们；寻找，就寻见；叩门，就给你们开门。'}},
  {t:'이러므로 너희 죄를 서로 고하며 병 낫기를 위하여 서로 기도하라 의인의 간구는 역사하는 힘이 많으니라',r:'야고보서 5:16',i18n:{en:'Confess your sins to one another and pray for one another, that you may be healed. The insistent prayer of a righteous person is powerfully effective.',ja:'だから、互に罪を告白し合い、また、いやされるようにお互のために祈りなさい。義人の祈は、大いに力があり、効果のあるものである。',zh:'所以你们要彼此认罪，互相代求，使你们可以得医治。义人祈祷所发的力量是大有功效的。'}},
  {t:'쉬지 말고 기도하라',r:'데살로니가전서 5:17',i18n:{en:'Pray without ceasing.',ja:'絶えず祈りなさい。',zh:'不住的祷告，'}},
  {t:'감사함으로 그 문에 들어가며 찬송함으로 그 궁정에 들어가서 그에게 감사하며 그 이름을 송축할지어다',r:'시편 100:4',i18n:{en:'Enter into his gates with thanksgiving, and into his courts with praise. Give thanks to him, and bless his name.',ja:'感謝しつつ、その門に入り、ほめたたえつつ、その大庭に入れ。主に感謝し、そのみ名をほめまつれ。',zh:'当称谢进入他的门；当赞美进入他的院。当感谢他，称颂他的名！'}},
  {t:'주 안에서 항상 기뻐하라 내가 다시 말하노니 기뻐하라',r:'빌립보서 4:4',i18n:{en:'Rejoice in the Lord always! Again I will say, “Rejoice!”',ja:'あなたがたは、主にあっていつも喜びなさい。繰り返して言うが、喜びなさい。',zh:'你们要靠主常常喜乐。我再说，你们要喜乐。'}},
  {t:'범사에 감사하라 이는 그리스도 예수 안에서 너희를 향하신 하나님의 뜻이니라',r:'데살로니가전서 5:18',i18n:{en:'In everything give thanks, for this is the will of God in Christ Jesus toward you.',ja:'すべての事について、感謝しなさい。これが、キリスト・イエスにあって、神があなたがたに求めておられることである。',zh:'凡事谢恩；因为这是神在基督耶稣里向你们所定的旨意。'}},
  {t:'수고하고 무거운 짐 진 자들아 다 내게로 오라 내가 너희를 쉬게 하리라',r:'마태복음 11:28',i18n:{en:'“Come to me, all you who labor and are heavily burdened, and I will give you rest.',ja:'すべて重荷を負うて苦労している者は、わたしのもとにきなさい。あなたがたを休ませてあげよう。',zh:'凡劳苦担重担的人可以到我这里来，我就使你们得安息。'}}
];

  var TITLES={ko:'오늘의 말씀',en:"Today's Word",ja:'今日のみことば',zh:'今日的话语'};
  var SECOND_TITLES={ko:'오늘의 말씀을 다시 묵상해보세요',en:'Meditate on today’s Word again',ja:'今日のみことばをもう一度黙想してみましょう',zh:'再默想一次今日的话语'};
  var BOOK_NAMES={
    '욥기':{en:'Job',ja:'ヨブ記',zh:'约伯记'},
    '시편':{en:'Psalm',ja:'詩篇',zh:'诗篇'},
    '베드로전서':{en:'1 Peter',ja:'ペテロの第一の手紙',zh:'彼得前书'},
    '빌립보서':{en:'Philippians',ja:'ピリピ人への手紙',zh:'腓立比书'},
    '요한복음':{en:'John',ja:'ヨハネによる福音書',zh:'约翰福音'},
    '요한일서':{en:'1 John',ja:'ヨハネの第一の手紙',zh:'约翰一书'},
    '고린도전서':{en:'1 Corinthians',ja:'コリント人への第一の手紙',zh:'哥林多前书'},
    '로마서':{en:'Romans',ja:'ローマ人への手紙',zh:'罗马书'},
    '히브리서':{en:'Hebrews',ja:'ヘブル人への手紙',zh:'希伯来书'},
    '마가복음':{en:'Mark',ja:'マルコによる福音書',zh:'马可福音'},
    '야고보서':{en:'James',ja:'ヤコブの手紙',zh:'雅各书'},
    '예레미야':{en:'Jeremiah',ja:'エレミヤ書',zh:'耶利米书'},
    '이사야':{en:'Isaiah',ja:'イザヤ書',zh:'以赛亚书'},
    '잠언':{en:'Proverbs',ja:'箴言',zh:'箴言'},
    '여호수아':{en:'Joshua',ja:'ヨシュア記',zh:'约书亚记'},
    '신명기':{en:'Deuteronomy',ja:'申命記',zh:'申命记'},
    '디모데후서':{en:'2 Timothy',ja:'テモテへの第二の手紙',zh:'提摩太后书'},
    '마태복음':{en:'Matthew',ja:'マタイによる福音書',zh:'马太福音'},
    '데살로니가전서':{en:'1 Thessalonians',ja:'テサロニケ人への第一の手紙',zh:'帖撒罗尼迦前书'}
  };
  function pad2(n){return (n<10?'0':'')+n;}
  function kstParts(d){
    d=d||new Date();
    var s=d.toLocaleString('en-US',{timeZone:'Asia/Seoul'});
    var x=new Date(s);
    return {y:x.getFullYear(),m:x.getMonth()+1,day:x.getDate()};
  }
  function kstDateKey(d){
    var p=kstParts(d);
    return p.y+'-'+pad2(p.m)+'-'+pad2(p.day);
  }
  function parseDateKey(key){
    var m=String(key||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!m)return null;
    return {y:+m[1],m:+m[2],day:+m[3]};
  }
  function verseIndexForDay(day){
    return ((Number(day)-1)%30+30)%30;
  }
  function getVerseForDate(d){
    var day;
    if(typeof d==='string'){
      var p=parseDateKey(d);
      day=p?p.day:kstParts().day;
    }else if(d&&typeof d==='object'&&d.day){
      day=d.day;
    }else{
      day=kstParts(d).day;
    }
    return VERSES[verseIndexForDay(day)];
  }
  function parseRef(ref){
    var m=String(ref||'').trim().match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
    if(!m)return {book:String(ref||'').trim(),chapter:1,startVerse:1,endVerse:1};
    var start=parseInt(m[3],10);
    var end=m[4]?parseInt(m[4],10):start;
    return {book:m[1].trim(),chapter:parseInt(m[2],10),startVerse:start,endVerse:end};
  }
  function localizeRef(refKo, locale){
    locale=locale||'ko';
    if(locale==='ko')return refKo;
    var parsed=parseRef(refKo);
    var names=BOOK_NAMES[parsed.book];
    var book=(names&&names[locale])||parsed.book;
    var range=parsed.chapter+':'+parsed.startVerse+(parsed.endVerse>parsed.startVerse?'-'+parsed.endVerse:'');
    return book+' '+range;
  }
  function nativeLocale(raw){
    var s=String(raw||'ko').toLowerCase();
    if(s==='ko'||s==='en'||s==='ja'||s==='zh')return s;
    if(s.indexOf('zh')===0)return 'zh';
    if(s.indexOf('ja')===0)return 'ja';
    if(s.indexOf('en')===0)return 'en';
    return 'ko';
  }
  function bibleVersion(locale){
    return {ko:'KRV',en:'WEBP',ja:'Kougo',zh:'CUV'}[nativeLocale(locale)]||'KRV';
  }
  function truncateBody(text, max){
    max=max||90;
    var t=String(text||'').replace(/^["“]+|["”]+$/g,'').trim();
    if(t.length<=max)return t;
    return t.slice(0,max-1)+'…';
  }
  function resolveVerse(opts){
    opts=opts||{};
    var dateKey=opts.date||kstDateKey();
    var locale=nativeLocale(opts.locale);
    var v=getVerseForDate(dateKey);
    var body=(locale!=='ko'&&v.i18n&&v.i18n[locale])?v.i18n[locale]:v.t;
    var parsed=parseRef(v.r);
    var refText=localizeRef(v.r, locale);
    return {
      date:dateKey,
      locale:locale,
      bibleVersion:bibleVersion(locale),
      canonicalRef:v.r,
      refText:refText,
      body:body,
      preview:truncateBody(body,90),
      book:parsed.book,
      chapter:parsed.chapter,
      startVerse:parsed.startVerse,
      endVerse:parsed.endVerse,
      verseId:dateKey+'|'+v.r
    };
  }
  function buildPayload(opts){
    opts=opts||{};
    var r=resolveVerse(opts);
    var slot=opts.slot==='second'?'second':'first';
    var title=slot==='second'?(SECOND_TITLES[r.locale]||SECOND_TITLES.ko):(TITLES[r.locale]||TITLES.ko);
    var url='/?source=home-today&date='+encodeURIComponent(r.date);
    return {
      title:title,
      body:r.refText+'\n'+r.preview,
      lang:r.locale,
      tag:'gomna-today-'+r.date+'-'+slot,
      icon:'/icon-192.png',
      badge:'/icon-192.png',
      verseId:r.verseId,
      data:{
        source:'home-today',
        date:r.date,
        slot:slot,
        book:r.book,
        chapter:r.chapter,
        startVerse:r.startVerse,
        endVerse:r.endVerse,
        locale:r.locale,
        url:url
      }
    };
  }
  var api={
    verses:VERSES,
    titles:TITLES,
    kstDateKey:kstDateKey,
    getVerseForDate:getVerseForDate,
    verseIndexForDay:verseIndexForDay,
    parseRef:parseRef,
    resolveVerse:resolveVerse,
    buildPayload:buildPayload
  };
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.GomnaDailyVerses=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:this);
