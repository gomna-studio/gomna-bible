/* GOMNA HOME 3-CARD STACK 20260904
   Backup 로직(fillCopy, flip, social, reader target)을 3장만 쓰도록 재구성.
   묵상 패널·8장 덱·휠 가로채기는 복구하지 않는다. */
(function(){
  var root, stage, cards=[], count=3, progress=0, raf=0, reduce=false;
  var pointerY=0, pointerX=0, pointerT=0, pointerMoved=false, scrollQuiet=true, scrollQuietTimer=0;
  var openScrollY=0, flipping=false;
  var card2Settled=false, card3Settled=false, allowCard3=false, allowCard1From2=false, allowCard2From3=false;
  var awaitingDir=false, gestureLive=false, gestureEndedSinceSettle=false;
  var settleAnim=false, settleAnimTimer=0, wheelIdleTimer=0, lastP=0;
  var pinching=false, pinchScrollY=0, lifeImgsPreloaded=false, storyImgsPreloaded=false;
  var swipeDrag=null, swipeHandled=false;
  var SETTLE_AT=0.32;
  var SETTLE_MS=180;
  var SWIPE_PX=36;
  var SWIPE_VEL=0.28;
  var H_SWIPE_PX=28;
  var H_SWIPE_VEL=0.22;
  var AXIS_PX=16;
  var AXIS_RATIO=1.25;
  var LIFE_THEME_IMGS={
    new:'assets/home/meditation/v5-card-new-life.png?v=20260908-mist-v1',
    prayer:'assets/home/meditation/v10-card-prayer-life.png?v=20260909-clean-v1',
    blessed:'assets/home/meditation/v12-card-blessed-life.png?v=20260909-blessed-v12b',
    faith:'assets/home/meditation/v6-card-faith-life.png?v=20260908-partial-v1',
    love:'assets/home/meditation/v10-card-love-life.png?v=20260909-clean-v1',
    wisdom:'assets/home/meditation/v5-card-wisdom-life.png?v=20260908-mist-v1',
    hope:'assets/home/meditation/v11-card-hope-life.png?v=20260909-hope-v11'
  };
  var STORY_PERSON_IMGS={
    abraham:'assets/home/stories/v1-story-abraham.png?v=20260909-story-v1',
    moses:'assets/home/stories/v1-story-moses.png?v=20260909-story-v1',
    david:'assets/home/stories/v1-story-david.png?v=20260909-story-v1',
    joseph:'assets/home/stories/v1-story-joseph.png?v=20260909-story-v1',
    lot:'assets/home/stories/v1-story-lot.png?v=20260909-story-v1',
    esther:'assets/home/stories/v1-story-esther.png?v=20260909-story-v1',
    paul:'assets/home/stories/v1-story-paul.png?v=20260909-story-v1'
  };
  var NOTE_KEY='gomna_home_response_';
  var socialState={verseId:'', likeCount:0, liked:false, commentCount:0, comments:null};
  var socialBusy=false;
  var socialGuestMem='';
  var socialCommentAt=0;
  var SOCIAL_DEVICE_KEY='gomna_home_social_device';
  var SOCIAL_NAME_KEY='gomna_home_social_name';
  var SOCIAL_COMMENT_IDS='gomna_home_social_comment_ids';
  var LIFE_THEME_DEFAULT='new';
  var lifeThemeId=LIFE_THEME_DEFAULT;
  var STORY_PERSON_DEFAULT='david';
  var storyPersonId=STORY_PERSON_DEFAULT;
  var STORY_PEOPLE=[
    {
      id:'abraham', name:'아브라함',
      title:'보이지 않아도\n걸어갑니다',
      verseRef:'창세기 12:1-4',
      reflection:'하나님은 모든 길을 먼저 보여주신 뒤 부르시지 않으셨습니다.\n아브라함은 약속을 믿고 한 걸음을 내디뎠습니다.',
      step:'오늘 내가 미루고 있는 순종 한 가지를 떠올려 보세요.'
    },
    {
      id:'moses', name:'모세',
      title:'두려워도 부르심은\n시작됩니다',
      verseRef:'출애굽기 3:11-12',
      reflection:'모세는 부족하다고 말했습니다.\n그러나 하나님은 “내가 너와 함께 있으리라” 하셨습니다.\n두려움보다 함께하심이 먼저입니다.',
      step:'오늘 피하고 싶은 일 앞에서, 하나님이 함께하심을 한 번 고백해 보세요.'
    },
    {
      id:'david', name:'다윗',
      title:'마음의 중심을\n보시는 하나님',
      verseRef:'사무엘상 16:7',
      reflection:'하나님은 겉모습보다 중심을 보십니다.\n다윗은 넘어져도 다시 주님께 돌아갔습니다.\n강한 사람보다, 하나님을 찾는 사람이 됩니다.',
      step:'오늘 하나님 앞에 솔직히 내놓고 싶은 마음을 한 가지 떠올려 보세요.'
    },
    {
      id:'joseph', name:'요셉',
      title:'기다림 속에도\n뜻이 있습니다',
      verseRef:'창세기 50:20',
      reflection:'지연은 버려짐이 아닙니다.\n보이지 않는 시간에도 하나님은 일하고 계셨습니다.\n기다림은 준비의 다른 이름이었습니다.',
      step:'오늘 더디게만 느껴지는 일 하나를 하나님께 잠시 맡겨 보세요.'
    },
    {
      id:'lot', name:'롯',
      title:'보기 좋은 길이\n늘 바른 길은 아닙니다',
      verseRef:'창세기 13:10-11',
      reflection:'롯은 눈에 좋아 보이는 땅을 택했습니다.\n선택은 삶의 방향을 만듭니다.\n가까운 이익보다 바른 길이 있습니다.',
      step:'오늘 내가 고르려는 길이 단지 편한 길인지 살펴보세요.'
    },
    {
      id:'esther', name:'에스더',
      title:'이때를 위한\n부르심',
      verseRef:'에스더 4:14',
      reflection:'당신이 선 자리는 우연이 아닐 수 있습니다.\n에스더는 두려움보다 사명을 택했습니다.\n이때를 위한 용기가 있습니다.',
      step:'오늘 내가 서 있는 자리에서 할 수 있는 선한 한 걸음을 떠올려 보세요.'
    },
    {
      id:'paul', name:'바울',
      title:'은혜는 사람을\n바꿉니다',
      verseRef:'고린도전서 15:10',
      reflection:'바울의 과거보다 하나님의 은혜가 더 컸습니다.\n바뀐 삶은 그 자체로 복음이 됩니다.',
      step:'오늘 은혜로 새롭게 하고 싶은 한 가지를 마음에 두세요.'
    }
  ];
  var LIFE_THEMES=[
    {
      id:'new', name:'새로운 삶',
      title:'다시 시작해도\n괜찮습니다',
      verseRef:'고린도후서 5:17',
      teaser:'어제의 실패가 오늘을 결정하지 않습니다.\n하나님 안에서는 다시 시작할 수 있습니다.',
      reflection:'어제의 실수가\n오늘의 나를 결정하지 않습니다.\n\n하나님은 닫힌 문 앞에서도\n새로운 길을 준비하십니다.',
      question:'오늘 하나님이 새롭게 하시기를 바라는 삶의 한 부분은 무엇입니까?',
      step:'오늘 하나만 새롭게 시작해 보세요.',
      prayer:'주님, 어제에 머물지 않고\n오늘 주시는 새 길을 걷게 하소서.'
    },
    {
      id:'prayer', name:'기도하는 삶',
      title:'말이 없어도\n기도는 시작됩니다',
      verseRef:'빌립보서 4:6-7',
      teaser:'아무것도 염려하지 말고, 감사함으로 아뢰십시오.\n구할 것이 있을 때 먼저 하나님께 맡기는 길이 있습니다.',
      reflection:'무슨 말을 해야 할지\n모르는 날이 있습니다.\n\n그저 주님 앞에 머무는 것,\n그것도 기도입니다.',
      question:'오늘 하나님께 아뢰고 싶은 한 가지는 무엇입니까?',
      step:'지금 마음에 가장 무거운 한 가지를\n주님께 말씀드려 보세요.',
      prayer:'주님, 염려를 품고 홀로 서 있지 않고\n모든 마음을 주님께 맡기게 하소서.'
    },
    {
      id:'blessed', name:'복된 삶',
      title:'주님 안에\n뿌리내린 삶이 복입니다',
      verseRef:'시편 1:1-3',
      teaser:'복 있는 사람은 하나님의 말씀을 즐거워합니다.\n그 삶은 시냇가에 심은 나무처럼 자리를 잡습니다.',
      reflection:'복은 많이 가지는 데서\n시작되지 않습니다.\n\n하나님의 말씀 곁에 머무는 사람에게\n조용히 스며듭니다.',
      question:'오늘 말씀을 즐거워하는 삶은 어떤 모습일까요?',
      step:'오늘 잠시 멈추고\n말씀 한 절을 마음에 머물게 하세요.',
      prayer:'주님, 세상의 기준보다\n주님 안의 복을 먼저 구하게 하소서.'
    },
    {
      id:'faith', name:'믿음의 삶',
      title:'보이지 않아도\n걸을 수 있습니다',
      verseRef:'히브리서 11:1',
      teaser:'믿음은 바라는 것들의 실상이요\n보이지 않는 것들의 증거입니다.',
      reflection:'믿음은 모든 답을 아는 확신이 아니라\n\n주님이 함께하신다는 약속을\n붙드는 용기입니다.',
      question:'오늘 보이지 않아도 주님께 맡기고 싶은 일은 무엇입니까?',
      step:'오늘 두려운 일 하나 앞에서\n작은 순종을 선택하세요.',
      prayer:'주님, 보이지 않는 길에서도\n주님의 손을 신뢰하게 하소서.'
    },
    {
      id:'love', name:'사랑하는 삶',
      title:'사랑은 가까운 사람부터\n시작됩니다',
      verseRef:'요한복음 13:34',
      teaser:'사랑은 우리가 먼저 만들어 내는 것이 아닙니다.\n이미 받은 사랑에서 흘러나옵니다.',
      reflection:'사랑은 큰 말보다\n\n따뜻한 시선과\n다정한 기다림으로 전해집니다.\n\n주님의 사랑이 오늘\n우리의 말과 표정에 머물게 하소서.',
      question:'오늘 내가 받은 사랑을 누구에게 전할 수 있을까요?',
      step:'오늘 한 사람에게\n따뜻한 말 한마디를 건네 보세요.',
      prayer:'주님, 받은 사랑을\n흘려보내는 하루가 되게 하소서.'
    },
    {
      id:'wisdom', name:'지혜로운 삶',
      title:'지혜가 필요할 때\n하나님께 구하십시오',
      verseRef:'야고보서 1:5',
      teaser:'오늘 필요한 지혜는 멀리 있지 않습니다.\n하나님은 구하는 자에게 후히 주십니다.',
      reflection:'지혜는 서두르지 않고\n주님의 뜻을 분별하는 마음입니다.\n\n조용히 묻는 사람에게\n하나님은 길을 밝혀 보여 주십니다.',
      question:'오늘 지혜가 필요한 선택 한 가지는 무엇입니까?',
      step:'오늘 결정해야 할 한 가지를 두고\n먼저 기도하세요.',
      prayer:'주님, 제 생각보다\n주님의 지혜를 먼저 따르게 하소서.'
    },
    {
      id:'hope', name:'소망의 삶',
      title:'끝이 보이지 않아도\n빛은 옵니다',
      verseRef:'로마서 15:13',
      teaser:'소망은 내일을 스스로 그리는 힘이 아닙니다.\n하나님을 바라보기에 오늘을 견디는 힘입니다.',
      reflection:'소망은 상황이 좋아져서 생기는\n마음이 아닙니다.\n\n하나님이 여전히 일하고 계심을\n믿는 눈입니다.',
      question:'오늘 하나님께 맡기며 기다릴 소망은 무엇입니까?',
      step:'오늘 감사할 이유 하나를 적으며\n내일을 바라보세요.',
      prayer:'주님, 흔들리는 마음에도\n하늘의 소망으로 저를 붙들어 주소서.'
    }
  ];
  var LIFE_THEME_I18N={
    new:{
      en:{name:'New Life',title:'It is okay\nto begin again',teaser:'Yesterday’s failure does not decide today.\nIn God, you can start again.',reflection:'Yesterday’s mistakes\ndo not decide who you are today.\n\nEven before a closed door,\nGod prepares a new way.',question:'What part of your life do you hope God will make new today?',step:'Start just one new thing today.',prayer:'Lord, keep me from staying in yesterday,\nand help me walk the new path You give today.'},
      ja:{name:'新しい人生',title:'もう一度始めても\n大丈夫です',teaser:'昨日の失敗が今日を決めるのではありません。\n神にあっては、また始めることができます。',reflection:'昨日の過ちは\n今日の私を決めません。\n\n閉じた扉の前でも\n神は新しい道を備えておられます。',question:'今日、神が新しくしてくださることを願う人生の部分はどこですか。',step:'今日、ひとつだけ新しく始めてみてください。',prayer:'主よ、昨日にとどまらず\n今日与えてくださる新しい道を歩ませてください。'},
      zh:{name:'新生命',title:'重新开始\n也没有关系',teaser:'昨日的失败不能决定今天。\n在神里面，你可以再一次开始。',reflection:'昨日的过错\n不能决定今天的你。\n\n即使门已关闭，\n神仍预备新的道路。',question:'今天，你盼望神更新生命的哪一部分？',step:'今天只开始一件新事。',prayer:'主啊，不要让我停留在昨日，\n帮助我走你今天所赐的新路。'}
    },
    prayer:{
      en:{name:'Prayerful Life',title:'Even without words,\nprayer can begin',teaser:'Do not be anxious about anything, but make your requests known with thanksgiving.\nWhen you need to ask, there is a way to first entrust it to God.',reflection:'There are days when you do not know\nwhat to say.\n\nSimply remaining before the Lord\nis also prayer.',question:'What one thing do you want to bring to God today?',step:'Tell the Lord the heaviest thing\non your heart right now.',prayer:'Lord, do not let me stand alone with worry,\nbut help me place every heart before You.'},
      ja:{name:'祈る人生',title:'ことばがなくても\n祈りは始まります',teaser:'何も思い煩わず、感謝をもって願いなさい。\n求めることがあるとき、まず神にゆだねる道があります。',reflection:'何を言えばよいか\nわからない日があります。\n\nただ主の前にとどまること、\nそれも祈りです。',question:'今日、神にお伝えしたい一つのことは何ですか。',step:'今いちばん重いことを\n主にお話ししてみてください。',prayer:'主よ、思い煩いを抱えてひとり立つのではなく\nすべての心を主にゆだねさせてください。'},
      zh:{name:'祷告的生命',title:'即使没有话语，\n祷告也能开始',teaser:'应当一无挂虑，只要凡事借着祷告祈求和感谢，将所要的告诉神。\n当你需要祈求时，先有一条交托给神的路。',reflection:'有些日子，你不知道\n该说什么。\n\n单单停留在主面前，\n也是祷告。',question:'今天，你想带到神面前的一件事是什么？',step:'把此刻最沉重的一件事\n告诉主。',prayer:'主啊，不要让我独自抱着忧虑站立，\n帮助我把每一颗心交在你面前。'}
    },
    blessed:{
      en:{name:'Blessed Life',title:'A life rooted\nin the Lord is blessed',teaser:'Blessed is the one who delights in God’s Word.\nThat life takes root like a tree planted by streams of water.',reflection:'Blessing does not begin\nwith having more.\n\nIt quietly soaks into the one\nwho stays near God’s Word.',question:'What would it look like today to delight in the Word?',step:'Pause for a moment today\nand let one verse rest in your heart.',prayer:'Lord, help me seek the blessing in You\nbefore the measures of this world.'},
      ja:{name:'祝福された人生',title:'主のうちに\n根ざした人生が祝福です',teaser:'幸いな人は神のみことばを喜びます。\nその人生は川のほとりに植えられた木のように根を張ります。',reflection:'祝福は多く持つことから\n始まりません。\n\n神のみことばのそばにとどまる人に\n静かに染み入ります。',question:'今日、みことばを喜ぶ人生はどのような姿でしょうか。',step:'今日、少し止まって\n聖句一節を心にとどめてください。',prayer:'主よ、世の基準より先に\n主のうちにある祝福を求めさせてください。'},
      zh:{name:'蒙福的生命',title:'扎根在主里的\n生命才是祝福',teaser:'喜爱神话语的人有福了。\n那样的生命像栽在溪水旁的树，扎下根来。',reflection:'祝福不是从拥有更多\n开始的。\n\n它安静地浸润\n停留在神话语旁的人。',question:'今天，喜爱话语的生命会是什么样子？',step:'今天停一停，\n让一节经文留在心里。',prayer:'主啊，帮助我在世界的尺度之前，\n先寻求在你里面的祝福。'}
    },
    faith:{
      en:{name:'Faithful Life',title:'Even unseen,\nyou can walk',teaser:'Faith is the assurance of things hoped for,\nthe evidence of things not seen.',reflection:'Faith is not the certainty of every answer,\n\nbut the courage to hold the promise\nthat the Lord is with you.',question:'What do you want to entrust to the Lord today, even if you cannot see it?',step:'Before one fearful thing today,\nchoose a small act of obedience.',prayer:'Lord, even on an unseen path,\nhelp me trust Your hand.'},
      ja:{name:'信仰の人生',title:'見えなくても\n歩くことができます',teaser:'信仰は望んでいる事柄の保証であり\n見ていない事柄の証拠です。',reflection:'信仰はすべての答えを知る確信ではなく\n\n主がともにいてくださる約束を\n握る勇気です。',question:'今日、見えなくても主にゆだねたいことは何ですか。',step:'今日、恐れている一つのことの前で\n小さな従順を選んでください。',prayer:'主よ、見えない道でも\n主の手を信頼させてください。'},
      zh:{name:'信心的生命',title:'即使看不见，\n也可以前行',teaser:'信就是所望之事的实底，\n是未见之事的确据。',reflection:'信心不是知道每一个答案的把握，\n\n而是抓住主与你同在之应许的\n勇气。',question:'今天，即使看不见，你仍想交托给主的是什么？',step:'在今天一件惧怕的事面前，\n选择一次小小的顺服。',prayer:'主啊，即使在看不见的路上，\n也帮助我信靠你的手。'}
    },
    love:{
      en:{name:'Loving Life',title:'Love begins\nwith the person nearest you',teaser:'Love is not something we first manufacture.\nIt flows from love already received.',reflection:'Love is passed on less by grand words\n\nthan by a warm look\nand a kind waiting.\n\nMay the Lord’s love rest today\nin our words and faces.',question:'To whom can you pass on the love you have received today?',step:'Speak one warm word\nto one person today.',prayer:'Lord, make this a day\nwhen received love is poured out.'},
      ja:{name:'愛する人生',title:'愛は近い人から\n始まります',teaser:'愛は私たちが先につくり出すものではありません。\nすでに受けた愛から流れ出ます。',reflection:'愛は大きなことばより\n\n温かい視線と\n優しい待ち方で伝わります。\n\n主の愛が今日\n私たちのことばと表情にとどまりますように。',question:'今日、受けた愛をだれに伝えることができるでしょうか。',step:'今日、ひとりに\n温かい一言をかけてみてください。',prayer:'主よ、受けた愛を\n流し出す一日とならせてください。'},
      zh:{name:'爱的生命',title:'爱从最靠近的人\n开始',teaser:'爱不是我们先制造出来的。\n它从已经领受的爱流出来。',reflection:'爱较少靠宏大的话传递，\n\n更多是借着温暖的眼神\n和温柔的等待。\n\n愿主的爱今天停留在\n我们的话语和面容上。',question:'今天，你可以把领受的爱传给谁？',step:'今天对一个人\n说一句温暖的话。',prayer:'主啊，使今天成为\n把领受的爱流出去的一天。'}
    },
    wisdom:{
      en:{name:'Wise Life',title:'When you need wisdom,\nask God',teaser:'The wisdom you need today is not far away.\nGod gives generously to those who ask.',reflection:'Wisdom is a heart that does not rush,\nbut discerns the Lord’s will.\n\nTo the one who asks quietly,\nGod makes the way clear.',question:'What one choice needs wisdom today?',step:'Before the one decision you must make today,\npray first.',prayer:'Lord, help me follow Your wisdom\nbefore my own thoughts.'},
      ja:{name:'知恵ある人生',title:'知恵が必要なとき\n神に求めなさい',teaser:'今日必要な知恵は遠くにありません。\n神は求める者に惜しみなく与えてくださいます。',reflection:'知恵は急がず\n主の御心を見分ける心です。\n\n静かに尋ねる人に\n神は道を明らかにしてくださいます。',question:'今日、知恵が必要な選択の一つは何ですか。',step:'今日決めなければならない一つのことを\nまず祈ってください。',prayer:'主よ、私の考えより先に\n主の知恵に従わせてください。'},
      zh:{name:'智慧的生命',title:'需要智慧的时候，\n向神求',teaser:'你今天需要的智慧并不遥远。\n神厚赐给求他的人。',reflection:'智慧是不急躁、\n能分辨主旨意的心。\n\n对安静求问的人，\n神使道路显明。',question:'今天哪一个选择需要智慧？',step:'在今天必须做的一个决定之前，\n先祷告。',prayer:'主啊，帮助我在自己的想法之前，\n先跟随你的智慧。'}
    },
    hope:{
      en:{name:'Hopeful Life',title:'Even when the end is hidden,\nlight comes',teaser:'Hope is not the power to sketch tomorrow yourself.\nIt is the strength to endure today because you look to God.',reflection:'Hope is not a feeling that appears\nwhen circumstances improve.\n\nIt is the eye that believes\nGod is still at work.',question:'What hope will you wait for with God today?',step:'Write one reason to give thanks today\nand look toward tomorrow.',prayer:'Lord, even in a shaking heart,\nhold me with the hope of heaven.'},
      ja:{name:'希望の人生',title:'終わりが見えなくても\n光は来ます',teaser:'希望は明日を自分で描く力ではありません。\n神を仰ぐゆえに今日を耐えうる力です。',reflection:'希望は状況がよくなって生まれる\n気持ちではありません。\n\n神がなお働いておられることを\n信じる目です。',question:'今日、神にゆだねて待つ希望は何ですか。',step:'今日、感謝する理由を一つ書きながら\n明日を見つめてください。',prayer:'主よ、揺れる心にも\n天の希望で私を支えてください。'},
      zh:{name:'盼望的生命',title:'即使尽头隐藏，\n光仍会来',teaser:'盼望不是自己勾画明天的力量。\n乃是因仰望神而能度过今天的力量。',reflection:'盼望不是环境变好才出现的感觉。\n\n乃是相信神仍在做工的眼睛。',question:'今天，你要与神一同等候的盼望是什么？',step:'写下今天一个感恩的理由，\n并望向明天。',prayer:'主啊，即使心在摇动，\n也用天上的盼望托住我。'}
    }
  };
  var STORY_PERSON_I18N={
    abraham:{
      en:{name:'Abraham',title:'Even unseen,\nwe walk',reflection:'God did not call Abraham after showing every road first.\nAbraham took a step, trusting the promise.',step:'Think of one act of obedience you have been putting off today.'},
      ja:{name:'アブラハム',title:'見えなくても\n歩いていきます',reflection:'神はすべての道を先にお見せになってから呼ばれたのではありません。\nアブラハムは約束を信じて一歩を踏み出しました。',step:'今日、先延ばしにしている従順を一つ思い浮かべてみてください。'},
      zh:{name:'亚伯拉罕',title:'即使看不见，\n我们仍往前走',reflection:'神并不是先把每条路都显明才呼召亚伯拉罕。\n亚伯拉罕信那应许，迈出了一步。',step:'想一想今天你一直拖延的一次顺服。'}
    },
    moses:{
      en:{name:'Moses',title:'Even in fear,\nthe calling begins',reflection:'Moses said he was not enough.\nBut God said, “I will be with you.”\nBeing with him comes before the fear.',step:'Before something you want to avoid today, confess once that God is with you.'},
      ja:{name:'モーセ',title:'恐れても\n召しは始まります',reflection:'モーセは足りないと言いました。\nしかし神は「わたしはあなたと共にいる」と言われました。\n恐れより先に、ともにおられることがあります。',step:'今日避けたいことの前で、神がともにおられることを一度告白してみてください。'},
      zh:{name:'摩西',title:'即使惧怕，\n呼召也已经开始',reflection:'摩西说自己不够。\n但神说：“我必与你同在。”\n同在先于惧怕。',step:'在今天想回避的一件事面前，先承认一次：神与你同在。'}
    },
    david:{
      en:{name:'David',title:'The God who sees\nthe heart',reflection:'God looks at the heart more than the appearance.\nDavid fell, yet returned to the Lord again.\nIt is not the strong person, but the one who seeks God.',step:'Think of one thing you want to lay honestly before God today.'},
      ja:{name:'ダビデ',title:'心の中心を\nご覧になる神',reflection:'神は外見より中心をご覧になります。\nダビデは倒れても、また主のもとに帰りました。\n強い人より、神を求める人になります。',step:'今日、神の前に正直に差し出したい心を一つ思い浮かべてみてください。'},
      zh:{name:'大卫',title:'看人内心的神',reflection:'神看内心过于外貌。\n大卫跌倒，却再次回到主那里。\n不是刚强的人，乃是寻求神的人。',step:'想一想今天你想在神面前诚实交出的一件心事。'}
    },
    joseph:{
      en:{name:'Joseph',title:'Even in waiting,\nthere is purpose',reflection:'Delay is not abandonment.\nGod was already at work in the unseen time.\nWaiting was another name for preparation.',step:'Entrust to God for a moment one thing that only feels slow today.'},
      ja:{name:'ヨセフ',title:'待ちの中にも\n御心があります',reflection:'遅れは見捨てられたことではありません。\n見えない時にも神は働いておられました。\n待ちは備えの別名でした。',step:'今日、遅いと感じることを一つ、しばらく神におゆだねしてみてください。'},
      zh:{name:'约瑟',title:'等候之中\n也有旨意',reflection:'延迟不是被抛弃。\n在看不见的时间里，神已经在做工。\n等候是预备的另一个名字。',step:'把今天只觉得“太慢”的一件事，先交托给神片刻。'}
    },
    lot:{
      en:{name:'Lot',title:'The good-looking road\nis not always the right one',reflection:'Lot chose the land that looked good.\nChoices set the direction of a life.\nThere is a right road beyond nearby gain.',step:'Ask whether the road you want to choose today is only the easy one.'},
      ja:{name:'ロト',title:'見ばえのよい道が\nいつも正しい道ではありません',reflection:'ロトは目に良く見える地を選びました。\n選択は人生の方向をつくります。\n近い利益より、正しい道があります。',step:'今日選ぼうとしている道が、ただ楽な道ではないか見てみてください。'},
      zh:{name:'罗得',title:'好看的路\n不一定是对的路',reflection:'罗得选择了眼看美好之地。\n选择决定生命的方向。\n在近处的利益之外，还有对的道路。',step:'问问自己：今天想选的路，是不是只是容易的路。'}
    },
    esther:{
      en:{name:'Esther',title:'A calling\nfor such a time',reflection:'The place you stand may not be chance.\nEsther chose mission over fear.\nThere is courage for such a time as this.',step:'Think of one good step you can take from where you stand today.'},
      ja:{name:'エステル',title:'このような時のための\n召し',reflection:'あなたが立っている場所は偶然ではないかもしれません。\nエステルは恐れより使命を選びました。\nこのような時のための勇気があります。',step:'今日立っている場所でできる善い一歩を思い浮かべてみてください。'},
      zh:{name:'以斯帖',title:'为这样的时候\n而来的呼召',reflection:'你所站的地方或许不是偶然。\n以斯帖选择使命过于惧怕。\n为这样的时候，有勇气。',step:'想一想今天从你所站之处能迈出的一步善行。'}
    },
    paul:{
      en:{name:'Paul',title:'Grace\nchanges a person',reflection:'God’s grace was greater than Paul’s past.\nA changed life itself becomes the gospel.',step:'Keep in your heart one thing you want grace to make new today.'},
      ja:{name:'パウロ',title:'恵みは人を\n変えます',reflection:'パウロの過去より、神の恵みがより大きかったのです。\n変えられた人生は、それ自体が福音になります。',step:'今日、恵みによって新しくしたい一つを心に置いてください。'},
      zh:{name:'保罗',title:'恩典\n改变一个人',reflection:'神的恩典大过保罗的过去。\n被改变的生命本身就成为福音。',step:'把今天你盼望恩典更新的一件事放在心里。'}
    }
  };

  function reduced(){
    try{return window.matchMedia('(prefers-reduced-motion:reduce)').matches;}catch(e){return false;}
  }
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function feedView(){
    if(typeof _verseView==='function')return _verseView(new Date());
    var v=(typeof getVerseForDate==='function')?getVerseForDate(new Date()):{t:'',r:''};
    return {refText:v.r||'',bibleVersion:'KRV',body:v.t||'',tagText:uiT('home.card.todayWord','오늘의 말씀')};
  }
  function displayRef(view){
    var ref=String((view&&view.refText)||'').trim();
    var ver=String((view&&view.bibleVersion)||'KRV').trim()||'KRV';
    return ref?ref+' · '+ver:'';
  }
  function foldPoeticLines(parts, max){
    var lines=parts.slice();
    var i, best, mergeAt;
    while(lines.length>max){
      mergeAt=0;
      best=Infinity;
      for(i=0;i<lines.length-1;i++){
        if(lines[i].length<best){
          best=lines[i].length;
          mergeAt=i;
        }
      }
      if(mergeAt===0){
        lines[0]=lines[0]+' '+lines.splice(1,1)[0];
      }else{
        lines[mergeAt-1]=lines[mergeAt-1]+' '+lines.splice(mergeAt,1)[0];
      }
    }
    return lines;
  }
  function verseLines(text){
    var t=String(text||'').replace(/^["“]+|["”]+$/g,'').trim();
    var hasHangul=/[\uAC00-\uD7A3]/.test(t);
    var parts;
    if(hasHangul){
      parts=t.split(/(?<=(?:니라|리라|버리라|리로다|로다|도다|오라|말고|일에|간구로|것을|함으로))\s+/).map(function(s){return s.trim();}).filter(Boolean);
      if(parts.length>=4)return foldPoeticLines(parts, 5);
      if(parts.length>=2)return parts;
    }else if(/[\u3040-\u30ff\u4e00-\u9faf]/.test(t)){
      parts=t.split(/。/).map(function(s){return s.trim();}).filter(Boolean);
      if(parts.length>=2){
        return foldPoeticLines(parts.map(function(s){return /[。．.!?！？]$/.test(s)?s:s+'。';}), 5);
      }
    }
    var words=t.split(/\s+/).filter(Boolean);
    if(words.length>=6){
      var n=Math.ceil(words.length/3);
      var lines=[], i=0;
      for(;i<words.length;i+=n)lines.push(words.slice(i,i+n).join(' '));
      return lines;
    }
    if(t.length<=24)return [t];
    return [t.slice(0,14), t.slice(14,28), t.slice(28)].filter(Boolean);
  }
  function setText(el, text){if(el)el.textContent=text||'';}
  function escapeHtml(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;');}
  function fillPoem(el, text){
    if(!el)return;
    var raw=String(text||'').trim();
    if(!raw){el.innerHTML='';return;}
    el.innerHTML=raw.split(/\n\s*\n/).map(function(block){
      var lines=block.split('\n').map(function(s){return s.trim();}).filter(Boolean);
      return '<p class="gomna-home-leaf-stanza">'+lines.map(function(s){
        return '<span>'+escapeHtml(s)+'</span>';
      }).join('')+'</p>';
    }).join('');
  }
  function fillSlot(card, sel, text){
    var el=card&&card.querySelector(sel);
    setText(el, text);
  }
  function fillSlots(card, sel, text){
    if(!card)return;
    card.querySelectorAll(sel).forEach(function(el){setText(el, text);});
  }
  function pad2(n){return (n<10?'0':'')+n;}
  function dateKey(d){
    d=d||new Date();
    return d.getFullYear()+pad2(d.getMonth()+1)+pad2(d.getDate());
  }
  function slugRef(ref){return String(ref||'').trim().replace(/\s+/g,'-').replace(/:/g,'-');}
  function uiLang(){
    try{
      if(window.GomnaUII18n&&typeof window.GomnaUII18n.getSelectedLocale==='function'){
        var selected=window.GomnaUII18n.getSelectedLocale();
        if(selected==='ko'||selected==='en'||selected==='ja'||selected==='zh')return selected;
      }
      if(window.GomnaUII18n&&typeof window.GomnaUII18n.getLanguage==='function'){
        var code=window.GomnaUII18n.getLanguage();
        if(code==='ko'||code==='en'||code==='ja'||code==='zh')return code;
      }
    }catch(e){}
    return 'ko';
  }
  function uiT(key, fallback){
    try{
      if(window.GomnaUII18n&&typeof window.GomnaUII18n.t==='function'){
        var v=window.GomnaUII18n.t(key);
        if(v)return v;
      }
    }catch(e){}
    return fallback==null?'':fallback;
  }
  function uiFmt(key, vars, fallback){
    try{
      if(window.GomnaUII18n&&typeof window.GomnaUII18n.format==='function'){
        var v=window.GomnaUII18n.format(key, vars);
        if(v)return v;
      }
    }catch(e){}
    var s=uiT(key, fallback||'');
    if(!vars)return s;
    Object.keys(vars).forEach(function(k){
      s=String(s).split('{'+k+'}').join(vars[k]==null?'':String(vars[k]));
    });
    return s;
  }
  function localizedItem(item, pack){
    if(!item)return item;
    var lang=uiLang();
    var extra=pack&&pack[lang];
    if(lang==='ko'||!extra)return item;
    var out={}, k;
    for(k in item){
      if(Object.prototype.hasOwnProperty.call(item,k))out[k]=item[k];
    }
    for(k in extra){
      if(Object.prototype.hasOwnProperty.call(extra,k))out[k]=extra[k];
    }
    return out;
  }
  function localizeRef(ref){
    var lang=uiLang();
    var src=String(ref||'').trim();
    if(!src||lang==='ko')return src;
    if(typeof window.GomnaTranslateBookRef==='function'){
      try{return window.GomnaTranslateBookRef(src, lang)||src;}catch(e){}
    }
    return src;
  }
  function fillHtmlLines(el, text){
    if(!el)return;
    var raw=String(text||'');
    if(!raw){el.innerHTML='';return;}
    el.innerHTML=raw.split('\n').map(function(s){
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
    }).join('<br>');
  }
  function parseRef(ref){
    var m=String(ref||'').trim().match(/^(.+?)\s+(\d+):(\d+)(?:-(\d+))?$/);
    if(!m)return null;
    var start=parseInt(m[3],10);
    return {book:m[1].trim(),chapter:parseInt(m[2],10),verse:start,startVerse:start,endVerse:m[4]?parseInt(m[4],10):start};
  }
  function lifeThemeById(id){
    var i;
    for(i=0;i<LIFE_THEMES.length;i++){
      if(LIFE_THEMES[i].id===id)return LIFE_THEMES[i];
    }
    return LIFE_THEMES[0];
  }
  function currentLifeTheme(){
    return localizedItem(lifeThemeById(lifeThemeId), LIFE_THEME_I18N[lifeThemeId]);
  }
  function storyPersonById(id){
    var i;
    if(id==='ruth')id='lot';
    for(i=0;i<STORY_PEOPLE.length;i++){
      if(STORY_PEOPLE[i].id===id)return STORY_PEOPLE[i];
    }
    return STORY_PEOPLE[2];
  }
  function currentStoryPerson(){
    return localizedItem(storyPersonById(storyPersonId), STORY_PERSON_I18N[storyPersonId]);
  }
  function knownLifeThemeId(id){
    var i;
    for(i=0;i<LIFE_THEMES.length;i++){
      if(LIFE_THEMES[i].id===id)return LIFE_THEMES[i].id;
    }
    return '';
  }
  function knownStoryPersonId(id){
    var i;
    if(id==='ruth')id='lot';
    for(i=0;i<STORY_PEOPLE.length;i++){
      if(STORY_PEOPLE[i].id===id)return STORY_PEOPLE[i].id;
    }
    return '';
  }
  function readHomeRestoreEntry(){
    var p, src, theme, person;
    try{p=new URLSearchParams(location.search);}catch(e){return null;}
    src=(p.get('source')||'').trim();
    theme=knownLifeThemeId((p.get('theme')||'').trim());
    person=knownStoryPersonId((p.get('person')||'').trim());
    if(src==='home-today')return {kind:'today'};
    if(src==='home-life' && theme)return {kind:'life', id:theme};
    if(src==='home-bible-person' && person)return {kind:'person', id:person};
    return null;
  }
  function restoreHomeEntry(entry){
    if(!entry||!root)return false;
    var card;
    var tries=0;
    function tryOpen(){
      if(!card||card.classList.contains('is-open'))return;
      if(!card.classList.contains('is-active') && tries++<25){
        window.setTimeout(tryOpen, 40);
        return;
      }
      openCard(card, true);
    }
    if(entry.kind==='life'){
      lifeThemeId=entry.id;
      fillCopy();
      startSettleTo2();
      card=root.querySelector('.gomna-home-card[data-card="1"]');
      window.requestAnimationFrame(tryOpen);
      return true;
    }
    if(entry.kind==='person'){
      storyPersonId=entry.id;
      fillCopy();
      startSettleTo3();
      card=root.querySelector('.gomna-home-card[data-card="2"]');
      window.requestAnimationFrame(tryOpen);
      return true;
    }
    if(entry.kind==='today'){
      apply(0, true);
      card=root.querySelector('.gomna-home-card[data-card="0"]');
      window.requestAnimationFrame(tryOpen);
      return true;
    }
    return false;
  }
  function extrasFor(key){
    var map={
      '베드로전서 5:7':{
        headline:'맡길 곳이 있습니다',
        message:'기도는 상황보다 먼저 마음의 방향을 바꿉니다.',
        meaning:'아직 오지 않은 일까지 오늘의 마음으로 감당하면 오늘 필요한 평안까지 잃게 됩니다.',
        body:'혼자 끌어안고 있던 걱정도\n하나님 앞에서는 내려놓을 수 있습니다.\n\n아직 오지 않은 일까지\n오늘의 마음으로 붙들면\n오늘 필요한 평안까지 잃게 됩니다.\n\n지금 그 한 가지를\n주님께 맡기십시오.',
        related:'시편 55:22',
        remember:'오늘 주어진 하루의 은혜만 받으십시오.',
        meditation:'오늘 무엇을 하나님께 맡기시겠습니까?',
        prayer:'하나님, 혼자 붙들던 염려를 주님께 맡기게 해 주세요.',
        practice:'오늘 통제하려 했던 한 가지를 내려놓으세요.'
      },
      '빌립보서 4:6':{
        headline:'염려 대신 아뢰는 길',
        message:'기도는 상황보다 먼저 마음의 방향을 바꿉니다.',
        meaning:'염려를 붙드는 대신 감사함으로 하나님께 아뢰는 것이 오늘의 길입니다.',
        body:'아무것도 염려하지 말라는 말씀은\n감정을 지우라는 뜻이 아닙니다.\n\n구할 것이 있을 때\n먼저 하나님께 아뢰라는 초대입니다.\n\n오늘 붙들고 있는 염려가 있다면\n감사함으로 그 이름을 부르십시오.\n도움은 기도 다음에 옵니다.',
        related:'베드로전서 5:7',
        remember:'구할 것을 감사함으로 아뢰십시오.',
        meditation:'오늘 무엇을 하나님께 맡기시겠습니까?',
        prayer:'하나님, 염려 대신 기도로 마음을 돌려 주세요.',
        practice:'한 가지 염려를 기도로 바꾸어 보세요.'
      },
      '시편 46:1':{
        headline:'피난처가 있다는 것',
        message:'환난 중에도 하나님은 가장 가까운 피난처입니다.',
        meaning:'힘이 되어 주시는 하나님을 기억하는 것이 오늘의 평안입니다.',
        body:'하나님은\n어려움이 모두 지나간 뒤에\n우리 곁에 오시는 분이 아닙니다.\n\n마음이 흔들리고\n앞이 보이지 않는 바로 그 순간에도\n숨을 곳이 되어 주십니다.\n\n오늘 혼자 견디고 있는 일이 있다면\n조금 내려놓아도 괜찮습니다.\n\n도움은 멀리 있지 않습니다.\n하나님께서 지금도 가까이 계십니다.',
        related:'이사야 41:10',
        remember:'하나님은 환난 중에 만날 큰 도움이십니다.',
        meditation:'오늘 무엇을 하나님께 맡기시겠습니까?',
        prayer:'하나님, 오늘 필요한 도움을 구합니다.',
        practice:'피난처이신 하나님을 한 번 소리 내어 고백하세요.'
      }
    };
    return map[key]||{
      headline:'오늘 이 말씀이 건네는 것',
      message:'기도는 상황보다 먼저 마음의 방향을 바꿉니다.',
      meaning:'하나님은 오늘 필요한 은혜를 오늘 주십니다.',
      body:'하나님은 오늘 필요한 은혜를\n오늘 주십니다.\n\n이 한 구절을 마음에 두고\n하루를 걸어가십시오.',
      remember:'오늘 한 구절만 마음에 남기십시오.',
      meditation:'오늘 무엇을 하나님께 맡기시겠습니까?',
      prayer:'하나님, 이 말씀대로 오늘을 살게 해 주세요.',
      practice:'가장 작은 순종 하나를 걸어가세요.'
    };
  }
  var EXTRAS_I18N={
    _default:{
      en:{headline:'What this verse offers today',message:'Prayer turns the heart before it changes the situation.',meaning:'God gives the grace needed for today, today.',body:'God gives the grace you need today\ntoday.\n\nKeep this one verse in your heart\nand walk through the day.',remember:'Leave just this one verse in your heart today.',meditation:'What will you entrust to God today?',prayer:'God, help me live today by this Word.',practice:'Take the smallest step of obedience.'},
      ja:{headline:'今日このみことばが手渡すもの',message:'祈りは状況より先に心の向きを変えます。',meaning:'神は今日必要な恵みを今日与えてくださいます。',body:'神は今日必要な恵みを\n今日与えてくださいます。\n\nこの一節を心にとどめて\n一日を歩いてください。',remember:'今日、一節だけを心に残してください。',meditation:'今日、何を神にゆだねますか。',prayer:'神よ、このみことばのとおりに今日を生きさせてください。',practice:'いちばん小さな従順を一歩歩いてください。'}
    },
    '베드로전서 5:7':{
      en:{headline:'There is a place to leave it',body:'The worry you held alone\ncan be laid down before God.\n\nIf you cling even to what has not yet come\nwith today’s heart,\nyou lose even the peace needed today.\n\nLeave that one thing\nwith the Lord now.',related:'시편 55:22',prayer:'God, help me leave the worry I held alone with You.',practice:'Lay down one thing you tried to control today.'},
      ja:{headline:'ゆだねる場所があります',related:'시편 55:22'}
    },
    '빌립보서 4:6':{
      en:{headline:'A way to ask instead of worry',body:'Do not be anxious about anything\nis not a command to erase feeling.\n\nIt is an invitation to tell God first\nwhen you have something to ask.\n\nIf you are holding worry today,\ncall His name with thanksgiving.\nHelp comes after prayer.',related:'베드로전서 5:7'},
      ja:{headline:'思い煩いの代わりに申し上げる道',related:'베드로전서 5:7'}
    },
    '시편 46:1':{
      en:{headline:'There is a refuge',body:'God does not come beside us\nonly after trouble has passed.\n\nIn the very moment the heart shakes\nand the way is hidden,\nHe is a place to hide.\n\nIf you are enduring something alone today,\nit is all right to set it down a little.\n\nHelp is not far.\nGod is near even now.',related:'이사야 41:10'},
      ja:{headline:'避け所があるということ',related:'이사야 41:10'}
    }
  };
  function extrasForLocalized(canonicalKoRef){
    var base=extrasFor(canonicalKoRef);
    var lang=uiLang();
    if(lang==='ko')return base;
    var def=EXTRAS_I18N._default&&EXTRAS_I18N._default[lang];
    var spec=EXTRAS_I18N[canonicalKoRef]&&EXTRAS_I18N[canonicalKoRef][lang];
    var out={}, k;
    for(k in base){
      if(Object.prototype.hasOwnProperty.call(base,k))out[k]=base[k];
    }
    if(def){
      for(k in def){
        if(Object.prototype.hasOwnProperty.call(def,k))out[k]=def[k];
      }
    }
    if(spec){
      for(k in spec){
        if(Object.prototype.hasOwnProperty.call(spec,k))out[k]=spec[k];
      }
    }
    if(base.related)out.related=localizeRef(base.related);
    else if(out.related)out.related=localizeRef(out.related);
    return out;
  }
  function cardDetail(id, view){
    view=view||feedView();
    var body=String((view&&view.body)||'').trim();
    var key=String((view&&view.refText)||'').trim();
    var day=dateKey(view&&view.selDate);
    var ver=(view&&view.bibleVersion)||'KRV';
    var canonicalRef=(view&&view.v&&view.v.r)||key;
    var extra=extrasForLocalized(canonicalRef);
    if(id==='0'){
      return {
        cardId:'0', contentId:'daily-verse-'+day+'-'+slugRef(canonicalRef),
        title:uiT('home.card.todayMessage','오늘의 메시지'), reference:key, translation:ver,
        frontText:body, verse:body,
        headline:extra.headline||extra.message,
        message:extra.body||extra.meaning||extra.message,
        related:extra.related||'',
        audioTarget:canonicalRef, scriptureTarget:canonicalRef, commentaryTarget:canonicalRef
      };
    }
    if(id==='1'){
      var theme=currentLifeTheme();
      return {
        cardId:'1', contentId:'daily-life-'+theme.id+'-'+day,
        title:uiT('home.life.meditation','오늘의 묵상'), theme:theme.name, reference:localizeRef(theme.verseRef), translation:ver,
        headline:theme.title, frontText:theme.teaser, verse:body,
        message:theme.reflection, meditation:theme.step||theme.question, prayer:theme.prayer,
        scriptureTarget:theme.verseRef, commentaryTarget:theme.verseRef
      };
    }
    var person=currentStoryPerson();
    return {
      cardId:'2', contentId:'daily-story-'+person.id+'-'+day,
      title:uiT('home.story.posterTitle','성경 속 이야기와 인물'), theme:person.name,
      headline:person.title, frontText:'',
      reference:localizeRef(person.verseRef), translation:ver,
      message:person.reflection, meditation:person.step,
      scriptureTarget:person.verseRef
    };
  }
  function cardFromEl(el){return el&&el.closest?el.closest('.gomna-home-card'):null;}
  function isAction(el){
    return el&&el.closest&&el.closest('.gomna-home-act, .gomna-home-related, .gomna-home-ctrl, .gomna-home-ctrl-item, .gomna-home-link, .gomna-home-note-save, .gomna-home-life-rail, .gomna-home-life-chip, .gomna-home-poster-pills, .gomna-home-poster-pill, .gomna-home-leaf-cta, .gomna-home-leaf-btn, button, a, [role="button"], input, select, textarea');
  }
  function hideLegacyHome(){
    var nodes=document.querySelectorAll('#homeResumeCard, #today-word-card, .container > .quick-menu, .container > .home-menu-card, .container > .imprint-bottom');
    Array.prototype.forEach.call(nodes, function(el){
      el.setAttribute('hidden','');
      el.setAttribute('aria-hidden','true');
      el.setAttribute('inert','');
      try{el.inert=true;}catch(e){}
      var focusables=el.querySelectorAll('a,button,input,textarea,select,[tabindex]');
      Array.prototype.forEach.call(focusables, function(n){
        n.setAttribute('tabindex','-1');
      });
    });
  }
  function fillCopy(){
    if(!root)return;
    var view=feedView();
    cards.forEach(function(card){
      var id=card.getAttribute('data-card');
      var detail=cardDetail(id, view);
      card.setAttribute('data-content-id', detail.contentId||'');
      fillSlot(card, '.gomna-home-card-inner > [data-ghd-ref]', displayRef(view));
      fillSlot(card, '[data-ghd-open-title]', detail.title);
      fillSlot(card, '[data-ghd-open-ref]', detail.reference||'');
      fillSlots(card, '[data-ghd-life-name]', detail.theme||'');
      fillSlots(card, '[data-ghd-life-ref]', detail.reference||'');
      fillSlots(card, '[data-ghd-story-name]', detail.theme||'');
      fillSlots(card, '[data-ghd-story-ref]', detail.reference||'');
      var heading=card.querySelector('[data-ghd-open-heading]');
      var headingHtml=String(detail.headline||'').split('\n').map(function(s){
        return s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
      }).join('<br>');
      if(heading){
        heading.innerHTML=headingHtml;
        heading.hidden=!detail.headline;
      }
      card.querySelectorAll('[data-ghd-open-ref], [data-ghd-life-ref], [data-ghd-story-ref]').forEach(function(refEl){
        refEl.hidden=!detail.reference;
      });
      var storyCtrl=card.querySelector('.gomna-home-ctrl-story');
      if(storyCtrl)storyCtrl.hidden=!detail.scriptureTarget;
      fillSlot(card, '[data-ghd-open-verse]', detail.verse);
      var poem=card.querySelector('[data-ghd-poem]');
      if(poem)fillPoem(poem, detail.message||detail.meaning||'');
      else fillSlot(card, '[data-ghd-open-message]', detail.message||detail.meaning||'');
      var related=card.querySelector('[data-ghd-open-related]');
      if(related){
        if(detail.related){
          related.hidden=false;
          related.textContent=uiFmt('home.card.related',{ref:detail.related},'함께 읽을 말씀 · '+detail.related);
        }else{
          related.hidden=true;
          related.textContent='';
        }
      }
      fillSlot(card, '[data-ghd-open-remember]', detail.remember||'');
      var stepEl=card.querySelector('[data-ghd-open-meditation]');
      if(stepEl&&stepEl.classList.contains('gomna-home-leaf-copy'))fillPoem(stepEl, detail.meditation||'');
      else fillSlot(card, '[data-ghd-open-meditation]', detail.meditation||'');
      var prayEl=card.querySelector('[data-ghd-open-prayer]');
      if(prayEl&&prayEl.classList.contains('gomna-home-leaf-copy'))fillPoem(prayEl, detail.prayer||'');
      else fillSlot(card, '[data-ghd-open-prayer]', detail.prayer||'');
      fillSlot(card, '[data-ghd-open-practice]', detail.practice||'');
      var lines=card.querySelector('[data-ghd-lines]');
      if(lines){
        lines.innerHTML=verseLines(detail.frontText||detail.verse).map(function(s){
          return '<li>'+s.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</li>';
        }).join('');
      }
      var lead=card.querySelector('[data-ghd-lead]');
      if(lead&&detail.frontText){
        lead.innerHTML=String(detail.frontText).split('\n').map(function(s){
          return s.replace(/&/g,'&amp;').replace(/</g,'&lt;');
        }).join('<br>');
      }
      var note=card.querySelector('[data-ghd-note]');
      if(note){
        try{note.value=localStorage.getItem(NOTE_KEY+dateKey())||'';}catch(e){note.value='';}
      }
    });
    var listenTitle=document.getElementById('gomnaHomeListenTitle');
    if(listenTitle)listenTitle.textContent=displayRef(view)||uiT('home.listen.today','오늘의 말씀 듣기');
    applyHomeChrome();
    syncSocial();
    refreshSocial();
    syncGreeting();
    syncLifeChips();
    syncStoryChips();
    schedulePlaceTodayVerse();
  }
  function isCompactHome(){
    try{return window.matchMedia('(max-width:699px)').matches;}catch(e){return window.innerWidth<700;}
  }
  function placeTodayVerseBlock(){
    if(!root)return;
    var card=root.querySelector('.gomna-home-card[data-card="0"]');
    var face=card&&card.querySelector('.gomna-home-card-face[data-face="tease"]');
    var lines=card&&card.querySelector('[data-ghd-lines]');
    if(!card||!face||!lines)return;
    if(card.classList.contains('is-open'))return;
    if(face.clientHeight<40||!lines.offsetHeight)return;
    var padT=parseFloat(window.getComputedStyle(face).paddingTop)||0;
    var padB=parseFloat(window.getComputedStyle(face).paddingBottom)||0;
    var innerH=face.clientHeight-padT-padB;
    var verseH=lines.offsetHeight;
    var slack=innerH-verseH;
    if(!(innerH>0)||slack<=0){
      lines.style.marginTop='0px';
      return;
    }
    var t, shift, fill;
    if(isCompactHome()){
      t=clamp((260-verseH)/(260-180), 0, 1);
      shift=Math.round(slack*(0.05+0.30*t));
    }else{
      fill=verseH/innerH;
      t=clamp((0.48-fill)/(0.48-0.28), 0, 1);
      shift=Math.round(slack*(0.03+0.21*t));
    }
    shift=clamp(shift, 0, Math.max(0, slack-8));
    lines.style.marginTop=shift+'px';
  }
  function schedulePlaceTodayVerse(){
    placeTodayVerseBlock();
    window.requestAnimationFrame(function(){
      placeTodayVerseBlock();
      window.requestAnimationFrame(placeTodayVerseBlock);
    });
    if(isCompactHome()){
      window.setTimeout(placeTodayVerseBlock, 160);
      window.setTimeout(placeTodayVerseBlock, 480);
    }
  }
  function applyHomeChrome(){
    if(!root)return;
    var kickers=root.querySelectorAll('.gomna-home-card[data-card="0"] > .gomna-home-card-inner > .gomna-home-kicker, .gomna-home-card[data-card="0"] .gomna-home-card-inner > .gomna-home-kicker');
    kickers.forEach(function(el){
      if(el.closest('[data-face="open"]'))return;
      setText(el, uiT('home.card.todayWord','오늘의 말씀'));
    });
    var todayKicker=root.querySelector('.gomna-home-card[data-card="0"] .gomna-home-card-inner > .gomna-home-kicker');
    if(todayKicker)setText(todayKicker, uiT('home.card.todayWord','오늘의 말씀'));
    setText(root.querySelector('[data-card="0"] [data-ghd-read] span'), uiT('home.card.readScripture','본문 보기'));
    setText(root.querySelector('[data-card="0"] [data-ghd-commentary] span'), uiT('home.card.commentary','말씀 풀이'));
    setText(root.querySelector('[data-card="0"] [data-ghd-listen] span'), uiT('home.card.listen','듣기'));
    var back=root.querySelector('[data-card="0"] [data-ghd-back]');
    if(back)back.setAttribute('aria-label', uiT('home.card.backAria','뒤로가기'));
    var lifePoster=root.querySelector('[data-card="1"] .gomna-home-poster');
    if(lifePoster){
      setText(lifePoster.querySelector('.gomna-home-poster-kicker'), uiT('home.life.posterKicker','말씀과 함께하는 오늘의 삶'));
      setText(lifePoster.querySelector('.gomna-home-poster-title'), uiT('home.life.posterTitle','오늘의 묵상과 삶'));
      fillHtmlLines(lifePoster.querySelector('.gomna-home-poster-lead'), uiT('home.life.posterLead','하나님의 말씀은\n오늘도 우리의 삶을 새롭게 합니다.'));
      fillHtmlLines(lifePoster.querySelector('.gomna-home-poster-foot-copy'), uiT('home.life.posterFoot','오늘도, 말씀 안에서\n더 깊은 하루를 살아갑니다.'));
      var lifeGroup=lifePoster.querySelector('.gomna-home-poster-pills');
      if(lifeGroup)lifeGroup.setAttribute('aria-label', uiT('home.life.themesAria','삶 주제'));
    }
    var lifeLeaf=root.querySelector('[data-card="1"] .gomna-home-leaf');
    if(lifeLeaf){
      setText(lifeLeaf.querySelector('.gomna-home-leaf-kicker'), uiT('home.life.meditation','오늘의 묵상'));
      fillLeafLabel(lifeLeaf.querySelector('.gomna-home-leaf-block:not([data-ghd-pray-target]) .gomna-home-leaf-label'), uiT('home.life.step','오늘의 한 걸음'));
      fillLeafLabel(lifeLeaf.querySelector('.gomna-home-leaf-label-pray'), uiT('home.life.prayer','오늘의 기도'));
      var lifeRead=lifeLeaf.querySelector('[data-ghd-read]');
      fillButtonText(lifeRead, uiT('home.life.readScripture','말씀 보기'));
    }
    var storyPoster=root.querySelector('[data-card="2"] .gomna-home-poster');
    if(storyPoster){
      setText(storyPoster.querySelector('.gomna-home-poster-kicker'), uiT('home.story.posterKicker','사람들의 이야기 속 하나님의 역사'));
      setText(storyPoster.querySelector('.gomna-home-poster-title'), uiT('home.story.posterTitle','성경 속 이야기와 인물'));
      fillHtmlLines(storyPoster.querySelector('.gomna-home-poster-lead'), uiT('home.story.posterLead','평범한 사람들의 삶을 통해\n일하시는 하나님의 놀라운 이야기'));
      fillHtmlLines(storyPoster.querySelector('.gomna-home-poster-foot-copy'), uiT('home.story.posterFoot','그들의 이야기는\n지금도 우리에게 말씀합니다.'));
      var storyGroup=storyPoster.querySelector('.gomna-home-poster-pills');
      if(storyGroup)storyGroup.setAttribute('aria-label', uiT('home.story.peopleAria','성경 속 인물'));
    }
    var storyLeaf=root.querySelector('[data-card="2"] .gomna-home-leaf');
    if(storyLeaf){
      setText(storyLeaf.querySelector('.gomna-home-leaf-kicker'), uiT('home.story.kicker','성경 속 이야기'));
      fillLeafLabel(storyLeaf.querySelector('.gomna-home-leaf-label'), uiT('home.story.practice','오늘의 적용'));
      fillButtonText(storyLeaf.querySelector('[data-ghd-read]'), uiT('home.life.readScripture','말씀 보기'));
    }
    applyHomeTabbar();
    var deck=document.getElementById('gomnaHomeFeed');
    if(deck)deck.setAttribute('aria-label', uiT('home.deck.aria','말씀 카드'));
    var viewerTitle=document.querySelector('.gomna-home-viewer-title');
    if(viewerTitle)setText(viewerTitle, uiT('home.life.meditation','오늘의 묵상'));
    var viewerClose=document.getElementById('gomnaHomeViewerClose');
    if(viewerClose)viewerClose.setAttribute('aria-label', uiT('common.close','닫기'));
    var card0=root.querySelector('[data-card="0"]');
    if(card0)card0.setAttribute('aria-label', uiT('home.card.todayWord','오늘의 말씀'));
    var card1=root.querySelector('[data-card="1"]');
    if(card1)card1.setAttribute('aria-label', uiT('home.life.posterTitle','오늘의 묵상과 삶'));
    var card2=root.querySelector('[data-card="2"]');
    if(card2)card2.setAttribute('aria-label', uiT('home.story.posterTitle','성경 속 이야기와 인물'));
  }
  function fillLeafLabel(el, text){
    if(!el)return;
    var owned=el.querySelector('[data-ghd-leaf-label]');
    if(owned){setText(owned, text);return;}
    var node=el.firstChild;
    while(node){
      var next=node.nextSibling;
      if(node.nodeType===3 && String(node.nodeValue||'').trim()){
        node.nodeValue=' '+text+' ';
        return;
      }
      node=next;
    }
  }
  function fillButtonText(btn, text){
    if(!btn)return;
    var span=btn.querySelector('span');
    if(span)setText(span, text);
    else {
      var node=btn.lastChild;
      if(node&&node.nodeType===3)node.nodeValue=text;
    }
  }
  function applyHomeTabbar(){
    var bar=document.getElementById('gomnaHomeTabbar');
    if(!bar)return;
    bar.setAttribute('aria-label', uiLang()==='en'?'Main menu':(uiLang()==='ja'?'メインメニュー':'주 메뉴'));
    var map={home:'home.tab.home',bible:'home.tab.bible',media:'home.tab.media',find:'home.tab.find',me:'home.tab.login'};
    bar.querySelectorAll('[data-ghd-nav]').forEach(function(el){
      var key=map[el.getAttribute('data-ghd-nav')];
      if(!key)return;
      var label=uiT(key);
      var textEl=el.querySelector('[data-ghd-me-label]')||el.querySelector('span:not(.gomna-home-tab-icon)');
      if(el.getAttribute('data-ghd-nav')==='me'){
        var current=textEl&&textEl.getAttribute('data-ghd-me-signed')==='1';
        if(current)label=uiT('home.tab.me','나');
      }
      if(textEl&&label)setText(textEl, label);
      if(label)el.setAttribute('aria-label', label);
    });
  }
  function syncLifeChips(){
    if(!root)return;
    root.querySelectorAll('[data-ghd-life-chip]').forEach(function(btn){
      var id=btn.getAttribute('data-ghd-life-chip');
      var on=id===lifeThemeId;
      var theme=localizedItem(lifeThemeById(id), LIFE_THEME_I18N[id]);
      if(theme&&theme.name)btn.textContent=theme.name;
      btn.setAttribute('aria-pressed', on?'true':'false');
      btn.classList.toggle('is-on', on);
    });
    var lifeCard=root.querySelector('.gomna-home-card[data-card="1"]');
    if(lifeCard)lifeCard.setAttribute('data-life-theme', lifeThemeId);
  }
  function syncStoryChips(){
    if(!root)return;
    root.querySelectorAll('[data-ghd-story-chip]').forEach(function(btn){
      var id=btn.getAttribute('data-ghd-story-chip');
      var on=id===storyPersonId;
      var person=localizedItem(storyPersonById(id), STORY_PERSON_I18N[id]);
      if(person&&person.name)btn.textContent=person.name;
      btn.setAttribute('aria-pressed', on?'true':'false');
      btn.classList.toggle('is-on', on);
    });
    var storyCard=root.querySelector('.gomna-home-card[data-card="2"]');
    if(storyCard)storyCard.setAttribute('data-story-person', storyPersonId);
  }
  function selectLifeTheme(id, ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var theme=lifeThemeById(id);
    if(!theme)return;
    preloadLifeThemeImages();
    lifeThemeId=theme.id;
    fillCopy();
    var lifeCard=root&&root.querySelector('.gomna-home-card[data-card="1"]');
    if(lifeCard && !lifeCard.classList.contains('is-open'))openCard(lifeCard);
  }
  function selectStoryPerson(id, ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var person=storyPersonById(id);
    if(!person)return;
    preloadStoryPersonImages();
    storyPersonId=person.id;
    fillCopy();
    var storyCard=root&&root.querySelector('.gomna-home-card[data-card="2"]');
    if(storyCard && !storyCard.classList.contains('is-open'))openCard(storyCard);
  }
  function focusPrayer(card){
    if(!card)return;
    if(!card.classList.contains('is-open'))openCard(card);
    window.setTimeout(function(){
      var el=card.querySelector('[data-ghd-pray-target]');
      if(!el)return;
      try{el.scrollIntoView({block:'nearest', behavior:reduce?'auto':'smooth'});}catch(e){}
      if(!el.hasAttribute('tabindex'))el.setAttribute('tabindex','-1');
      try{el.focus({preventScroll:true});}catch(e){try{el.focus();}catch(err){}}
    }, reduce?0:80);
  }
  function safeDisplayName(raw){
    var name=String(raw||'').trim();
    if(!name)return '';
    if(name==='undefined'||name==='null')return '';
    if(name.indexOf('@')!==-1)return '';
    if(name==='계정 연결 전'||name==='내 정보'||name==='로그인')return '';
    return name;
  }
  function syncGreeting(){
    var el=document.getElementById('gomnaHomeHello');
    if(!el)return;
    var name='';
    try{
      if(window.GomnaAuth&&typeof window.GomnaAuth.isSignedIn==='function'&&window.GomnaAuth.isSignedIn()&&typeof window.GomnaAuth.getAccount==='function'){
        var info=window.GomnaAuth.getAccount();
        name=safeDisplayName(info&&info.name);
      }
    }catch(e){}
    el.textContent='';
    if(name){
      var tpl=uiT('home.hello.named','{name}님, 오늘도 평안하세요');
      var parts=String(tpl).split('{name}');
      if(parts.length>1){
        if(parts[0])el.appendChild(document.createTextNode(parts[0]));
        var b=document.createElement('b');
        b.textContent=name;
        el.appendChild(b);
        if(parts[1])el.appendChild(document.createTextNode(parts[1]));
      }else{
        el.textContent=uiFmt('home.hello.named',{name:name}, name+'님, 오늘도 평안하세요');
      }
    }else{
      el.textContent=uiT('home.hello.guest','잠시 머물러 보세요');
    }
  }
  function syncSocial(){
    if(!root)return;
    var card=root.querySelector('.gomna-home-card[data-card="0"]');
    if(!card)return;
    var likeBtn=card.querySelector('[data-ghd-like]');
    if(likeBtn)likeBtn.setAttribute('aria-pressed', socialState.liked?'true':'false');
    var likeN=card.querySelector('[data-ghd-like] .gomna-home-act-count');
    if(likeN)likeN.textContent=String(Math.max(0, socialState.likeCount|0));
    var commentN=card.querySelector('[data-ghd-comment] .gomna-home-act-count');
    if(commentN)commentN.textContent=String(Math.max(0, socialState.commentCount|0));
    var shareN=card.querySelector('[data-ghd-share] .gomna-home-act-count');
    if(shareN)shareN.textContent=uiT('home.card.share','공유');
  }
  function applyReaderTarget(card){
    var detail=cardDetail(card&&card.getAttribute('data-card'));
    var t=parseRef(detail&&(detail.scriptureTarget||detail.reference));
    if(typeof setHomeFeedReaderTarget==='function')setHomeFeedReaderTarget(t);
    return t;
  }
  function openCardReader(card, mode){
    applyReaderTarget(card||cards[0]);
    var extra={};
    var id=card&&card.getAttribute('data-card');
    if(mode==='read' && id==='1'){
      extra.source='home-life';
      extra.theme=lifeThemeId;
    }else if(mode==='read' && id==='2'){
      extra.source='home-bible-person';
      extra.person=storyPersonId;
    }
    if(typeof openDailyVerse==='function')openDailyVerse(mode, extra);
  }
  function viewH(){return (window.visualViewport&&window.visualViewport.height)||window.innerHeight;}
  function deckScrollY(){return root?root.scrollTop:window.scrollY;}
  function pinDeckScroll(y){
    if(root && Math.abs(root.scrollTop-y)>1)root.scrollTop=y;
  }
  function stepH(){
    var step=root&&root.querySelector('.gomna-home-deck-step');
    return (step&&step.offsetHeight)||Math.round(viewH()*0.72);
  }
  function syncStepSize(){
    if(!root||!stage)return;
    var h=Math.max(280, Math.round((stage.clientHeight||viewH()*0.62)*0.84));
    root.style.setProperty('--ghd-step-h', h+'px');
  }
  function progressFromScroll(){
    if(!root)return 0;
    return clamp(deckScrollY()/stepH(), 0, count-1);
  }
  function lockY(){return stepH();}
  function lockY3(){return stepH()*2;}
  function dirCommitPx(){return Math.max(14, Math.round(stepH()*0.025));}
  function preloadLifeThemeImages(){
    if(lifeImgsPreloaded)return;
    lifeImgsPreloaded=true;
    Object.keys(LIFE_THEME_IMGS).forEach(function(id){
      var img=new Image();
      img.decoding='async';
      img.src=LIFE_THEME_IMGS[id];
    });
  }
  function maybePreloadLife(){
    if(!lifeImgsPreloaded && progressFromScroll()>=0.18)preloadLifeThemeImages();
  }
  function preloadStoryPersonImages(){
    if(storyImgsPreloaded)return;
    storyImgsPreloaded=true;
    Object.keys(STORY_PERSON_IMGS).forEach(function(id){
      var img=new Image();
      img.decoding='async';
      img.src=STORY_PERSON_IMGS[id];
    });
  }
  function maybePreloadStory(){
    if(!storyImgsPreloaded && progressFromScroll()>=1.05)preloadStoryPersonImages();
  }
  function resetStackGate(){
    card2Settled=false;
    card3Settled=false;
    allowCard3=false;
    allowCard1From2=false;
    allowCard2From3=false;
    awaitingDir=false;
    gestureEndedSinceSettle=false;
    settleAnim=false;
    pinching=false;
    lastP=0;
    if(root)root.removeAttribute('data-ghd-card2');
  }
  function gatedProgress(p){
    if(card3Settled && !allowCard2From3 && p<2)return 2;
    if(!allowCard3 && !card3Settled && p>1)return 1;
    if(card2Settled && !allowCard1From2 && p<1)return 1;
    return p;
  }
  function startSettleTo1(){
    card2Settled=false;
    card3Settled=false;
    allowCard3=false;
    allowCard1From2=false;
    allowCard2From3=false;
    awaitingDir=false;
    gestureEndedSinceSettle=!gestureLive;
    settleAnim=true;
    if(settleAnimTimer)clearTimeout(settleAnimTimer);
    settleAnimTimer=setTimeout(function(){settleAnim=false;settleAnimTimer=0;}, SETTLE_MS+40);
    pinDeckScroll(0);
    lastP=0;
    if(root)root.removeAttribute('data-ghd-card2');
    apply(0, false);
  }
  function startSettleTo2(){
    card2Settled=true;
    card3Settled=false;
    allowCard3=false;
    allowCard1From2=false;
    allowCard2From3=false;
    awaitingDir=false;
    gestureEndedSinceSettle=!gestureLive;
    settleAnim=true;
    if(settleAnimTimer)clearTimeout(settleAnimTimer);
    settleAnimTimer=setTimeout(function(){settleAnim=false;settleAnimTimer=0;}, SETTLE_MS+40);
    pinDeckScroll(lockY());
    lastP=1;
    if(root)root.setAttribute('data-ghd-card2','settled');
    apply(1, false);
  }
  function startSettleTo3(){
    card3Settled=true;
    card2Settled=false;
    allowCard3=false;
    allowCard1From2=false;
    allowCard2From3=false;
    awaitingDir=false;
    gestureEndedSinceSettle=!gestureLive;
    settleAnim=true;
    if(settleAnimTimer)clearTimeout(settleAnimTimer);
    settleAnimTimer=setTimeout(function(){settleAnim=false;settleAnimTimer=0;}, SETTLE_MS+40);
    pinDeckScroll(lockY3());
    lastP=2;
    if(root)root.removeAttribute('data-ghd-card2');
    apply(2, false);
  }
  function isTouchPointer(ev){
    return !!(ev && ev.pointerType==='touch');
  }
  function markGestureStart(ev){
    if(lifeDetailOpen())return;
    if(isTouchPointer(ev))return;
    if(ev && ev.touches && ev.touches.length>=2){
      pinching=true;
      pinchScrollY=deckScrollY();
      awaitingDir=false;
      return;
    }
    if(pinching)return;
    gestureLive=true;
    if((card2Settled || card3Settled) && gestureEndedSinceSettle)awaitingDir=true;
  }
  function markGestureEnd(ev){
    if(isTouchPointer(ev))return;
    if(ev && ev.touches && ev.touches.length>=1)return;
    if(pinching){
      pinching=false;
      gestureLive=false;
      return;
    }
    gestureLive=false;
    if(card2Settled || card3Settled)gestureEndedSinceSettle=true;
    if(swipeHandled){
      swipeHandled=false;
      return;
    }
    if(card2Settled && !allowCard3 && !allowCard1From2){
      pinDeckScroll(lockY());
      apply(1, true);
    }else if(card3Settled && !allowCard2From3){
      pinDeckScroll(lockY3());
      apply(2, true);
    }else if(allowCard3 && !card3Settled){
      if(progressFromScroll()>=1.08)startSettleTo3();
      else startSettleTo2();
    }else if(allowCard2From3 && !card2Settled){
      if(progressFromScroll()<=1.92)startSettleTo2();
      else startSettleTo3();
    }else if(allowCard1From2 && !card2Settled){
      if(progressFromScroll()<=0.92)startSettleTo1();
      else startSettleTo2();
    }
  }
  function onDeckWheel(){
    markGestureStart();
    if(wheelIdleTimer)clearTimeout(wheelIdleTimer);
    wheelIdleTimer=setTimeout(markGestureEnd, 180);
  }
  function swipePoint(ev){
    if(ev.touches && ev.touches[0])return {x:ev.touches[0].clientX, y:ev.touches[0].clientY};
    if(ev.changedTouches && ev.changedTouches[0])return {x:ev.changedTouches[0].clientX, y:ev.changedTouches[0].clientY};
    if(typeof ev.clientX==='number')return {x:ev.clientX, y:ev.clientY};
    return null;
  }
  function lifeDetailOpen(){
    var card=root&&root.querySelector('.gomna-home-card[data-card="1"]');
    return !!(card && card.classList.contains('is-open'));
  }
  var lifeScrollLog=[];
  var lifeScrollLogPrint=false;
  try{lifeScrollLogPrint=/(?:^|[?&])ghdScrollLog=1(?:&|$)/.test(location.search);}catch(e){}
  function logLifeScroll(ev, sc, x, y, axis, prevented){
    if(!lifeDetailOpen())return;
    var drag=swipeDrag;
    var entry={
      type:ev&&ev.type||'',
      target:ev&&ev.target?String((ev.target.className&&ev.target.className.baseVal)||ev.target.className||ev.target.nodeName):'',
      startY:drag?drag.y:0,
      y:y,
      deltaY:drag?y-drag.y:0,
      deltaX:drag?x-drag.x:0,
      axis:axis||(drag&&drag.axis)||'',
      scrollTop:sc?sc.scrollTop:null,
      scrollHeight:sc?sc.scrollHeight:null,
      clientHeight:sc?sc.clientHeight:null,
      preventDefault:!!prevented,
      flipping:!!flipping,
      settleAnim:!!settleAnim
    };
    lifeScrollLog.push(entry);
    if(lifeScrollLog.length>40)lifeScrollLog.shift();
    if(lifeScrollLogPrint)try{console.log('[ghd-life-scroll]', entry);}catch(err){}
  }
  window.__ghdLifeScrollLog=function(){return lifeScrollLog.slice();};
  function layerDetailCard(){
    if(!root)return null;
    return root.querySelector('.gomna-home-card.is-active.is-open[data-card="1"], .gomna-home-card.is-active.is-open[data-card="2"]');
  }
  function layerDetailOpen(){
    return !!layerDetailCard();
  }
  function storyDetailOpen(){
    var card=root&&root.querySelector('.gomna-home-card[data-card="2"]');
    return !!(card && card.classList.contains('is-open'));
  }
  function activeStackIndex(){
    if(card3Settled)return 2;
    if(card2Settled)return 1;
    return Math.round(clamp(lastP, 0, 2));
  }
  function pointInGestureCard(x, y){
    var card=root&&root.querySelector('.gomna-home-card.is-active');
    if(!card)return false;
    if(card.classList.contains('is-open') && card.getAttribute('data-card')!=='1' && card.getAttribute('data-card')!=='2')return false;
    var r=card.getBoundingClientRect();
    return x>=r.left && x<=r.right && y>=r.top && y<=r.bottom;
  }
  function beginSwipe(x, y, pointerId){
    if(pinching || swipeDrag)return false;
    var layerOpen=layerDetailOpen();
    if(flipping && !layerOpen)return false;
    if(document.documentElement.classList.contains('gomna-home-viewer-open'))return false;
    if(document.querySelector('.ghd-sheet.is-open'))return false;
    if(root.querySelector('.gomna-home-card.is-open:not([data-card="1"]):not([data-card="2"])'))return false;
    if(!pointInGestureCard(x, y))return false;
    swipeDrag={
      y:y,
      x:x,
      lastX:x,
      lastY:y,
      t:Date.now(),
      scroll:deckScrollY(),
      swiping:false,
      axis:'',
      pointerId:pointerId,
      lifeOpen:layerOpen,
      from:activeStackIndex()
    };
    swipeHandled=false;
    pointerMoved=false;
    if(!layerOpen)markGestureStart();
    return true;
  }
  function applySwipeMove(x, y, ev){
    if(!swipeDrag || pinching)return;
    if(flipping && !swipeDrag.lifeOpen)return;
    var dy=y-swipeDrag.y;
    var dx=x-swipeDrag.x;
    var adx=Math.abs(dx), ady=Math.abs(dy);
    var lifeOpenNow=lifeDetailOpen();
    var sc=lifeOpenNow?root.querySelector('.gomna-home-card[data-card="1"].is-open .gomna-home-leaf-scroll'):null;
    swipeDrag.lastX=x;
    swipeDrag.lastY=y;
    if(lifeOpenNow){
      if(!swipeDrag.axis){
        if(adx<AXIS_PX && ady<AXIS_PX){
          logLifeScroll(ev, sc, x, y, '', false);
          return;
        }
        if(ady>=adx*1.1){
          logLifeScroll(ev, sc, x, y, 'y-native', false);
          return;
        }
        if(adx>ady*AXIS_RATIO){
          swipeDrag.axis='x';
          swipeDrag.swiping=true;
          pointerMoved=true;
        }else{
          logLifeScroll(ev, sc, x, y, '', false);
          return;
        }
      }
      if(swipeDrag.axis!=='x'){
        logLifeScroll(ev, sc, x, y, swipeDrag.axis||'y-native', false);
        return;
      }
    }else if(!swipeDrag.axis){
      if(adx<AXIS_PX && ady<AXIS_PX)return;
      if(adx>ady*AXIS_RATIO){
        swipeDrag.axis='x';
        swipeDrag.swiping=true;
        pointerMoved=true;
      }else if(ady>adx*AXIS_RATIO){
        if(swipeDrag.lifeOpen){
          var layer=layerDetailCard();
          var leaf=layer&&layer.querySelector('.gomna-home-leaf-scroll');
          swipeDrag.axis='y';
          swipeDrag.swiping=true;
          swipeDrag.leaf=leaf;
          swipeDrag.leafScroll=leaf?leaf.scrollTop:0;
          pointerMoved=true;
          if(swipeDrag.pointerId!=null && root){
            try{root.releasePointerCapture(swipeDrag.pointerId);}catch(err){}
          }
        }else{
          swipeDrag.axis='y';
          swipeDrag.swiping=true;
          pointerMoved=true;
        }
      }else{
        return;
      }
    }
    if(ev && ev.cancelable)ev.preventDefault();
    if(lifeOpenNow){
      logLifeScroll(ev, sc, x, y, swipeDrag.axis, true);
      return;
    }
    if(swipeDrag.leaf){
      var leafEl=swipeDrag.leaf;
      var max=Math.max(0, leafEl.scrollHeight-leafEl.clientHeight);
      var next=swipeDrag.leafScroll-(y-swipeDrag.y);
      leafEl.scrollTop=next<0?0:(next>max?max:next);
      return;
    }
    if(swipeDrag.lifeOpen || swipeDrag.axis!=='y')return;
    var maxY=stepH()*(count-1);
    pinDeckScroll(clamp(swipeDrag.scroll-dy, 0, maxY));
  }
  function onSwipeStart(ev){
    if(ev.touches && ev.touches.length!==1){
      swipeDrag=null;
      return;
    }
    var p=swipePoint(ev);
    if(!p)return;
    beginSwipe(p.x, p.y, null);
  }
  function onSwipeMove(ev){
    if(ev.touches && ev.touches.length!==1){
      swipeDrag=null;
      return;
    }
    var p=swipePoint(ev);
    if(!p)return;
    applySwipeMove(p.x, p.y, ev);
  }
  function onPtrStart(ev){
    if(lifeDetailOpen() && ev.pointerType==='touch')return;
    if(!ev.isPrimary){
      swipeDrag=null;
      return;
    }
    if(ev.pointerType==='mouse' && ev.buttons!==1)return;
    var onAction=isAction(ev.target);
    if(beginSwipe(ev.clientX, ev.clientY, ev.pointerId) && root && !layerDetailOpen()){
      /* Mouse/pen capture retargets pointerup+click onto the deck, so Mac
         clicks never reach selectLifeTheme / selectStoryPerson. iPhone tap
         still uses pointerType=touch capture for stack swipe. */
      if(!(onAction && ev.pointerType!=='touch')){
        try{root.setPointerCapture(ev.pointerId);}catch(err){}
      }
    }
  }
  function onPtrMove(ev){
    if(lifeDetailOpen() && ev.pointerType==='touch')return;
    if(!swipeDrag)return;
    if(swipeDrag.pointerId!=null && ev.pointerId!==swipeDrag.pointerId)return;
    applySwipeMove(ev.clientX, ev.clientY, ev);
  }
  function settleTo(i){
    if(i>=2)startSettleTo3();
    else if(i===1)startSettleTo2();
    else startSettleTo1();
  }
  function finishSwipe(from, up, down){
    if(up){
      settleTo(Math.min(2, from+1));
      return;
    }
    if(down){
      settleTo(Math.max(0, from-1));
      return;
    }
    settleTo(from);
  }
  function applyLayerSwipe(left, right){
    if(!left && !right)return;
    if(layerDetailOpen()){
      if(right)closeCard(layerDetailCard(), false);
      return;
    }
    var i=activeStackIndex();
    if(right){
      if(i>=2)startSettleTo2();
      else if(i===1)startSettleTo1();
      return;
    }
    if(i<=0)startSettleTo2();
    else if(i===1)startSettleTo3();
  }
  function endSwipe(ev){
    if(pinching){
      swipeDrag=null;
      return;
    }
    var drag=swipeDrag;
    swipeDrag=null;
    if(!drag)return;
    if(drag.pointerId!=null && ev && ev.pointerId!=null && ev.pointerId!==drag.pointerId){
      swipeDrag=drag;
      return;
    }
    if(!drag.swiping || !drag.axis){
      markGestureEnd(ev && ev.pointerType==='touch'?null:ev);
      return;
    }
    if(drag.lifeOpen && drag.axis==='y'){
      markGestureEnd(ev && ev.pointerType==='touch'?null:ev);
      return;
    }
    var p={x:drag.lastX, y:drag.lastY};
    var dt=Math.max(16, Date.now()-drag.t);
    swipeHandled=true;
    if(ev && ev.cancelable)ev.preventDefault();
    if(drag.axis==='x'){
      var dx=p.x-drag.x;
      var velX=dx/dt;
      var left=dx<=-H_SWIPE_PX || velX<=-H_SWIPE_VEL;
      var right=dx>=H_SWIPE_PX || velX>=H_SWIPE_VEL;
      applyLayerSwipe(left, right);
    }else{
      var dy=p.y-drag.y;
      var vel=-dy/dt;
      var up=dy<=-SWIPE_PX || vel>=SWIPE_VEL;
      var down=dy>=SWIPE_PX || vel<=-SWIPE_VEL;
      finishSwipe(drag.from, up, down);
    }
    gestureLive=false;
    if(card2Settled || card3Settled)gestureEndedSinceSettle=true;
    swipeDrag=null;
  }
  function onSwipeEnd(ev){
    endSwipe(ev);
  }
  function onPtrEnd(ev){
    if(lifeDetailOpen() && ev.pointerType==='touch')return;
    endSwipe(ev);
  }
  function bindDeckSwipe(){
    if(!root || root.getAttribute('data-ghd-swipe-bound')==='1')return;
    root.setAttribute('data-ghd-swipe-bound','1');
    document.addEventListener('touchstart', onSwipeStart, {passive:true, capture:true});
    document.addEventListener('touchmove', onSwipeMove, {passive:false, capture:true});
    document.addEventListener('touchend', onSwipeEnd, {passive:false, capture:true});
    document.addEventListener('touchcancel', onSwipeEnd, {passive:true, capture:true});
    document.addEventListener('pointerdown', onPtrStart, {passive:true, capture:true});
    document.addEventListener('pointermove', onPtrMove, {passive:false, capture:true});
    document.addEventListener('pointerup', onPtrEnd, {passive:false, capture:true});
    document.addEventListener('pointercancel', onPtrEnd, {passive:true, capture:true});
  }
  function layoutNums(){
    var stageH=stage?stage.clientHeight:Math.round(viewH()*0.62);
    return {
      sliver:0,
      peek:0,
      stageH:stageH,
      frontH:Math.max(280, stageH)
    };
  }
  function apply(p, instant){
    p=gatedProgress(p);
    progress=p;
    var L=layoutNums();
    var peek=16;
    var scaleStep=0.08;
    var reserved=p*peek;
    var cardH=Math.max(280, L.stageH-reserved);
    var parkY=L.stageH+32;
    var dur=(instant||reduce)?'none':(settleAnim?'transform '+SETTLE_MS+'ms ease-out':'transform 80ms linear');
    cards.forEach(function(card,i){
      var behind=Math.max(0, p-i);
      var incoming=Math.max(0, i-p);
      var scale=1-(behind*scaleStep);
      var y;
      if(incoming>=1)y=parkY;
      else if(incoming>0)y=reserved+incoming*(parkY-reserved);
      else y=reserved-(behind*peek);
      var active=behind<0.42 && incoming<0.42;
      if(!card.classList.contains('is-open'))card.style.height=cardH+'px';
      card.style.width='100%';
      card.style.transform='translate3d(-50%,'+y+'px,0) scale('+scale+')';
      card.style.transition=dur;
      card.classList.toggle('is-active', active);
      card.classList.toggle('is-behind', !active);
      card.setAttribute('aria-hidden', active?'false':'true');
      if(active)card.setAttribute('tabindex','0');
      else card.removeAttribute('tabindex');
      card.style.zIndex=String(10+i);
      if(!active && !pinching){
        var inner=card.querySelector('.gomna-home-card-inner');
        if(inner && inner.getAttribute('data-ghd-pinch') && inner.getAttribute('data-ghd-pinch')!=='1'){
          resetPinchSurface(inner);
        }
      }
    });
    if(root)root.setAttribute('data-ghd-active', String(Math.round(p)));
  }
  function onScroll(){
    if(pinching){
      pinDeckScroll(pinchScrollY);
      return;
    }
    if(!root.querySelector('.gomna-home-card.is-open'))flipping=false;
    if(flipping){
      pinDeckScroll(openScrollY);
      return;
    }
    maybePreloadLife();
    maybePreloadStory();
    var raw=progressFromScroll();
    var lock=lockY();
    var commit=dirCommitPx();
    if(card3Settled && !allowCard2From3){
      if(awaitingDir){
        if(deckScrollY()<lockY3()-commit){
          allowCard2From3=true;
          card3Settled=false;
          awaitingDir=false;
        }else{
          lastP=2;
          return;
        }
      }else{
        pinDeckScroll(lockY3());
        apply(2, !settleAnim);
        lastP=2;
        return;
      }
    }
    if(card2Settled && !allowCard3 && !allowCard1From2){
      if(awaitingDir){
        var y=deckScrollY();
        if(y>lock+commit){
          allowCard3=true;
          card2Settled=false;
          awaitingDir=false;
          if(root)root.removeAttribute('data-ghd-card2');
        }else if(y<lock-commit){
          allowCard1From2=true;
          card2Settled=false;
          awaitingDir=false;
          if(root)root.removeAttribute('data-ghd-card2');
        }else{
          lastP=1;
          return;
        }
      }else{
        pinDeckScroll(lock);
        apply(1, !settleAnim);
        lastP=1;
        return;
      }
    }
    if(raw<0.12){
      allowCard3=false;
      allowCard1From2=false;
      allowCard2From3=false;
      card2Settled=false;
      card3Settled=false;
      awaitingDir=false;
      if(root)root.removeAttribute('data-ghd-card2');
    }
    if(!card2Settled && !allowCard3 && !card3Settled && lastP<1 && raw>=SETTLE_AT && raw>=lastP){
      startSettleTo2();
      return;
    }
    if(allowCard3 && !card3Settled && raw>=(1+SETTLE_AT) && raw>=lastP){
      startSettleTo3();
      return;
    }
    if(allowCard2From3 && !card2Settled && lastP>1 && raw<=(2-SETTLE_AT) && raw<=lastP){
      startSettleTo2();
      return;
    }
    if(allowCard1From2 && !card2Settled && raw<=0.22 && raw<=lastP){
      startSettleTo1();
      return;
    }
    if(raf)return;
    raf=requestAnimationFrame(function(){
      raf=0;
      lastP=progressFromScroll();
      apply(lastP, false);
    });
  }
  function closeCard(card, skipHistory){
    if(!card||!card.classList.contains('is-open'))return;
    resetPinchSurface(card.querySelector('.gomna-home-card-inner'));
    card.classList.remove('is-open');
    card.querySelectorAll('.gomna-home-card-face').forEach(function(face){
      face.classList.toggle('is-shown', face.getAttribute('data-face')==='tease');
    });
    card.style.height='';
    flipping=false;
    swipeDrag=null;
    swipeHandled=false;
    document.documentElement.classList.remove('gomna-home-card-open');
    if(!skipHistory && history.state && history.state.ghd==='flip'){
      try{history.back();}catch(e){}
    }
    apply(progressFromScroll(), true);
    if(card.getAttribute('data-card')==='0')schedulePlaceTodayVerse();
  }
  function resetHomeToFirstCard(){
    closeSheets();
    closeViewer(true);
    if(cards&&cards.length){
      cards.forEach(function(card){closeCard(card, true);});
    }
    flipping=false;
    resetStackGate();
    if(root)root.scrollTop=0;
    window.scrollTo(0, 0);
    apply(0, true);
    try{
      if(history.state && (history.state.ghd==='flip' || history.state.ghd==='viewer')){
        history.replaceState({}, '', location.href);
      }
    }catch(e){}
  }
  function openCard(card, skipHistory){
    if(!card||!card.classList.contains('is-active')||card.classList.contains('is-open'))return;
    if(Math.abs(progress-cards.indexOf(card))>0.12)return;
    openScrollY=deckScrollY();
    flipping=true;
    swipeDrag=null;
    swipeHandled=false;
    pointerMoved=false;
    resetPinchSurface(card.querySelector('.gomna-home-card-inner'));
    card.classList.add('is-open');
    card.querySelectorAll('.gomna-home-card-face').forEach(function(face){
      face.classList.toggle('is-shown', face.getAttribute('data-face')==='open');
    });
    document.documentElement.classList.add('gomna-home-card-open');
    var sc=card.querySelector('.gomna-home-detail-scroll');
    if(sc)sc.scrollTop=0;
    if(!skipHistory){
      try{history.pushState({ghd:'flip',card:card.getAttribute('data-card')}, '');}catch(e){}
    }
  }
  function toggleOpen(card){
    if(card.classList.contains('is-open'))closeCard(card, false);
    else openCard(card);
  }
  function pinchDist(ev){
    if(!ev.touches || ev.touches.length<2)return 0;
    var a=ev.touches[0], b=ev.touches[1];
    var dx=a.clientX-b.clientX, dy=a.clientY-b.clientY;
    return Math.sqrt(dx*dx+dy*dy);
  }
  function pinchMid(ev){
    if(!ev.touches || ev.touches.length<2)return null;
    return {
      x:(ev.touches[0].clientX+ev.touches[1].clientX)/2,
      y:(ev.touches[0].clientY+ev.touches[1].clientY)/2
    };
  }
  function resetPinchSurface(inner){
    if(!inner)return;
    inner.setAttribute('data-ghd-pinch','1');
    inner.removeAttribute('data-ghd-pinx');
    inner.removeAttribute('data-ghd-piny');
    inner.style.transform='';
  }
  function bindPinch(card){
    var id=card.getAttribute('data-card');
    if(id!=='0' && id!=='1')return;
    var inner=card.querySelector('.gomna-home-card-inner');
    if(!inner || inner.getAttribute('data-ghd-pinch-bound')==='1')return;
    inner.setAttribute('data-ghd-pinch-bound','1');
    var startDist=0, base=1, startTx=0, startTy=0, startMid=null, startRect=null, surface=false;
    card.addEventListener('touchstart', function(ev){
      if(ev.touches.length<2)return;
      if(!card.classList.contains('is-active') && !card.classList.contains('is-open'))return;
      pinching=true;
      pinchScrollY=deckScrollY();
      awaitingDir=false;
      gestureLive=false;
      swipeDrag=null;
      pointerMoved=true;
      startDist=pinchDist(ev)||1;
      base=parseFloat(inner.getAttribute('data-ghd-pinch')||'1')||1;
      surface=(id==='1' && card.classList.contains('is-open'));
      if(surface){
        startTx=parseFloat(inner.getAttribute('data-ghd-pinx')||'0')||0;
        startTy=parseFloat(inner.getAttribute('data-ghd-piny')||'0')||0;
        startMid=pinchMid(ev);
        startRect=inner.getBoundingClientRect();
      }
    }, {passive:true});
    card.addEventListener('touchmove', function(ev){
      if(!pinching || ev.touches.length<2)return;
      if(ev.cancelable)ev.preventDefault();
      var s=clamp(base*(pinchDist(ev)/startDist), 1, 1.72);
      if(surface && startMid && startRect){
        var mid=pinchMid(ev);
        var tx, ty;
        if(s<=1){
          resetPinchSurface(inner);
        }else{
          tx=mid.x-startRect.left+startTx-(startMid.x-startRect.left)/base*s;
          ty=mid.y-startRect.top+startTy-(startMid.y-startRect.top)/base*s;
          inner.setAttribute('data-ghd-pinch', String(s));
          inner.setAttribute('data-ghd-pinx', String(tx));
          inner.setAttribute('data-ghd-piny', String(ty));
          inner.style.transform='translate('+tx+'px,'+ty+'px) scale('+s+')';
        }
      }else{
        inner.setAttribute('data-ghd-pinch', String(s));
        inner.style.transform=s===1?'':'scale('+s+')';
      }
      pinDeckScroll(pinchScrollY);
    }, {passive:false});
    function endPinch(ev){
      if(ev.touches && ev.touches.length>=2)return;
      if(!pinching)return;
      pinching=false;
      var s=parseFloat(inner.getAttribute('data-ghd-pinch')||'1')||1;
      if(s<1.04)resetPinchSurface(inner);
      surface=false;
      startMid=null;
      startRect=null;
    }
    card.addEventListener('touchend', endPinch, {passive:true});
    card.addEventListener('touchcancel', endPinch, {passive:true});
  }
  function bindCard(card){
    bindPinch(card);
    var sc=card.querySelector('.gomna-home-detail-scroll');
    if(sc && sc.getAttribute('data-ghd-scroll-bound')!=='1'){
      sc.setAttribute('data-ghd-scroll-bound','1');
      ['touchstart','touchmove','wheel'].forEach(function(type){
        sc.addEventListener(type, function(ev){
          if(ev.touches && ev.touches.length>=2)return;
          ev.stopPropagation();
        },{passive:true});
      });
      sc.addEventListener('scroll', function(){
        scrollQuiet=false;
        if(scrollQuietTimer)clearTimeout(scrollQuietTimer);
        scrollQuietTimer=setTimeout(function(){scrollQuiet=true;}, 160);
      }, {passive:true});
    }
    card.addEventListener('pointerdown', function(ev){
      pointerY=ev.clientY; pointerX=ev.clientX; pointerT=Date.now(); pointerMoved=false;
    });
    card.addEventListener('pointermove', function(ev){
      if(Math.abs(ev.clientY-pointerY)>12||Math.abs(ev.clientX-pointerX)>12)pointerMoved=true;
    });
    card.addEventListener('click', function(ev){
      if(isAction(ev.target)||pointerMoved)return;
      if(Date.now()-pointerT>420)return;
      if(card.classList.contains('is-open')&&!scrollQuiet)return;
      if((card.getAttribute('data-card')==='1' || card.getAttribute('data-card')==='2') && !card.classList.contains('is-open'))return;
      toggleOpen(card);
    });
    card.addEventListener('keydown', function(ev){
      if(ev.key==='Enter'||ev.key===' '){
        if(isAction(ev.target))return;
        if((card.getAttribute('data-card')==='1' || card.getAttribute('data-card')==='2') && !card.classList.contains('is-open'))return;
        ev.preventDefault();
        toggleOpen(card);
      }
    });
  }
  function socialClient(){
    try{
      if(window.GomnaAuth&&typeof window.GomnaAuth.getClient==='function')return window.GomnaAuth.getClient();
    }catch(e){}
    return null;
  }
  function socialUserId(){
    try{
      if(window.GomnaAuth&&typeof window.GomnaAuth.isSignedIn==='function'&&window.GomnaAuth.isSignedIn()){
        var a=window.GomnaAuth.getAccount()||{};
        return String(a.id||'');
      }
    }catch(e){}
    return '';
  }
  function socialAccountName(){
    try{
      if(window.GomnaAuth&&typeof window.GomnaAuth.isSignedIn==='function'&&window.GomnaAuth.isSignedIn()){
        var a=window.GomnaAuth.getAccount()||{};
        return String(a.name||'').trim();
      }
    }catch(e){}
    return '';
  }
  function socialGuestKey(){
    if(socialGuestMem&&/^[A-Za-z0-9_-]{16,64}$/.test(socialGuestMem))return socialGuestMem;
    var cur='';
    try{cur=localStorage.getItem(SOCIAL_DEVICE_KEY)||'';}catch(e){cur='';}
    if(cur&&/^[A-Za-z0-9_-]{16,64}$/.test(cur)){
      socialGuestMem=cur;
      return cur;
    }
    var bytes=new Uint8Array(18);
    try{crypto.getRandomValues(bytes);}catch(e){
      var i;
      for(i=0;i<bytes.length;i++)bytes[i]=Math.floor(Math.random()*256);
    }
    var s=Array.prototype.map.call(bytes, function(b){return (b%36).toString(36);}).join('');
    s=(s+Date.now().toString(36)).replace(/[^A-Za-z0-9_-]/g,'').slice(0,24);
    if(s.length<16)s=(s+'xxxxxxxxxxxxxxxx').slice(0,16);
    socialGuestMem=s;
    try{localStorage.setItem(SOCIAL_DEVICE_KEY, s);}catch(e){}
    return s;
  }
  function socialGuestName(){
    try{return String(localStorage.getItem(SOCIAL_NAME_KEY)||'').trim();}catch(e){return '';}
  }
  function saveSocialGuestName(name){
    name=String(name||'').trim().slice(0,16);
    try{
      if(name)localStorage.setItem(SOCIAL_NAME_KEY, name);
      else localStorage.removeItem(SOCIAL_NAME_KEY);
    }catch(e){}
    return name;
  }
  function ownedCommentIds(){
    try{
      var raw=localStorage.getItem(SOCIAL_COMMENT_IDS);
      var parsed=raw?JSON.parse(raw):{};
      return parsed&&typeof parsed==='object'?parsed:{};
    }catch(e){return {};}
  }
  function rememberCommentId(id){
    if(!id)return;
    var map=ownedCommentIds();
    map[id]=1;
    try{localStorage.setItem(SOCIAL_COMMENT_IDS, JSON.stringify(map));}catch(e){}
  }
  function parseSocialJson(data){
    if(typeof data==='string'){
      try{data=JSON.parse(data);}catch(e){return {};}
    }
    return data&&typeof data==='object'?data:{};
  }
  function todayVerseId(){
    var card=root&&root.querySelector('.gomna-home-card[data-card="0"]');
    return (card&&card.getAttribute('data-content-id'))||'';
  }
  function applySocialSummary(id, summary){
    if(!id || (socialState.verseId && socialState.verseId!==id && todayVerseId()!==id))return;
    socialState.verseId=id;
    socialState.likeCount=Math.max(0, Number(summary&&summary.like_count)||0);
    socialState.liked=!!(summary&&summary.liked);
    socialState.commentCount=Math.max(0, Number(summary&&summary.comment_count)||0);
    syncSocial();
  }
  function refreshSocial(){
    var id=todayVerseId();
    if(!id){
      socialState={verseId:'', likeCount:0, liked:false, commentCount:0, comments:null};
      syncSocial();
      return Promise.resolve(socialState);
    }
    if(socialState.verseId!==id){
      socialState={verseId:id, likeCount:0, liked:false, commentCount:0, comments:null};
      syncSocial();
    }
    var client=socialClient();
    if(!client){
      syncSocial();
      return Promise.resolve(socialState);
    }
    return client.rpc('gomna_daily_social_summary', {p_verse_id:id, p_guest_key:socialGuestKey()}).then(function(res){
      if(res.error)throw res.error;
      applySocialSummary(id, parseSocialJson(res.data));
      return socialState;
    }).catch(function(){
      if(socialState.verseId!==id){
        socialState={verseId:id, likeCount:0, liked:false, commentCount:0, comments:null};
      }
      syncSocial();
      return socialState;
    });
  }
  function toggleLike(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var id=todayVerseId();
    if(!id||socialBusy)return;
    var prev={likeCount:socialState.likeCount, liked:socialState.liked};
    var nextLiked=!prev.liked;
    socialState.liked=nextLiked;
    socialState.likeCount=Math.max(0, prev.likeCount+(nextLiked?1:-1));
    syncSocial();
    socialBusy=true;
    var client=socialClient();
    if(!client){
      socialState.liked=prev.liked;
      socialState.likeCount=prev.likeCount;
      socialBusy=false;
      syncSocial();
      return;
    }
    client.rpc('gomna_toggle_daily_like', {p_verse_id:id, p_guest_key:socialGuestKey()}).then(function(res){
      socialBusy=false;
      if(res.error)throw res.error;
      var data=parseSocialJson(res.data);
      applySocialSummary(id, {
        like_count:data.like_count,
        liked:data.liked,
        comment_count:socialState.commentCount
      });
    }).catch(function(){
      socialBusy=false;
      socialState.liked=prev.liked;
      socialState.likeCount=prev.likeCount;
      syncSocial();
      refreshSocial();
    });
  }
  function setCommentError(msg){
    var el=document.getElementById('ghdCommentError');
    if(!el)return;
    if(!msg){
      el.hidden=true;
      el.textContent='';
      return;
    }
    el.hidden=false;
    el.textContent=msg;
  }
  function syncCommentComposer(){
    var name=document.getElementById('ghdCommentName');
    var signed=!!socialUserId();
    if(!name)return;
    if(signed){
      name.hidden=true;
      name.value=socialAccountName();
    }else{
      name.hidden=false;
      if(!name.value)name.value=socialGuestName();
    }
  }
  function commentWhen(iso){
    var t=Date.parse(iso);
    if(!t)return '';
    var d=Date.now()-t;
    if(d<60000)return '방금';
    if(d<3600000)return Math.floor(d/60000)+'분 전';
    var dt=new Date(t);
    return pad2(dt.getHours())+':'+pad2(dt.getMinutes());
  }
  function openSocialSheet(id){
    ['ghdCommentSheet','ghdShareSheet'].forEach(function(other){
      if(other!==id)closeSheet(other, 'button');
    });
    openSheet(id);
  }
  function openComments(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var id=todayVerseId();
    setCommentError('');
    syncCommentComposer();
    renderComments(id);
    openSocialSheet('ghdCommentSheet');
    loadComments(id);
  }
  function renderComments(id){
    var list=document.getElementById('ghdCommentList');
    var sheet=document.getElementById('ghdCommentSheet');
    if(sheet)sheet.setAttribute('data-content-id', id||'');
    if(!list)return;
    var items=socialState.comments;
    list.innerHTML='';
    if(!items||!items.length){
      var empty=document.createElement('li');
      empty.className='ghd-comment-empty';
      empty.textContent='아직 남긴 댓글이 없습니다.';
      list.appendChild(empty);
      return;
    }
    items.forEach(function(item){
      var li=document.createElement('li');
      li.className='ghd-comment-item';
      var col=document.createElement('div');
      col.className='ghd-comment-col';
      var meta=document.createElement('p');
      meta.className='ghd-comment-meta';
      var who=String(item.display_name||'익명').trim()||'익명';
      var when=commentWhen(item.created_at);
      meta.textContent=when?who+' · '+when:who;
      var text=document.createElement('p');
      text.className='ghd-comment-body';
      text.textContent=item.content||'';
      col.appendChild(meta);
      col.appendChild(text);
      li.appendChild(col);
      if(item.mine && item.id){
        var del=document.createElement('button');
        del.type='button';
        del.className='ghd-comment-del';
        del.setAttribute('data-ghd-comment-del', item.id);
        del.textContent='삭제';
        li.appendChild(del);
      }
      list.appendChild(li);
    });
  }
  function loadComments(id){
    id=id||todayVerseId();
    var client=socialClient();
    if(!id||!client){
      socialState.comments=socialState.comments||[];
      renderComments(id);
      return Promise.resolve(socialState.comments);
    }
    return client.rpc('gomna_list_daily_comments', {p_verse_id:id, p_guest_key:socialGuestKey()}).then(function(res){
      if(res.error)throw res.error;
      var data=parseSocialJson(res.data);
      var rows=Array.isArray(data)?data:(Array.isArray(res.data)?res.data:[]);
      socialState.comments=rows.map(function(item){
        var row=item||{};
        row.mine=row.mine===true || row.mine===1 || row.mine==='t' || row.mine==='true' || ownedCommentIds()[row.id];
        return row;
      });
      socialState.commentCount=socialState.comments.length;
      renderComments(id);
      syncSocial();
      return socialState.comments;
    }).catch(function(){
      if(!socialState.comments)socialState.comments=[];
      renderComments(id);
      return socialState.comments;
    });
  }
  function saveComment(){
    var sheet=document.getElementById('ghdCommentSheet');
    var input=document.getElementById('ghdCommentInput');
    var nameEl=document.getElementById('ghdCommentName');
    var id=(sheet&&sheet.getAttribute('data-content-id'))||todayVerseId();
    var text=input&&input.value?input.value.trim():'';
    var send=document.getElementById('ghdCommentSave');
    if(!id||!text)return;
    if(Date.now()-socialCommentAt<3000){
      setCommentError('잠시 후 다시 남겨 주세요.');
      return;
    }
    var client=socialClient();
    if(!client){
      setCommentError('잠시 후 다시 시도해 주세요.');
      return;
    }
    var label=socialUserId()?socialAccountName():(nameEl&&nameEl.value?nameEl.value.trim():'');
    if(!socialUserId())saveSocialGuestName(label);
    setCommentError('');
    if(send)send.disabled=true;
    client.rpc('gomna_add_daily_comment', {
      p_verse_id:id,
      p_content:text,
      p_guest_key:socialGuestKey(),
      p_display_name:label||'익명'
    }).then(function(res){
      if(send)send.disabled=false;
      if(res.error)throw res.error;
      var data=parseSocialJson(res.data);
      if(!data.ok){
        if(data.error==='dup')setCommentError('같은 글은 잠시 뒤에 남겨 주세요.');
        else if(data.error==='rate')setCommentError('잠시 후 다시 남겨 주세요.');
        else setCommentError('댓글을 남기지 못했습니다.');
        return;
      }
      socialCommentAt=Date.now();
      if(input)input.value='';
      rememberCommentId(data.id);
      socialState.commentCount=Math.max(0, Number(data.comment_count)||socialState.commentCount);
      syncSocial();
      return loadComments(id);
    }).catch(function(){
      if(send)send.disabled=false;
      setCommentError('댓글을 남기지 못했습니다.');
      refreshSocial();
    });
  }
  function deleteComment(commentId){
    var id=todayVerseId();
    var client=socialClient();
    if(!commentId||!client)return;
    client.rpc('gomna_delete_daily_comment', {p_id:commentId, p_guest_key:socialGuestKey()}).then(function(res){
      if(res.error)throw res.error;
      var data=parseSocialJson(res.data);
      if(!data.ok)return;
      socialState.commentCount=Math.max(0, Number(data.comment_count)||0);
      syncSocial();
      return loadComments(id);
    }).catch(function(){
      loadComments(id);
    });
  }
  function sharePayload(){
    var view=feedView();
    return {
      title:'은혜의말씀',
      text:(view&&view.body?String(view.body).trim()+' ':'')+'('+displayRef(view)+')',
      url:(location.origin||'')+'/?source=home-today',
      ref:displayRef(view)
    };
  }
  function shareCard(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var data=sharePayload();
    var refEl=document.getElementById('ghdShareRef');
    if(refEl)refEl.textContent=data.ref||'오늘의 말씀';
    openSocialSheet('ghdShareSheet');
  }
  function sendShare(){
    var data=sharePayload();
    if(navigator.share){
      navigator.share({title:data.title, text:data.text, url:data.url}).catch(function(){});
      return;
    }
    if(navigator.clipboard&&navigator.clipboard.writeText){
      navigator.clipboard.writeText(data.title+' '+data.text+' '+data.url).catch(function(){});
    }
  }
  function relatedCard(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    openCardReader(cardFromEl(ev&&ev.currentTarget)||cards[0],'listen');
  }
  var sheetDismissLockUntil=0;
  var sheetDismissPointerId=null;
  function mailSheetOpen(){
    var sheet=document.getElementById('ghdMailSheet');
    return !!(sheet && sheet.classList.contains('is-open') && !sheet.hidden);
  }
  function sheetNodeName(node){
    if(!node)return '';
    if(node===window)return 'window';
    if(node===document)return 'document';
    if(node.nodeType!==1)return String(node.nodeName||'');
    var id=node.id?('#'+node.id):'';
    var cls='';
    if(typeof node.className==='string' && node.className){
      cls='.'+node.className.trim().split(/\s+/).slice(0,4).join('.');
    }
    return (id||cls)?(id+cls):node.nodeName;
  }
  function sheetLog(name, ev, extra){
    var debug=false;
    try{debug=/(?:^|[?&])ghdSheetLog=1(?:&|$)/.test(location.search)||!!window.__GHD_SHEET_DEBUG;}catch(err){}
    if(!debug)return;
    var rec={
      t:Date.now(),
      name:name,
      open:mailSheetOpen(),
      htmlOpen:document.documentElement.classList.contains('ghd-sheet-open')
    };
    if(ev){
      rec.eventType=ev.type||'';
      rec.target=sheetNodeName(ev.target);
      rec.currentTarget=sheetNodeName(ev.currentTarget);
      rec.pointerType=ev.pointerType||'';
      rec.x=typeof ev.clientX==='number'?Math.round(ev.clientX):null;
      rec.y=typeof ev.clientY==='number'?Math.round(ev.clientY):null;
      rec.eventTs=typeof ev.timeStamp==='number'?Math.round(ev.timeStamp):null;
      rec.pointerId=ev.pointerId!=null?ev.pointerId:null;
      try{
        if(typeof ev.composedPath==='function'){
          rec.path=ev.composedPath().slice(0,8).map(sheetNodeName);
        }
      }catch(err){}
    }
    if(extra){
      var key;
      for(key in extra){
        if(Object.prototype.hasOwnProperty.call(extra, key))rec[key]=extra[key];
      }
    }
    try{
      if(!window.__ghdSheetLogs)window.__ghdSheetLogs=[];
      window.__ghdSheetLogs.push(rec);
      if(window.__ghdSheetLogs.length>120)window.__ghdSheetLogs.shift();
    }catch(err){}
    try{console.log('[ghd-sheet]', rec);}catch(err){}
  }
  function armSheetDismissLock(ev){
    sheetDismissLockUntil=Date.now()+450;
    sheetDismissPointerId=ev && ev.pointerId!=null ? ev.pointerId : null;
  }
  function sheetDismissLocked(ev){
    if(Date.now()<sheetDismissLockUntil)return true;
    if(ev && sheetDismissPointerId!=null && ev.pointerId===sheetDismissPointerId)return true;
    return false;
  }
  function desktopSheetUi(){
    try{return window.matchMedia('(min-width:700px)').matches;}catch(err){return false;}
  }
  function openSheet(id){
    var sheet=document.getElementById(id);
    if(!sheet)return;
    var wasOpen=sheet.classList.contains('is-open') && !sheet.hidden;
    sheet.hidden=false;
    sheet.classList.add('is-open');
    document.documentElement.classList.add('ghd-sheet-open');
    armSheetDismissLock();
    sheet.style.pointerEvents='none';
    window.requestAnimationFrame(function(){
      window.requestAnimationFrame(function(){
        if(sheet.classList.contains('is-open'))sheet.style.pointerEvents='';
      });
    });
    if(id==='ghdMailSheet'){
      sheetLog('openEmailSheet', null, {wasOpen:wasOpen, openState:true});
      if(!wasOpen)sheetLog('open state true/false 변경', null, {from:false, to:true});
    }
  }
  function closeSheet(id, reason){
    var sheet=document.getElementById(id);
    if(!sheet || (!sheet.classList.contains('is-open') && sheet.hidden))return;
    var why=typeof reason==='string' ? reason : 'unspecified';
    var ev=reason && typeof reason==='object' && reason.type ? reason : null;
    if(id==='ghdMailSheet')sheetLog('closeEmailSheet', ev, {reason:why});
    if((why==='backdrop' || why==='drag') && sheetDismissLocked(ev)){
      if(id==='ghdMailSheet')sheetLog('close-ignored-lock', ev, {reason:why, remain:sheetDismissLockUntil-Date.now()});
      return;
    }
    var mailWas=id==='ghdMailSheet' && sheet.classList.contains('is-open') && !sheet.hidden;
    sheet.classList.remove('is-open');
    sheet.hidden=true;
    sheet.style.pointerEvents='';
    if(!document.querySelector('.ghd-sheet.is-open')){
      document.documentElement.classList.remove('ghd-sheet-open');
    }
    if(mailWas)sheetLog('open state true/false 변경', null, {from:true, to:false});
  }
  function closeSheets(reason){
    var mail=document.getElementById('ghdMailSheet');
    var mailWas=!!(mail && mail.classList.contains('is-open') && !mail.hidden);
    var why=typeof reason==='string' ? reason : 'unspecified';
    var ev=reason && typeof reason==='object' && reason.type ? reason : null;
    if(mailWas)sheetLog('closeEmailSheet', ev, {reason:why});
    if((why==='backdrop' || why==='drag') && sheetDismissLocked(ev)){
      sheetLog('close-ignored-lock', ev, {reason:why, remain:sheetDismissLockUntil-Date.now()});
      return;
    }
    document.querySelectorAll('.ghd-sheet.is-open').forEach(function(sheet){
      sheet.classList.remove('is-open');
      sheet.hidden=true;
      sheet.style.pointerEvents='';
    });
    document.documentElement.classList.remove('ghd-sheet-open');
    if(mailWas)sheetLog('open state true/false 변경', null, {from:true, to:false});
  }
  var pushSubCache=null;
  var pushSubChecked=false;
  function urlBase64ToUint8Array(str){
    var padding='='.repeat((4-str.length%4)%4);
    var base64=(str+padding).replace(/-/g,'+').replace(/_/g,'/');
    var raw=atob(base64);
    var out=new Uint8Array(raw.length);
    var i;
    for(i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);
    return out;
  }
  function pushApiUrl(kind){
    var cfg=window.GomnaPushConfig||{};
    var base='';
    try{base=cfg.apiBase?cfg.apiBase():'';}catch(e){}
    if(!base){
      if(kind==='subscribe')return '/api/push/subscribe';
      if(kind==='unsubscribe')return '/api/push/unsubscribe';
      if(kind==='status')return '/api/push/status';
      return '/api/push/send-test';
    }
    if(kind==='subscribe')return base+'/push-subscribe';
    if(kind==='unsubscribe')return base+'/push-unsubscribe';
    if(kind==='status')return base+'/push-status';
    return base+'/push-send-daily';
  }
  function pushHeaders(){
    var headers={'Content-Type':'application/json'};
    var cfg=window.GomnaPushConfig||{};
    if(cfg.anonKey)headers.apikey=cfg.anonKey;
    return headers;
  }
  var PUSH_PENDING_KEY='gomna_pending_push_opt_in';
  var PUSH_PREFS_KEY='gomna_push_prefs';
  var pushPrefsCache=null;
  var notifyTimeSlot='first';
  function pushPrefsApi(){return window.GomnaPushPrefs||{};}
  function deviceTimezone(){
    var api=pushPrefsApi();
    if(typeof api.deviceTimezone==='function')return api.deviceTimezone();
    try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';}catch(e){return 'UTC';}
  }
  function defaultPushPrefs(){
    var api=pushPrefsApi();
    if(typeof api.defaults==='function')return api.defaults({locale:uiLang(), timezone:deviceTimezone()});
    return {enabled:false, frequency:1, firstTime:'07:30', secondTime:'20:30', timezone:deviceTimezone(), locale:uiLang()};
  }
  function normalizePushPrefs(raw, prev){
    var api=pushPrefsApi();
    if(typeof api.normalizePrefs==='function')return api.normalizePrefs(raw, prev||pushPrefsCache||defaultPushPrefs());
    return Object.assign(defaultPushPrefs(), raw||{});
  }
  function readPushPrefsCache(){
    try{
      var raw=JSON.parse(localStorage.getItem(PUSH_PREFS_KEY)||'');
      if(raw && typeof raw==='object')return normalizePushPrefs(raw);
    }catch(e){}
    return defaultPushPrefs();
  }
  function writePushPrefsCache(prefs){
    pushPrefsCache=normalizePushPrefs(prefs, pushPrefsCache||readPushPrefsCache());
    try{localStorage.setItem(PUSH_PREFS_KEY, JSON.stringify(pushPrefsCache));}catch(e){}
    return pushPrefsCache;
  }
  function currentPushPrefs(){
    return pushPrefsCache||readPushPrefsCache();
  }
  function formatPushClock(hhmm){
    var api=pushPrefsApi();
    if(typeof api.formatClock==='function')return api.formatClock(hhmm, uiLang());
    return hhmm;
  }
  function setNotifyPrefError(msg){
    var el=document.getElementById('ghdNotifyPrefError');
    if(!el)return;
    if(msg){el.hidden=false;el.textContent=msg;}
    else{el.hidden=true;el.textContent='';}
  }
  var pushInstallHelpShown=false;
  var deferredInstallPrompt=null;
  function isPushDevUi(){
    try{return new URLSearchParams(location.search).get('pushDev')==='1';}catch(e){return false;}
  }
  function readPendingPushOptIn(){
    try{return localStorage.getItem(PUSH_PENDING_KEY)==='1';}catch(e){return false;}
  }
  function setPendingPushOptIn(on){
    try{
      if(on)localStorage.setItem(PUSH_PENDING_KEY,'1');
      else localStorage.removeItem(PUSH_PENDING_KEY);
    }catch(e){}
  }
  function isStandalonePwa(){
    try{if(window.navigator&&window.navigator.standalone===true)return true;}catch(e){}
    try{
      if(window.matchMedia('(display-mode: standalone)').matches)return true;
      if(window.matchMedia('(display-mode: fullscreen)').matches)return true;
      if(window.matchMedia('(display-mode: minimal-ui)').matches)return true;
    }catch(e2){}
    try{
      if(new URLSearchParams(location.search).get('source')==='pwa')return true;
    }catch(e3){}
    return false;
  }
  function detectPushEnvironment(){
    var ua=String(navigator.userAgent||'');
    var plat=String(navigator.platform||'');
    var touch=Number(navigator.maxTouchPoints||0);
    var iPad=/iPad/.test(ua) || (plat==='MacIntel' && touch>1);
    var iPhone=/iPhone|iPod/.test(ua);
    var iOS=iPhone||iPad;
    var android=/Android/i.test(ua);
    var mac=!iOS && /Mac/i.test(plat+' '+ua);
    var windows=/Win/i.test(plat+' '+ua);
    var standalone=isStandalonePwa();
    var hasNotif='Notification' in window;
    var hasSW='serviceWorker' in navigator;
    var hasPush=hasSW && 'PushManager' in window;
    var browser='other';
    if(/Edg\//.test(ua))browser='edge';
    else if(/SamsungBrowser/i.test(ua))browser='samsung';
    else if(/Firefox\//.test(ua))browser='firefox';
    else if(/Chrome\//.test(ua)||/CriOS\//.test(ua))browser='chrome';
    else if(/Safari\//.test(ua)&&!/Chrome\//.test(ua)&&!/CriOS\//.test(ua))browser='safari';
    var permission='unsupported';
    if(hasNotif){
      try{permission=Notification.permission||'default';}catch(e){permission='unsupported';}
    }
    var kind='unsupported';
    if(iOS && standalone)kind='ios-pwa';
    else if(iOS)kind='ios-safari-browser';
    else if(android && standalone)kind='android-pwa';
    else if(android)kind='android-browser';
    else if(mac)kind='mac-browser';
    else if(windows)kind='windows-browser';
    else if(hasPush)kind='mac-browser';
    var needsInstall=(kind==='ios-safari-browser') || (kind==='android-browser' && !hasPush);
    return {
      kind:kind, iOS:iOS, iPad:iPad, iPhone:iPhone, android:android, mac:mac, windows:windows,
      standalone:standalone, hasNotif:hasNotif, hasSW:hasSW, hasPush:hasPush,
      browser:browser, permission:permission, needsInstall:needsInstall
    };
  }
  function notifyEnv(){
    var env=detectPushEnvironment();
    env.subscribed=!!pushSubCache;
    env.canAsk=env.hasNotif && env.hasPush && env.permission==='default' && !env.needsInstall;
    env.canSubscribe=env.hasNotif && env.hasPush && env.permission==='granted' && !env.needsInstall;
    return env;
  }
  function resolvePushState(env){
    env=env||notifyEnv();
    if(env.permission==='granted' && env.subscribed)return 'subscribed';
    if(env.needsInstall){
      if(pushInstallHelpShown)return 'install-required';
      return 'permission-default';
    }
    if(env.permission==='denied')return 'permission-denied';
    if(!env.hasNotif || env.permission==='unsupported' || !env.hasPush)return 'unsupported';
    if(env.permission==='granted' && !env.subscribed)return 'permission-granted-no-subscription';
    return 'permission-default';
  }
  function installHelpCopy(env){
    if(env.kind==='android-browser'){
      return {
        lead:'Chrome 오른쪽 위 ⋮ 메뉴에서 설치 또는 홈 화면에 추가를 선택하세요.',
        steps:['오른쪽 위 ⋮ 를 누르세요.','설치 또는 홈 화면에 추가를 선택하세요.','추가된 은혜의말씀을 열어 알림을 켜주세요.']
      };
    }
    return {
      lead:'iPhone에서는 홈 화면에 추가한 은혜의말씀에서 알림을 받을 수 있습니다.',
      steps:['Safari의 공유 버튼을 누르세요.','홈 화면에 추가를 선택하세요.','추가된 은혜의말씀을 열어 알림을 켜주세요.']
    };
  }
  function tryAndroidInstall(){
    if(!deferredInstallPrompt || typeof deferredInstallPrompt.prompt!=='function')return Promise.resolve(false);
    var ev=deferredInstallPrompt;
    deferredInstallPrompt=null;
    return ev.prompt().then(function(){
      return ev.userChoice;
    }).then(function(choice){
      return !!(choice && choice.outcome==='accepted');
    }).catch(function(){return false;});
  }
  function setNotifyText(id, text){
    var el=document.getElementById(id);
    if(!el)return;
    if(text){el.hidden=false;el.textContent=text;}
    else{el.hidden=true;el.textContent='';}
  }
  function setNotifySteps(lines){
    var list=document.getElementById('ghdNotifySteps');
    if(!list)return;
    list.innerHTML='';
    if(!lines||!lines.length){list.hidden=true;return;}
    lines.forEach(function(line){
      var li=document.createElement('li');
      li.textContent=line;
      list.appendChild(li);
    });
    list.hidden=false;
  }
  function setNotifyState(label, kind){
    var el=document.getElementById('ghdNotifyStateLabel');
    if(!el)return;
    el.textContent=label||'';
    el.classList.toggle('is-on', kind==='on');
    el.classList.toggle('is-need', kind==='need');
  }
  function notifyPreviewText(){
    var view=feedView();
    return String((view&&view.body)||'').replace(/^["“]+|["”]+$/g,'').trim();
  }
  function deniedSteps(env){
    if(env.iOS){
      if(env.standalone)return ['설정에서 알림을 선택하세요.','알림 허용을 켜주세요.'];
      return ['설정에서 Safari를 선택하세요.','은혜의말씀 알림을 허용해 주세요.'];
    }
    if(env.android){
      if(env.standalone)return ['설정 → 앱 → 은혜의말씀','알림을 허용해 주세요.'];
      if(env.browser==='chrome'||env.browser==='samsung')return ['브라우저 설정 → 사이트 설정 → 알림','은혜의말씀을 허용해 주세요.'];
      return ['설정 → 앱 → 사용 중인 브라우저','알림을 허용해 주세요.'];
    }
    if(env.mac && env.browser==='safari')return ['Safari 설정 → 웹사이트 → 알림','은혜의말씀을 허용해 주세요.'];
    if(env.browser==='edge')return ['Edge 설정 → 쿠키 및 사이트 권한 → 알림','은혜의말씀을 허용해 주세요.'];
    if(env.browser==='chrome'||env.windows)return ['브라우저 설정 → 사이트 설정 → 알림','은혜의말씀을 허용해 주세요.'];
    return ['브라우저 설정에서 이 사이트의 알림을 허용해 주세요.'];
  }
  function renderNotifyPrefs(subscribed){
    var box=document.getElementById('ghdNotifyPrefs');
    var timeRow=document.getElementById('ghdNotifyTimeRow');
    var firstRow=document.getElementById('ghdNotifyFirstRow');
    var secondRow=document.getElementById('ghdNotifySecondRow');
    var prefs=currentPushPrefs();
    var twice=prefs.frequency===2;
    if(box)box.hidden=!subscribed;
    if(!subscribed)return;
    if(timeRow)timeRow.hidden=twice;
    if(firstRow)firstRow.hidden=!twice;
    if(secondRow)secondRow.hidden=!twice;
    var timeVal=document.getElementById('ghdNotifyTimeValue');
    var firstVal=document.getElementById('ghdNotifyFirstValue');
    var secondVal=document.getElementById('ghdNotifySecondValue');
    var freqVal=document.getElementById('ghdNotifyFreqValue');
    if(timeVal)timeVal.textContent=formatPushClock(prefs.firstTime);
    if(firstVal)firstVal.textContent=formatPushClock(prefs.firstTime);
    if(secondVal)secondVal.textContent=formatPushClock(prefs.secondTime);
    if(freqVal)freqVal.textContent=twice?uiT('home.notify.twice','하루 2회'):uiT('home.notify.once','하루 1회');
    var timeLabel=document.querySelector('#ghdNotifyTimeRow span[data-i18n-key]');
    var firstLabel=document.querySelector('#ghdNotifyFirstRow span[data-i18n-key]');
    var secondLabel=document.querySelector('#ghdNotifySecondRow span[data-i18n-key]');
    var freqLabel=document.querySelector('#ghdNotifyFreqRow span[data-i18n-key]');
    if(timeLabel)timeLabel.textContent=uiT('home.notify.time','알림 시간');
    if(firstLabel)firstLabel.textContent=uiT('home.notify.first','첫 번째 알림');
    if(secondLabel)secondLabel.textContent=uiT('home.notify.second','두 번째 알림');
    if(freqLabel)freqLabel.textContent=uiT('home.notify.frequency','알림 횟수');
  }
  function renderNotifySheet(){
    var env=notifyEnv();
    var state=resolvePushState(env);
    var title=document.getElementById('ghdNotifyTitle');
    var ask=document.getElementById('ghdNotifyAsk');
    var off=document.getElementById('ghdNotifyOff');
    var test=document.getElementById('ghdNotifyTest');
    var verse=document.getElementById('ghdNotifyPreviewVerse');
    var titleEl=document.querySelector('#ghdNotifySheet .ghd-notify-preview-title');
    var refEl=document.getElementById('ghdNotifyPreviewRef');
    var preview=feedView();
    if(verse)verse.textContent=notifyPreviewText();
    if(titleEl)titleEl.textContent=uiT('home.card.todayWord','오늘의 말씀');
    if(refEl)refEl.textContent=displayRef(preview);
    if(title)title.textContent='오늘의 말씀 알림';
    var rowLabel=document.getElementById('ghdNotifyRowLabel');
    if(rowLabel)rowLabel.textContent=uiT('home.notify.autoReceive','매일 자동 수신하기');
    if(ask){ask.hidden=true;ask.textContent='말씀 알림 받기';ask.disabled=false;}
    if(off)off.hidden=true;
    if(test)test.hidden=true;

    if(state==='install-required'){
      var help=installHelpCopy(env);
      setNotifyState('홈 화면 추가 필요','need');
      setNotifyText('ghdNotifyGuideTitle','');
      setNotifyText('ghdNotifyLead', help.lead);
      setNotifySteps(help.steps);
      renderNotifyPrefs(false);
      return env;
    }

    if(state==='permission-denied'){
      setNotifyState('설정 필요','need');
      setNotifyText('ghdNotifyGuideTitle','알림을 켜주세요');
      setNotifyText('ghdNotifyLead','오늘의 말씀을 받으려면 기기 설정에서 알림을 허용해 주세요.');
      setNotifySteps(deniedSteps(env));
      renderNotifyPrefs(false);
      return env;
    }

    if(state==='unsupported'){
      setNotifyState('꺼짐','');
      setNotifyText('ghdNotifyGuideTitle','');
      setNotifyText('ghdNotifyLead','이 브라우저에서는 알림을 사용할 수 없습니다.');
      setNotifySteps([]);
      renderNotifyPrefs(false);
      return env;
    }

    if(state==='subscribed'){
      setPendingPushOptIn(false);
      setNotifyState('켜짐','on');
      setNotifyText('ghdNotifyGuideTitle','말씀 알림이 켜져 있습니다');
      setNotifyText('ghdNotifyLead','매일 오늘의 말씀을 알림으로 받고 있습니다.');
      setNotifySteps([]);
      if(off)off.hidden=false;
      if(test)test.hidden=!isPushDevUi();
      renderNotifyPrefs(true);
      return env;
    }

    if(state==='permission-granted-no-subscription'){
      setNotifyState('꺼짐','');
      setNotifyText('ghdNotifyGuideTitle','알림 연결하기');
      setNotifyText('ghdNotifyLead','알림은 허용되어 있습니다. 매일 수신을 연결해 주세요.');
      setNotifySteps([]);
      if(ask){ask.hidden=false;ask.textContent='알림 연결하기';}
      renderNotifyPrefs(false);
      return env;
    }

    setNotifyState('꺼짐','');
    setNotifyText('ghdNotifyGuideTitle','');
    setNotifyText('ghdNotifyLead','매일 새로운 오늘의 말씀을 알림으로 받아보세요.');
    setNotifySteps([]);
    if(ask){ask.hidden=false;ask.textContent='말씀 알림 받기';}
    renderNotifyPrefs(false);
    return env;
  }
  function refreshPushSubscription(){
    if(!('serviceWorker' in navigator) || !('PushManager' in window)){
      pushSubCache=null;
      pushSubChecked=true;
      return Promise.resolve(null);
    }
    return navigator.serviceWorker.ready.then(function(reg){
      if(!reg.pushManager){pushSubCache=null;pushSubChecked=true;return null;}
      return reg.pushManager.getSubscription();
    }).then(function(sub){
      pushSubCache=sub||null;
      pushSubChecked=true;
      return pushSubCache;
    }).catch(function(){
      pushSubCache=null;
      pushSubChecked=true;
      return null;
    });
  }
  function postPush(kind, payload){
    return fetch(pushApiUrl(kind), {
      method:'POST',
      headers:pushHeaders(),
      body:JSON.stringify(payload||{})
    }).then(function(res){
      return res.json().catch(function(){return {};}).then(function(body){
        if(!res.ok || body.ok===false)throw new Error(body.error||'push-api');
        return body;
      });
    });
  }
  function savePushSubscription(sub, extra){
    var json=sub&&typeof sub.toJSON==='function'?sub.toJSON():sub;
    var prefs=normalizePushPrefs(Object.assign({}, currentPushPrefs(), extra||{}, {
      enabled:true,
      timezone:deviceTimezone(),
      locale:uiLang()
    }));
    return postPush('subscribe', {
      subscription:json,
      locale:prefs.locale,
      timezone:prefs.timezone,
      frequency:prefs.frequency,
      firstTime:prefs.firstTime,
      secondTime:prefs.secondTime,
      sendProbe:/iPhone|iPad|iPod/i.test(navigator.userAgent)
    }).then(function(body){
      if(body&&body.preferences)writePushPrefsCache(Object.assign({}, body.preferences, {enabled:true}));
      else writePushPrefsCache(prefs);
      return body;
    });
  }
  function loadPushPrefs(){
    pushPrefsCache=readPushPrefsCache();
    if(!pushSubCache)return Promise.resolve(pushPrefsCache);
    var json=typeof pushSubCache.toJSON==='function'?pushSubCache.toJSON():pushSubCache;
    return postPush('status', {subscription:json}).then(function(body){
      if(body&&body.preferences){
        var next=Object.assign({}, body.preferences, {enabled:!!body.active, timezone:deviceTimezone(), locale:uiLang()});
        writePushPrefsCache(next);
        if(String(body.preferences.timezone||'')!==next.timezone){
          savePushSubscription(pushSubCache, next).catch(function(){});
        }
      }
      return currentPushPrefs();
    }).catch(function(){return currentPushPrefs();});
  }
  function persistPushPrefs(next){
    var prev=currentPushPrefs();
    var prefs=normalizePushPrefs(next, prev);
    prefs.enabled=true;
    prefs.timezone=deviceTimezone();
    prefs.locale=uiLang();
    setNotifyPrefError('');
    if(!pushSubCache){
      writePushPrefsCache(prefs);
      return Promise.resolve(prefs);
    }
    return savePushSubscription(pushSubCache, prefs).then(function(){
      renderNotifySheet();
      return currentPushPrefs();
    }).catch(function(){
      writePushPrefsCache(prev);
      renderNotifyPrefs(true);
      setNotifyPrefError(uiT('home.notify.saveFail','설정을 저장하지 못했습니다. 다시 시도해 주세요.'));
      return Promise.reject(new Error('save-failed'));
    });
  }
  function openTodayFromPush(){
    if(!root)return;
    closeSheets();
    apply(0, true);
    var card=root.querySelector('.gomna-home-card[data-card="0"]');
    window.setTimeout(function(){if(card)openCard(card, true);}, 80);
  }
  function postPushProbe(extra){
    var env=notifyEnv();
    var payload={
      href:location.href,
      ua:navigator.userAgent,
      platform:navigator.platform,
      standalone:!!env.standalone,
      displayStandalone:false,
      permission:env.permission,
      hasSW:!!env.hasSW,
      hasPush:!!env.hasPush,
      hasController:!!(navigator.serviceWorker&&navigator.serviceWorker.controller),
      state:resolvePushState(env),
      subscribed:!!pushSubCache,
      js:'20260909-push-entry-v1',
      extra:extra||null
    };
    try{payload.displayStandalone=window.matchMedia('(display-mode: standalone)').matches;}catch(e){}
    fetch('/api/push/client-state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).catch(function(){});
  }
  function openNotify(){
    refreshPushSubscription().then(function(){
      return loadPushPrefs();
    }).then(function(){
      renderNotifySheet();
      openSheet('ghdNotifySheet');
      postPushProbe({at:'open'});
    });
  }
  function askNotify(){
    var env=notifyEnv();
    var ask=document.getElementById('ghdNotifyAsk');
    if(ask)ask.disabled=true;
    if(env.needsInstall){
      setPendingPushOptIn(true);
      pushInstallHelpShown=true;
      var finishHelp=function(){
        if(ask)ask.disabled=false;
        renderNotifySheet();
        postPushProbe({at:'install-help', kind:env.kind});
      };
      if(env.kind==='android-browser'){
        tryAndroidInstall().then(function(){finishHelp();});
        return;
      }
      finishHelp();
      return;
    }
    var start=Promise.resolve(env.permission);
    if(env.permission==='default'){
      if(!env.canAsk){
        if(ask)ask.disabled=false;
        renderNotifySheet();
        return;
      }
      start=Notification.requestPermission();
    }
    start.then(function(perm){
      if(perm!=='granted'){
        return refreshPushSubscription();
      }
      var cfg=window.GomnaPushConfig||{};
      var key=cfg.vapidPublicKey||'';
      if(!key)throw new Error('vapid-public-missing');
      return navigator.serviceWorker.ready.then(function(reg){
        return reg.pushManager.getSubscription().then(function(existing){
          if(existing)return existing;
          return reg.pushManager.subscribe({
            userVisibleOnly:true,
            applicationServerKey:urlBase64ToUint8Array(key)
          });
        });
      }).then(function(sub){
        if(!sub)return null;
        pushSubCache=sub;
        return savePushSubscription(sub);
      }).then(function(){
        return refreshPushSubscription();
      });
    }).then(function(){
      renderNotifySheet();
    }).catch(function(err){
      postPushProbe({at:'ask-error', message:String(err&&err.message||err)});
      return refreshPushSubscription().then(function(){renderNotifySheet();});
    }).then(function(){
      if(ask)ask.disabled=false;
      postPushProbe({at:'ask-done', state:resolvePushState()});
    });
  }
  function stopNotify(){
    var off=document.getElementById('ghdNotifyOff');
    if(off)off.disabled=true;
    var sub=pushSubCache;
    var payload=sub&&typeof sub.toJSON==='function'?{subscription:sub.toJSON()}:{endpoint:sub&&sub.endpoint};
    var after=function(){
      pushSubCache=null;
      writePushPrefsCache(Object.assign({}, currentPushPrefs(), {enabled:false}));
      if(off)off.disabled=false;
      renderNotifySheet();
    };
    var localUnsub=function(){
      if(!sub||typeof sub.unsubscribe!=='function')return Promise.resolve();
      return sub.unsubscribe().catch(function(){});
    };
    postPush('unsubscribe', payload).catch(function(){}).then(localUnsub).then(after).catch(after);
  }
  function sendTestNotify(){
    if(!isPushDevUi() || !pushSubCache)return;
    var json=typeof pushSubCache.toJSON==='function'?pushSubCache.toJSON():pushSubCache;
    postPush('send-test', {subscription:json, locale:uiLang()}).catch(function(){});
  }
  var MAIL_KEY='gomna_today_mail_email';
  function mailApiUrl(kind){
    var cfg=window.GomnaMailConfig||{};
    var base='';
    try{base=cfg.apiBase?cfg.apiBase():'';}catch(e){}
    if(!base){
      if(kind==='subscribe')return '/api/mail/subscribe';
      if(kind==='unsubscribe')return '/api/mail/unsubscribe';
      if(kind==='status')return '/api/mail/status';
      return '/api/mail/status';
    }
    if(kind==='subscribe')return base+'/mail-subscribe';
    if(kind==='unsubscribe')return base+'/mail-unsubscribe';
    return base+'/mail-status';
  }
  function mailHeaders(){
    var headers={'Content-Type':'application/json'};
    var cfg=window.GomnaMailConfig||{};
    if(cfg.anonKey)headers.apikey=cfg.anonKey;
    return headers;
  }
  function postMail(kind, payload){
    return fetch(mailApiUrl(kind),{method:'POST',headers:mailHeaders(),body:JSON.stringify(payload||{})}).then(function(res){
      return res.json().catch(function(){return {};}).then(function(body){
        body=body||{};
        body.ok=!!body.ok && res.ok;
        body.status=res.status;
        return body;
      });
    });
  }
  function readMailEmail(){
    try{return String(localStorage.getItem(MAIL_KEY)||'').trim().toLowerCase();}catch(e){return '';}
  }
  function writeMailEmail(email){
    try{
      if(email)localStorage.setItem(MAIL_KEY, email);
      else localStorage.removeItem(MAIL_KEY);
    }catch(e){}
  }
  function mailUserId(){
    try{
      if(window.GomnaAuth&&typeof window.GomnaAuth.getAccount==='function'){
        var a=window.GomnaAuth.getAccount()||{};
        return String(a.id||a.user_id||a.userId||'');
      }
    }catch(e){}
    return '';
  }
  function setMailError(msg){
    var el=document.getElementById('ghdMailError');
    if(!el)return;
    if(msg){el.hidden=false;el.textContent=msg;}
    else {el.hidden=true;el.textContent='';}
  }
  function showMailState(active, email){
    sheetLog('email state 변경', null, {active:!!active, hasEmail:!!email, sheetOpen:mailSheetOpen()});
    sheetLog('renderEmailSheet', null, {kind:'state-only', active:!!active, sheetOpen:mailSheetOpen()});
    var form=document.getElementById('ghdMailForm');
    var on=document.getElementById('ghdMailActive');
    var lead=document.getElementById('ghdMailLead');
    var input=document.getElementById('ghdMailEmail');
    if(lead)lead.textContent=active?'':'매일 새로운 오늘의 말씀을 이메일로 받아보세요.';
    if(form)form.hidden=!!active;
    if(on)on.hidden=!active;
    if(input && email && !input.value)input.value=email;
    setMailError('');
  }
  function openMail(ev){
    sheetLog('openMail 호출', ev||null);
    armSheetDismissLock(ev);
    var saved=readMailEmail();
    var input=document.getElementById('ghdMailEmail');
    if(input && saved && !input.value)input.value=saved;
    showMailState(false, saved);
    openSheet('ghdMailSheet');
    if(!saved)return;
    postMail('status',{email:saved}).then(function(body){
      if(!mailSheetOpen())return;
      if(body&&body.active)showMailState(true, saved);
      else showMailState(false, saved);
    }).catch(function(){
      if(!mailSheetOpen())return;
      showMailState(false, saved);
    });
  }
  function saveMail(){
    var input=document.getElementById('ghdMailEmail');
    var consent=document.getElementById('ghdMailConsent');
    var send=document.getElementById('ghdMailSend');
    var email=String((input&&input.value)||'').trim().toLowerCase();
    if(!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
      setMailError('이메일 주소를 확인해 주세요.');
      return;
    }
    if(!(consent&&consent.checked)){
      setMailError('말씀 이메일 수신 동의가 필요합니다.');
      return;
    }
    setMailError('');
    if(send)send.disabled=true;
    postMail('subscribe',{
      email:email,
      consent:true,
      locale:uiLang(),
      timezone:'Asia/Seoul',
      userId:mailUserId()
    }).then(function(body){
      if(send)send.disabled=false;
      if(!body||!body.ok){
        setMailError('잠시 후 다시 시도해 주세요.');
        return;
      }
      writeMailEmail(email);
      showMailState(true, email);
    }).catch(function(){
      if(send)send.disabled=false;
      setMailError('잠시 후 다시 시도해 주세요.');
    });
  }
  function stopMail(){
    var email=readMailEmail();
    var input=document.getElementById('ghdMailEmail');
    if(!email)email=String((input&&input.value)||'').trim().toLowerCase();
    postMail('unsubscribe',{email:email}).then(function(body){
      if(body&&body.ok){
        writeMailEmail(email);
        showMailState(false, email);
        var consent=document.getElementById('ghdMailConsent');
        if(consent)consent.checked=false;
      }else setMailError('잠시 후 다시 시도해 주세요.');
    }).catch(function(){setMailError('잠시 후 다시 시도해 주세요.');});
  }
  function saveNote(ev){
    if(ev){ev.preventDefault();ev.stopPropagation();}
    var card=cardFromEl(ev&&ev.currentTarget);
    var note=card&&card.querySelector('[data-ghd-note]');
    if(!note)return;
    try{localStorage.setItem(NOTE_KEY+dateKey(), note.value.trim());}catch(e){}
  }
  function bindActions(){
    root.querySelectorAll('[data-ghd-like]').forEach(function(el){el.addEventListener('click', toggleLike);});
    root.querySelectorAll('[data-ghd-comment]').forEach(function(el){el.addEventListener('click', openComments);});
    root.querySelectorAll('[data-ghd-share]').forEach(function(el){el.addEventListener('click', shareCard);});
    root.querySelectorAll('[data-ghd-related]').forEach(function(el){el.addEventListener('click', relatedCard);});
    root.querySelectorAll('[data-ghd-listen]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        openCardReader(cardFromEl(el),'listen');
      });
    });
    root.querySelectorAll('[data-ghd-read]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        openCardReader(cardFromEl(el),'read');
      });
    });
    root.querySelectorAll('[data-ghd-commentary]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        openCardReader(cardFromEl(el),'commentary');
      });
    });
    root.querySelectorAll('[data-ghd-note-save]').forEach(function(el){el.addEventListener('click', saveNote);});
    root.querySelectorAll('[data-ghd-life-chip]').forEach(function(el){
      el.addEventListener('click', function(ev){
        selectLifeTheme(el.getAttribute('data-ghd-life-chip'), ev);
      });
    });
    root.querySelectorAll('[data-ghd-story-chip]').forEach(function(el){
      el.addEventListener('click', function(ev){
        selectStoryPerson(el.getAttribute('data-ghd-story-chip'), ev);
      });
    });
    root.querySelectorAll('[data-ghd-pray]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        focusPrayer(cardFromEl(el));
      });
    });
    root.querySelectorAll('[data-ghd-back]').forEach(function(el){
      el.addEventListener('click', function(ev){
        ev.preventDefault();ev.stopPropagation();
        closeCard(cardFromEl(el), false);
      });
    });
    document.querySelectorAll('[data-ghd-notify]').forEach(function(el){
      if(el.getAttribute('data-ghd-notify-bound')==='1')return;
      el.setAttribute('data-ghd-notify-bound','1');
      el.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        openNotify();
      });
    });
    document.querySelectorAll('[data-ghd-mail]').forEach(function(el){
      if(el.getAttribute('data-ghd-mail-bound')==='1')return;
      el.setAttribute('data-ghd-mail-bound','1');
      function logMailPointer(ev){sheetLog('mail button '+ev.type, ev);}
      el.addEventListener('pointerdown', logMailPointer);
      el.addEventListener('pointerup', logMailPointer);
      el.addEventListener('mousedown', logMailPointer);
      el.addEventListener('mouseup', logMailPointer);
      el.addEventListener('touchstart', logMailPointer, {passive:true});
      el.addEventListener('touchend', logMailPointer, {passive:true});
      el.addEventListener('click', function(ev){
        sheetLog('mail button click', ev);
        ev.preventDefault();
        ev.stopPropagation();
        if(typeof ev.stopImmediatePropagation==='function')ev.stopImmediatePropagation();
        openMail(ev);
      });
    });
    document.querySelectorAll('[data-ghd-sheet-close]').forEach(function(el){
      if(el.getAttribute('data-ghd-close-bound')==='1')return;
      el.setAttribute('data-ghd-close-bound','1');
      el.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        var sheet=el.closest('.ghd-sheet');
        if(sheet && sheet.id)closeSheet(sheet.id, 'button');
        else closeSheets('button');
      });
    });
    document.querySelectorAll('.ghd-sheet').forEach(function(sheet){
      if(sheet.getAttribute('data-ghd-dismiss-bound')==='1')return;
      sheet.setAttribute('data-ghd-dismiss-bound','1');
      var isMail=sheet.id==='ghdMailSheet';
      function mailOnly(name, ev, extra){
        if(isMail)sheetLog(name, ev, extra);
      }
      sheet.addEventListener('pointerdown', function(ev){
        mailOnly('backdrop pointerdown', ev, {isBackdrop:ev.target===sheet});
      });
      sheet.addEventListener('click', function(ev){
        var isBackdrop=ev.target===sheet;
        mailOnly('backdrop click', ev, {isBackdrop:isBackdrop});
        if(!isBackdrop)return;
        if(sheetDismissLocked(ev)){
          mailOnly('backdrop click ignored (open lock)', ev);
          ev.preventDefault();
          ev.stopPropagation();
          return;
        }
        closeSheet(sheet.id, 'backdrop');
      });
      var panel=sheet.querySelector('.ghd-sheet-panel');
      if(!panel)return;
      panel.addEventListener('pointerdown', function(ev){
        mailOnly('sheet pointerdown', ev);
      });
      panel.addEventListener('click', function(ev){
        mailOnly('sheet click', ev);
        ev.stopPropagation();
      });
      var startY=0, dragging=false, moved=false;
      panel.addEventListener('pointerdown', function(ev){
        if(desktopSheetUi())return;
        if(ev.pointerType==='mouse')return;
        if(ev.target && ev.target.closest && ev.target.closest('input,textarea,button,a,label,select'))return;
        startY=ev.clientY;
        dragging=true;
        moved=false;
      });
      panel.addEventListener('pointermove', function(ev){
        if(!dragging)return;
        if(Math.abs(ev.clientY-startY)>12)moved=true;
      });
      panel.addEventListener('pointerup', function(ev){
        if(!dragging)return;
        dragging=false;
        var deltaY=ev.clientY-startY;
        mailOnly('drag/swipe close 판정', ev, {startY:startY, currentY:ev.clientY, deltaY:deltaY, moved:moved, threshold:72});
        if(!moved || deltaY<=72)return;
        if(sheetDismissLocked(ev)){
          mailOnly('drag close ignored (open lock)', ev, {deltaY:deltaY});
          return;
        }
        closeSheet(sheet.id, 'drag');
      });
      panel.addEventListener('pointercancel', function(){dragging=false;});
    });
    var ask=document.getElementById('ghdNotifyAsk');
    if(ask)ask.addEventListener('click', askNotify);
    var off=document.getElementById('ghdNotifyOff');
    if(off)off.addEventListener('click', stopNotify);
    var test=document.getElementById('ghdNotifyTest');
    if(test)test.addEventListener('click', sendTestNotify);
    function openNotifyTimeSheet(slot){
      notifyTimeSlot=slot==='second'?'second':'first';
      var prefs=currentPushPrefs();
      var current=notifyTimeSlot==='second'?prefs.secondTime:prefs.firstTime;
      var api=pushPrefsApi();
      var title=document.getElementById('ghdNotifyTimeTitle');
      var lead=document.getElementById('ghdNotifyTimeLead');
      if(title)title.textContent=uiT('home.notify.time','알림 시간');
      if(lead)lead.textContent=uiT('home.notify.timeLead','언제 오늘의 말씀을 받아볼까요?');
      document.querySelectorAll('#ghdNotifyTimeSheet [data-ghd-time]').forEach(function(btn){
        var val=btn.getAttribute('data-ghd-time');
        var preset=api.isPreset?api.isPreset(current):false;
        var on=val==='custom'? !preset : val===current;
        btn.classList.toggle('is-on', !!on);
        var label=btn.querySelector('.ghd-notify-option-label');
        if(val==='custom' && label)label.textContent=uiT('home.notify.customTime','직접 선택');
        else if(val!=='custom' && label)label.textContent=formatPushClock(val);
        var rec=btn.querySelector('.ghd-notify-option-rec');
        if(rec)rec.textContent=uiT('home.notify.recommended','추천');
      });
      var wrap=document.getElementById('ghdNotifyTimeCustomWrap');
      var input=document.getElementById('ghdNotifyTimeCustom');
      var custom=!(api.isPreset && api.isPreset(current));
      if(wrap)wrap.hidden=!custom;
      if(input)input.value=current;
      openSheet('ghdNotifyTimeSheet');
    }
    function applyNotifyTime(hhmm){
      var prefs=currentPushPrefs();
      var next=Object.assign({}, prefs);
      if(notifyTimeSlot==='second')next.secondTime=hhmm;
      else next.firstTime=hhmm;
      persistPushPrefs(next).then(function(){
        closeSheet('ghdNotifyTimeSheet','button');
      }).catch(function(){});
    }
    function openNotifyFreqSheet(){
      var prefs=currentPushPrefs();
      var title=document.getElementById('ghdNotifyFreqTitle');
      if(title)title.textContent=uiT('home.notify.frequency','알림 횟수');
      document.querySelectorAll('#ghdNotifyFreqSheet [data-ghd-freq]').forEach(function(btn){
        var n=Number(btn.getAttribute('data-ghd-freq'));
        btn.classList.toggle('is-on', n===prefs.frequency);
        var label=btn.querySelector('.ghd-notify-option-label');
        if(n===1 && label)label.textContent=uiT('home.notify.once','하루 1회');
        if(n===2 && label)label.textContent=uiT('home.notify.twice','하루 2회');
        var rec=btn.querySelector('.ghd-notify-option-rec');
        if(rec)rec.textContent=uiT('home.notify.recommended','추천');
      });
      openSheet('ghdNotifyFreqSheet');
    }
    document.querySelectorAll('[data-ghd-notify-pref]').forEach(function(el){
      if(el.getAttribute('data-ghd-pref-bound')==='1')return;
      el.setAttribute('data-ghd-pref-bound','1');
      el.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        var kind=el.getAttribute('data-ghd-notify-pref');
        if(kind==='freq')openNotifyFreqSheet();
        else if(kind==='second')openNotifyTimeSheet('second');
        else openNotifyTimeSheet('first');
      });
    });
    document.querySelectorAll('#ghdNotifyTimeSheet [data-ghd-time]').forEach(function(el){
      if(el.getAttribute('data-ghd-time-bound')==='1')return;
      el.setAttribute('data-ghd-time-bound','1');
      el.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        var val=el.getAttribute('data-ghd-time');
        if(val==='custom'){
          var wrap=document.getElementById('ghdNotifyTimeCustomWrap');
          var input=document.getElementById('ghdNotifyTimeCustom');
          if(wrap)wrap.hidden=false;
          document.querySelectorAll('#ghdNotifyTimeSheet [data-ghd-time]').forEach(function(btn){
            btn.classList.toggle('is-on', btn.getAttribute('data-ghd-time')==='custom');
          });
          if(input){
            if(!input.value)input.value=currentPushPrefs().firstTime;
            try{input.focus();input.showPicker&&input.showPicker();}catch(err){}
          }
          return;
        }
        applyNotifyTime(val);
      });
    });
    var timeCustom=document.getElementById('ghdNotifyTimeCustom');
    if(timeCustom && timeCustom.getAttribute('data-ghd-time-bound')!=='1'){
      timeCustom.setAttribute('data-ghd-time-bound','1');
      timeCustom.addEventListener('change', function(){
        if(timeCustom.value)applyNotifyTime(timeCustom.value);
      });
    }
    document.querySelectorAll('#ghdNotifyFreqSheet [data-ghd-freq]').forEach(function(el){
      if(el.getAttribute('data-ghd-freq-bound')==='1')return;
      el.setAttribute('data-ghd-freq-bound','1');
      el.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        persistPushPrefs(Object.assign({}, currentPushPrefs(), {frequency:Number(el.getAttribute('data-ghd-freq'))})).then(function(){
          closeSheet('ghdNotifyFreqSheet','button');
        }).catch(function(){});
      });
    });
    var mailSend=document.getElementById('ghdMailSend');
    if(mailSend)mailSend.addEventListener('click', saveMail);
    var mailOff=document.getElementById('ghdMailOff');
    if(mailOff)mailOff.addEventListener('click', stopMail);
    var mailEmail=document.getElementById('ghdMailEmail');
    if(mailEmail)mailEmail.addEventListener('keydown', function(ev){if(ev.key==='Enter'){ev.preventDefault();saveMail();}});
    var commentSave=document.getElementById('ghdCommentSave');
    if(commentSave)commentSave.addEventListener('click', saveComment);
    var commentInput=document.getElementById('ghdCommentInput');
    if(commentInput)commentInput.addEventListener('keydown', function(ev){if(ev.key==='Enter'){ev.preventDefault();saveComment();}});
    var shareGo=document.getElementById('ghdShareGo');
    if(shareGo)shareGo.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      sendShare();
    });
    var commentList=document.getElementById('ghdCommentList');
    if(commentList && commentList.getAttribute('data-ghd-comment-bound')!=='1'){
      commentList.setAttribute('data-ghd-comment-bound','1');
      commentList.addEventListener('click', function(ev){
        var btn=ev.target&&ev.target.closest?ev.target.closest('[data-ghd-comment-del]'):null;
        if(!btn)return;
        ev.preventDefault();
        ev.stopPropagation();
        deleteComment(btn.getAttribute('data-ghd-comment-del'));
      });
    }
    document.querySelectorAll('[data-ghd-walk]').forEach(function(el){
      el.addEventListener('click', function(){
        var act=el.getAttribute('data-ghd-walk');
        if(act==='read')openCardReader(cards[0],'read');
        else if(act==='commentary')openCardReader(cards[0],'commentary');
        else if(act==='listen')openCardReader(cards[0],'listen');
        else if(act==='respond'){
          var dest=root.offsetTop + 2*stepH();
          window.scrollTo({top:dest, behavior:reduce?'auto':'smooth'});
          window.setTimeout(function(){openCard(cards[2]);}, reduce?0:420);
        }
      });
    });
    var media=document.getElementById('gomnaHomeMedia');
    if(media)media.addEventListener('click', openViewer);
    var viewerClose=document.getElementById('gomnaHomeViewerClose');
    if(viewerClose)viewerClose.addEventListener('click', function(){closeViewer(false);});
    document.querySelectorAll('[data-ghd-nav]').forEach(function(el){
      el.addEventListener('click', function(ev){
        var act=el.getAttribute('data-ghd-nav');
        if(act==='find')return;
        ev.preventDefault();
        if(act==='home')resetHomeToFirstCard();
        else if(act==='bible')openHomeBiblePicker();
        else if(act==='media'){
          window.scrollTo({top:0, behavior:reduce?'auto':'smooth'});
        }else if(act==='me' && typeof handleHomeAccountBtn==='function')handleHomeAccountBtn();
      });
    });
  }
  function openViewer(){
    var v=document.getElementById('gomnaHomeViewer');
    if(!v||v.classList.contains('is-open'))return;
    v.hidden=false;
    v.classList.add('is-open');
    document.documentElement.classList.add('gomna-home-viewer-open');
    try{history.pushState({ghd:'viewer'}, '');}catch(e){}
  }
  function closeViewer(skipHistory){
    var v=document.getElementById('gomnaHomeViewer');
    if(!v||!v.classList.contains('is-open'))return;
    v.classList.remove('is-open');
    v.hidden=true;
    document.documentElement.classList.remove('gomna-home-viewer-open');
    if(!skipHistory && history.state && history.state.ghd==='viewer'){
      try{history.back();}catch(e){}
    }
  }
  function ensureHomeBiblePicker(){
    var overlay=document.getElementById('homeBiblePickerOverlay');
    var frame;
    if(overlay)return overlay;
    overlay=document.createElement('div');
    overlay.id='homeBiblePickerOverlay';
    overlay.hidden=true;
    overlay.setAttribute('aria-hidden','true');
    frame=document.createElement('iframe');
    frame.id='homeBiblePickerFrame';
    frame.title='성경 선택';
    frame.setAttribute('allowtransparency','true');
    frame.src='reader.html?source=home-bible-picker';
    overlay.appendChild(frame);
    document.body.appendChild(overlay);
    return overlay;
  }
  function preloadHomeBiblePicker(){
    ensureHomeBiblePicker();
  }
  function markHomeBiblePickerReady(){
    var overlay=document.getElementById('homeBiblePickerOverlay');
    if(!overlay)return;
    overlay.setAttribute('data-ready','1');
    overlay.classList.add('is-ready');
    overlay.classList.remove('is-loading');
  }
  function tellHomeBiblePicker(action){
    var frame=document.getElementById('homeBiblePickerFrame');
    try{
      if(frame&&frame.contentWindow){
        frame.contentWindow.postMessage({source:'gomna-home-bible-picker',action:action},location.origin);
      }
    }catch(e){ /* ignore */ }
  }
  function openHomeBiblePicker(){
    var overlay=ensureHomeBiblePicker();
    overlay.hidden=false;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden','false');
    document.documentElement.classList.add('home-bible-picker-open');
    if(overlay.getAttribute('data-ready')==='1'){
      overlay.classList.add('is-ready');
      overlay.classList.remove('is-loading');
      tellHomeBiblePicker('open');
    }else{
      overlay.classList.add('is-loading');
      overlay.classList.remove('is-ready');
    }
    try{
      if(!(history.state&&history.state.ghd==='bible-picker')){
        history.pushState({ghd:'bible-picker'},'');
      }
    }catch(e){}
  }
  function closeHomeBiblePicker(skipHistory){
    var overlay=document.getElementById('homeBiblePickerOverlay');
    if(!overlay||overlay.hidden){
      document.documentElement.classList.remove('home-bible-picker-open');
      return;
    }
    overlay.hidden=true;
    overlay.classList.remove('is-open','is-loading');
    overlay.setAttribute('aria-hidden','true');
    document.documentElement.classList.remove('home-bible-picker-open');
    tellHomeBiblePicker('close-ui');
    if(!skipHistory && history.state && history.state.ghd==='bible-picker'){
      try{history.back();}catch(e){}
    }
  }
  function init(){
    root=document.getElementById('gomnaHomeFeed');
    stage=document.getElementById('gomnaHomeFeedStage');
    if(!root||!stage||root.getAttribute('data-ghd-bound')==='1')return;
    root.setAttribute('data-ghd-bound','1');
    document.body.classList.add('gomna-home-deck-on');
    hideLegacyHome();
    reduce=reduced();
    cards=Array.prototype.slice.call(root.querySelectorAll('.gomna-home-card[data-ghd-deck="home"]'));
    count=3;
    var restoreEntry=readHomeRestoreEntry();
    if(restoreEntry&&restoreEntry.kind==='life')lifeThemeId=restoreEntry.id;
    if(restoreEntry&&restoreEntry.kind==='person')storyPersonId=restoreEntry.id;
    fillCopy();
    syncGreeting();
    cards.forEach(bindCard);
    bindActions();
    (function scheduleSocialRefresh(n){
      if(socialClient()){refreshSocial();return;}
      if(n>25)return;
      window.setTimeout(function(){scheduleSocialRefresh(n+1);}, 200);
    })(0);
    pushPrefsCache=readPushPrefsCache();
    if(!window.__gomnaPushInstallBound){
      window.__gomnaPushInstallBound=true;
      window.addEventListener('beforeinstallprompt', function(ev){
        ev.preventDefault();
        deferredInstallPrompt=ev;
      });
      window.addEventListener('appinstalled', function(){
        deferredInstallPrompt=null;
        setPendingPushOptIn(true);
      });
    }
    refreshPushSubscription().then(function(){
      var env=detectPushEnvironment();
      if(readPendingPushOptIn() && (env.kind==='ios-pwa' || env.kind==='android-pwa')){
        window.setTimeout(function(){openNotify();}, 480);
      }
    });
    if(navigator.serviceWorker){
      navigator.serviceWorker.addEventListener('message', function(ev){
        if(!ev.data || ev.data.type!=='gomna-open-today')return;
        openTodayFromPush();
      });
    }
    syncStepSize();
    var verseFace=root.querySelector('.gomna-home-card[data-card="0"] .gomna-home-card-face[data-face="tease"]');
    if(verseFace&&typeof ResizeObserver==='function'){
      try{new ResizeObserver(function(){placeTodayVerseBlock();}).observe(verseFace);}catch(e){}
    }
    if(document.fonts&&document.fonts.ready){
      document.fonts.ready.then(function(){schedulePlaceTodayVerse();}).catch(function(){});
    }
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', schedulePlaceTodayVerse, {passive:true});
    }
    if(restoreEntry){
      restoreHomeEntry(restoreEntry);
      window.requestAnimationFrame(function(){syncStepSize();});
    }else{
      apply(0, true);
      window.requestAnimationFrame(function(){syncStepSize();apply(progressFromScroll(), true);});
    }
    bindDeckSwipe();
    root.addEventListener('scroll', onScroll, {passive:true});
    root.addEventListener('touchstart', markGestureStart, {passive:true});
    root.addEventListener('touchend', markGestureEnd, {passive:true});
    root.addEventListener('touchcancel', markGestureEnd, {passive:true});
    root.addEventListener('pointerdown', markGestureStart, {passive:true});
    root.addEventListener('pointerup', markGestureEnd, {passive:true});
    root.addEventListener('pointercancel', markGestureEnd, {passive:true});
    root.addEventListener('wheel', onDeckWheel, {passive:true});
    window.addEventListener('scroll', onScroll, {passive:true});
    window.addEventListener('resize', function(){syncStepSize();apply(progressFromScroll(), true);schedulePlaceTodayVerse();}, {passive:true});
    window.addEventListener('keydown', function(ev){
      if(ev.key==='Escape'){
        closeHomeBiblePicker(false);
        closeViewer(false);
        var nested=document.getElementById('ghdNotifyTimeSheet');
        if(nested && nested.classList.contains('is-open')){closeSheet('ghdNotifyTimeSheet','button');return;}
        nested=document.getElementById('ghdNotifyFreqSheet');
        if(nested && nested.classList.contains('is-open')){closeSheet('ghdNotifyFreqSheet','button');return;}
        var open=root.querySelector('.gomna-home-card.is-open');
        if(open)closeCard(open, false);
        closeSheets();
      }
    });
    window.addEventListener('popstate', function(){
      closeHomeBiblePicker(true);
      closeViewer(true);
      var open=root.querySelector('.gomna-home-card.is-open');
      if(open)closeCard(open, true);
      closeSheets();
    });
    window.addEventListener('message', function(ev){
      var data=ev.data;
      if(ev.origin!==location.origin)return;
      if(!data||data.source!=='gomna-home-bible-picker')return;
      if(data.action==='ready')markHomeBiblePickerReady();
      if(data.action==='close')closeHomeBiblePicker(false);
    });
    window.setTimeout(preloadHomeBiblePicker, 280);
    if('requestIdleCallback' in window)window.requestIdleCallback(function(){preloadLifeThemeImages();preloadStoryPersonImages();},{timeout:1200});
    else window.setTimeout(function(){preloadLifeThemeImages();preloadStoryPersonImages();}, 480);
    var prev=window.__gomnaOnLangApplied;
    window.__gomnaOnLangApplied=function(){
      if(typeof prev==='function')try{prev();}catch(e){}
      fillCopy();
    };
    window.addEventListener('gomna:ui-language-changed', function(){
      fillCopy();
    });
  }

  window.GomnaHomeFeed={init:init,sync:fillCopy,syncSocial:syncSocial,refreshSocial:refreshSocial,syncGreeting:syncGreeting};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded', init);
  else init();
})();
