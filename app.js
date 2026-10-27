/* ---------- storage ---------- */
const KEY="hanzi-practice-v1";
let S={sel:["words"],box:{},cbox:{},hist:[],days:[],log:{},front:"han",order:"weak",hk:true,autoSay:false,corder:"weak"};
try{const r=localStorage.getItem(KEY);if(r)S=Object.assign(S,JSON.parse(r))}catch(e){}
function save(){try{localStorage.setItem(KEY,JSON.stringify(S))}catch(e){}}
const box=c=>S.box[c.id]||0;
const cbox=ch=>S.cbox[ch]||0;
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const HAN=/\p{Script=Han}/u;
const hanChars=s=>[...s].filter(ch=>HAN.test(ch));
const css=v=>getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/* ---------- daily streak ---------- */
const today=()=>{const d=new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")};
function markDay(){const t=today();if(!S.days.includes(t)){S.days.push(t);S.days=S.days.slice(-400);renderStreak()}}
function streak(){const set=new Set(S.days);let n=0;const d=new Date();
  if(!set.has(today()))d.setDate(d.getDate()-1);
  for(;;){const k=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");if(!set.has(k))break;n++;d.setDate(d.getDate()-1)}
  return n}
function renderStreak(){const n=streak();$("streak").hidden=n<1;$("streak").textContent=`${n}-day streak`}
// Counts study actions per day for the weekly activity chart.
function bump(n=1){const t=today();S.log[t]=(S.log[t]||0)+n;markDay()}
function gradeCard(c,ok){S.box[c.id]=ok?Math.min(box(c)+1,5):0;bump();save()}

/* ---------- speech ---------- */
let zhVoice=null,enVoice=null;
const canSpeak=()=>"speechSynthesis" in window;
function pickVoice(){try{const v=speechSynthesis.getVoices();
  zhVoice=v.find(x=>/^zh(-|_)?CN/i.test(x.lang)&&/premium|enhanced/i.test(x.name))||v.find(x=>/^zh(-|_)?CN/i.test(x.lang))||v.find(x=>/^zh/i.test(x.lang))||null;
  enVoice=v.find(x=>/^en(-|_)?US/i.test(x.lang)&&x.localService)||v.find(x=>/^en/i.test(x.lang))||null;
  const n=$("voiceNote");if(n)n.textContent=zhVoice?`Voice: ${zhVoice.name}`:"No Chinese voice found. On iPhone: Settings › Accessibility › Spoken Content › Voices › Chinese.";
}catch(e){}}
if(canSpeak()){pickVoice();try{speechSynthesis.onvoiceschanged=pickVoice}catch(e){}}
// Resolves when the utterance ends. The timeout covers browsers that never fire onend.
function speak(text,lang="zh-CN",rate=.8){return new Promise(res=>{
  if(!canSpeak())return res();
  let done=false;const fin=()=>{if(!done){done=true;clearTimeout(to);res()}};
  const zh=lang.startsWith("zh");
  const to=setTimeout(fin,1500+text.length*(zh?420:90)/rate);
  try{const u=new SpeechSynthesisUtterance(text);u.lang=lang;const v=zh?zhVoice:enVoice;if(v)u.voice=v;u.rate=rate;
    u.onend=fin;u.onerror=fin;speechSynthesis.speak(u)}catch(e){fin()}})}
function say(t){if(!canSpeak())return;try{speechSynthesis.cancel()}catch(e){}speak(t)}
if(!canSpeak())document.querySelectorAll(".listenOnly").forEach(x=>x.hidden=true);

/* ---------- decks ---------- */
function pool(){return D.filter(c=>S.sel.includes(c.deck))}
function renderDecks(){
  $("decks").innerHTML=Object.entries(DECKS).map(([k,v])=>`<button class="chip" aria-pressed="${S.sel.includes(k)}" data-deck="${k}">${v}<span class="n">${D.filter(c=>c.deck===k).length}</span></button>`).join("");
  requestAnimationFrame(deckEdges);
}
$("decks").addEventListener("click",e=>{const b=e.target.closest("[data-deck]");if(!b)return;const k=b.dataset.deck;
  if(S.sel.includes(k)){if(S.sel.length>1)S.sel=S.sel.filter(x=>x!==k)}else S.sel.push(k);
  save();renderDecks();buildQueue();buildChars()});
function deckEdges(){const d=$("decks"),w=$("deckscroll");
  w.classList.toggle("more-l",d.scrollLeft>2);w.classList.toggle("more-r",d.scrollLeft+d.clientWidth<d.scrollWidth-2)}
$("decks").addEventListener("scroll",deckEdges,{passive:true});
addEventListener("resize",deckEdges);
// A vertical mouse wheel scrolls the row sideways on desktop.
$("decks").addEventListener("wheel",e=>{const d=$("decks");if(Math.abs(e.deltaY)<=Math.abs(e.deltaX)||d.scrollWidth<=d.clientWidth)return;
  e.preventDefault();d.scrollLeft+=e.deltaY},{passive:false});
$("deckL").onclick=()=>$("decks").scrollBy({left:-$("decks").clientWidth*.7});
$("deckR").onclick=()=>$("decks").scrollBy({left:$("decks").clientWidth*.7});

/* ---------- flashcards ---------- */
let Q=[],qi=0;
function buildQueue(){
  let p=pool();
  if(S.order==="shuffle")p=shuffle(p);
  else if(S.order==="weak")p=shuffle(p).sort((a,b)=>box(a)-box(b));
  Q=p;qi=0;showCard();
}
function boxes(c){return `<span class="boxes" title="Correct in a row">${[0,1,2].map(i=>`<span class="${box(c)>i?"on":""}"></span>`).join("")}</span>`}
function hanHtml(c){return `<div class="han${c.hz.length>10?" long xlong":c.hz.length>4?" long":""}">${esc(c.hz)}</div>`}
function showCard(){
  const card=$("card");card.classList.remove("flipped");
  const c=Q[qi];if(!c)return;
  const corner=`<div class="corner"><span>${DECKS[c.deck]}</span>${boxes(c)}</div>`;
  const sp=canSpeak()?`<button class="speak" data-say="${esc(c.hz)}" aria-label="Hear it">🔊</button>`:"";
  const hk=S.hk&&c.hk?`<div class="hk">Hokkien · ${esc(c.hk)}</div>`:"";
  const exSp=canSpeak()&&c.ex?`<button class="exsay" data-say="${esc(c.ex[0])}" aria-label="Hear the sentence">🔊 Hear sentence</button>`:"";
  const ex=c.ex?`<div class="ex"><div class="h">${esc(c.ex[0])}</div>${exSp}<div class="p">${esc(c.ex[1])}</div><div class="e">${esc(c.ex[2])}</div></div>`:"";
  const trd=c.tr?`<div class="hk" style="background:none;padding:0;color:var(--muted)">Traditional · <span style="font-family:var(--f-han)">${esc(c.tr)}</span></div>`:"";
  const full=`${hanHtml(c)}${trd}<div class="py">${esc(c.py)}</div><div class="en">${esc(c.en)}</div>${hk}${ex}`;
  let front,hint;
  if(S.front==="en"){front=`<div class="en">${esc(c.en)}</div>`;hint="Tap to see the Chinese"}
  else if(S.front==="hanonly"){front=hanHtml(c);hint="Say it out loud, then tap"}
  else{front=`${hanHtml(c)}<div class="py">${esc(c.py)}</div>`;hint="Tap to see the meaning"}
  $("ff").innerHTML=`${corner}<div class="fc">${front}</div><div class="hint">${hint}</div>${S.front==="en"?"":sp}`;
  $("fb").innerHTML=`${corner}<div class="fc">${full}</div>${sp}`;
  fitCard();
  const m=Q.filter(x=>box(x)>=3).length;
  $("pos").textContent=`Card ${qi+1} of ${Q.length} · ${m} mastered`;
  $("pbar").style.width=(Q.length?m/Q.length*100:0)+"%";
  if(S.autoSay&&view==="cards"&&S.front!=="en")say(c.hz);
}
// Grow the card so the busier face fits inside its padding; past the cap the face scrolls instead of clipping.
function fitCard(){const card=$("card");card.style.height="";
  const min=parseFloat(getComputedStyle(card).height),cap=Math.max(min,innerHeight*.7);
  const need=Math.max(...[$("ff"),$("fb")].map(f=>{const cs=getComputedStyle(f);
    return f.querySelector(".fc").scrollHeight+parseFloat(cs.paddingTop)+parseFloat(cs.paddingBottom)+2}));
  if(need>min)card.style.height=Math.min(need,cap)+"px"}
addEventListener("resize",()=>{if(view==="cards")fitCard()});
if(document.fonts)document.fonts.ready.then(()=>{if(view==="cards")fitCard()});
function flip(){const card=$("card");card.classList.toggle("flipped");
  if(S.autoSay&&S.front==="en"&&card.classList.contains("flipped")&&Q[qi])say(Q[qi].hz)}
function move(d){qi=(qi+d+Q.length)%Q.length;showCard()}
function grade(ok){const c=Q[qi];gradeCard(c,ok);
  if(!ok){const [x]=Q.splice(qi,1);Q.splice(Math.min(qi+3,Q.length),0,x)}else qi++;
  if(qi>=Q.length)qi=0;showCard()}
let swiped=0;
$("card").addEventListener("click",e=>{if(Date.now()-swiped<400)return;const s=e.target.closest("[data-say]");if(s){e.stopPropagation();say(s.dataset.say);return}flip()});
let tx=null;
$("card").addEventListener("touchstart",e=>{const t=e.touches[0];tx=[t.clientX,t.clientY]},{passive:true});
$("card").addEventListener("touchend",e=>{if(!tx)return;const t=e.changedTouches[0];const dx=t.clientX-tx[0],dy=t.clientY-tx[1];tx=null;
  if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){swiped=Date.now();move(dx<0?1:-1)}});
$("again").onclick=()=>grade(false);$("got").onclick=()=>grade(true);
$("prev").onclick=()=>move(-1);$("next").onclick=()=>move(1);
$("front").value=S.front;$("order").value=S.order;$("showHk").checked=S.hk;$("autoSay").checked=S.autoSay;
$("front").onchange=e=>{S.front=e.target.value;save();showCard()};
$("order").onchange=e=>{S.order=e.target.value;save();buildQueue()};
$("showHk").onchange=e=>{S.hk=e.target.checked;save();showCard()};
$("autoSay").onchange=e=>{S.autoSay=e.target.checked;save();if(S.autoSay&&Q[qi])say(Q[qi].hz)};
document.addEventListener("keydown",e=>{
  if(view!=="cards"||e.target.matches("input,select,textarea"))return;
  if(e.key===" "){e.preventDefault();flip()}
  else if(e.key==="ArrowRight")move(1);else if(e.key==="ArrowLeft")move(-1);
  else if(e.key==="1")grade(false);else if(e.key==="2")grade(true);
});

/* ---------- pinyin helpers ---------- */
const TONES={a:"āáǎà",e:"ēéěè",i:"īíǐì",o:"ōóǒò",u:"ūúǔù",ü:"ǖǘǚǜ"};
const MARK={};for(const[v,s]of Object.entries(TONES))[...s].forEach((ch,i)=>MARK[ch]=[v,i+1]);
function toneSeq(s){return [...s].map(ch=>MARK[ch]?MARK[ch][1]:null).filter(Boolean)}
function bare(s){return [...s.toLowerCase()].map(ch=>MARK[ch]?MARK[ch][0]:ch).join("").replace(/ü|v/g,"u").replace(/[^a-z]/g,"")}
function retone(s,tones){let k=0;return [...s].map(ch=>{if(MARK[ch]){const[v]=MARK[ch];const t=tones[k++];return TONES[v][t-1]}return ch}).join("")}
function toneVariants(py,n){const seq=toneSeq(py),out=new Set();let guard=0;
  while(out.size<n&&guard++<60){const t=seq.map(x=>Math.random()<.6?((x+Math.floor(Math.random()*3))%4)+1:x);
    if(t.join()!==seq.join())out.add(retone(py,t))}return [...out]}
function checkTyped(input,py){
  const inp=input.trim().toLowerCase();if(!inp)return 0;
  if(bare(inp)!==bare(py))return 0;
  const want=toneSeq(py);
  let got=toneSeq(inp);
  if(!got.length){got=(inp.match(/[1-5]/g)||[]).map(Number).filter(x=>x<5)}
  if(!got.length)return .5;
  return got.join()===want.join()?1:.5;
}

/* ---------- stroke writer ---------- */
const hasWriter=()=>typeof HanziWriter!=="undefined";
function makeWriter(el,ch,opts={}){
  el.innerHTML="";const size=el.clientWidth||260;
  return HanziWriter.create(el,ch,Object.assign({width:size,height:size,padding:size*.06,
    strokeColor:css("--ink"),radicalColor:css("--jade"),outlineColor:css("--line"),drawingColor:css("--seal"),
    highlightColor:css("--gold"),drawingWidth:Math.max(16,size/14),strokeAnimationSpeed:1.1,delayBetweenStrokes:220,
    onLoadCharDataError:()=>{el.innerHTML=`<div class="fallback">${esc(ch)}</div>`;const st=$("wstatus");if(st)st.textContent="Stroke data needs an internet connection the first time."}},opts));
}

/* ---------- test ---------- */
let T=null;
function renderHist(){$("hist").innerHTML=S.hist.length?S.hist.slice(-8).reverse().map(h=>`<span>${h.score}/${h.n} · ${h.d}</span>`).join(""):"<span>No tests yet</span>"}
function distract(c,n,key){const same=pool().filter(x=>x.id!==c.id&&x[key]!==c[key]);
  const close=same.filter(x=>x.deck===c.deck);return shuffle(close.length>=n?close:same).slice(0,n)}
function makeQ(c,type){
  if(type==="pinyin"){const tv=toneVariants(c.py,2);const others=distract(c,3,"py").map(x=>x.py);
    const opts=shuffle([c.py,...shuffle([...tv,...others]).filter(x=>x!==c.py).slice(0,3)]);return{c,type,opts,ans:c.py}}
  if(type==="reverse"){const opts=shuffle([c,...distract(c,3,"hz")]).map(x=>x.hz);return{c,type,opts,ans:c.hz}}
  if(type==="listen"){const opts=shuffle([c,...distract(c,3,"hz")]).map(x=>x.hz);return{c,type,opts,ans:c.hz}}
  if(type==="type")return{c,type};
  if(type==="write"){const hs=hanChars(c.hz);return{c,type,ch:hs[Math.random()*hs.length|0]}}
  const opts=shuffle([c,...distract(c,3,"en")]).map(x=>x.en);return{c,type:type==="pymean"?"pymean":"meaning",opts,ans:c.en};
}
$("startTest").onclick=()=>{
  const types=[...document.querySelectorAll('input[name=qt]:checked')].map(x=>x.value);
  if(!types.length){$("startTest").textContent="Pick a question type";setTimeout(()=>$("startTest").textContent="Start test",1500);return}
  const p=pool();const n=$("qcount").value==="all"?p.length:Math.min(+$("qcount").value,p.length*types.length);
  const weighted=shuffle(p).sort((a,b)=>box(a)-box(b));
  const items=[];for(let i=0;i<n;i++){const c=weighted[i%weighted.length];
    let t=types[i%types.length];
    if(t==="type"&&c.deck==="sent")t="meaning";
    if(t==="write"&&(!hasWriter()||hanChars(c.hz).length>4))t="meaning";
    items.push(makeQ(c,t))}
  T={items:shuffle(items),i:0,score:0,miss:[]};
  $("testSetup").hidden=true;$("testDone").hidden=true;$("testRun").hidden=false;askQ();
};
function askQ(){
  const q=T.items[T.i],c=q.c;$("fbk").textContent="";$("fbk").className="feedback";$("nextQ").hidden=true;
  $("qpos").textContent=`Question ${T.i+1} of ${T.items.length}`;$("tbar").style.width=(T.i/T.items.length*100)+"%";
  let qh="",ah="";
  if(q.type==="meaning"){qh=`<div class="ask">What does this mean?</div>${hanHtml(c)}<div class="py" id="pyHint" hidden>${esc(c.py)}</div><button class="ghost" id="showPy">Show pinyin</button>`;ah=opts(q,"")}
  if(q.type==="pymean"){qh=`<div class="ask">Read the pinyin. What does it mean?</div><div class="py pybig">${esc(c.py)}</div>${canSpeak()?`<button class="ghost" data-say="${esc(c.hz)}">🔊 Hear it</button>`:""}`;ah=opts(q,"")}
  if(q.type==="reverse"){qh=`<div class="ask">Which is the Chinese for…</div><div class="en">${esc(c.en)}</div>`;ah=opts(q,"hanopt")}
  if(q.type==="pinyin"){qh=`<div class="ask">How do you say it? Watch the tones.</div>${hanHtml(c)}<div class="ask">${esc(c.en)}</div>`;ah=opts(q,"pyopt")}
  if(q.type==="listen"){qh=`<div class="ask">Listen and pick the word</div><button class="btn primary" data-say="${esc(c.hz)}">🔊 Play again</button>`;ah=opts(q,"hanopt");setTimeout(()=>say(c.hz),250)}
  if(q.type==="type"){qh=`<div class="ask">Type the pinyin. Tone marks or numbers both work (ni3 hao3).</div>${hanHtml(c)}<div class="ask">${esc(c.en)}</div>`;
    ah=`<form class="typein" id="tform"><input type="text" id="tin" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. hao3"><button class="btn primary">Check</button></form>`}
  if(q.type==="write"){const shown=[...c.hz].map(ch=>ch===q.ch?"＿":ch).join("");
    qh=`<div class="ask">Write the missing character from memory</div><div class="han${c.hz.length>4?" long":""}">${esc(shown)}</div><div class="py">${esc(c.py)}</div><div class="ask">${esc(c.en)}</div>`;
    ah=`<div style="display:grid;justify-items:center;gap:8px"><div class="writer" id="twriter"></div><div class="wstatus" id="wstatus"></div><button class="ghost" id="tgive">Show me</button></div>`}
  $("qbox").innerHTML=qh;$("abox").innerHTML=ah;
  if(q.type==="type"){$("tin").focus();$("tform").onsubmit=e=>{e.preventDefault();const r=checkTyped($("tin").value,c.py);$("tin").disabled=true;answer(r,r===.5?`Almost. Check the tones: ${c.py}`:null)}}
  if(q.type==="write"){const w=makeWriter($("twriter"),q.ch,{showCharacter:false,showOutline:false});let over=false;
    w.quiz({showHintAfterMisses:3,
      onMistake:s=>{$("wstatus").textContent=`Stroke ${s.strokeNum+1}: try again`},
      onCorrectStroke:s=>{$("wstatus").textContent=`${s.strokeNum+1} of ${s.strokeNum+1+s.strokesRemaining} strokes`},
      onComplete:s=>{if(over)return;over=true;$("tgive").hidden=true;const m=s.totalMistakes;
        const r=m<=1?1:m<=4?.5:0;S.cbox[q.ch]=r===1?Math.min(cbox(q.ch)+1,5):0;
        answer(r,r===.5?`Written with ${m} slips. ${q.ch} in ${c.hz} (${c.py})`:null)}});
    $("tgive").onclick=()=>{if(over)return;over=true;$("tgive").hidden=true;w.cancelQuiz();w.showOutline();w.animateCharacter();S.cbox[q.ch]=0;answer(0)}}
}
function opts(q,cls){return `<div class="opts">${q.opts.map(o=>`<button class="opt ${cls}" data-o="${esc(o)}">${esc(o)}</button>`).join("")}</div>`}
$("abox").addEventListener("click",e=>{const b=e.target.closest(".opt");if(!b||!T)return;const q=T.items[T.i];
  if(document.querySelector(".opt.right,.opt.wrong"))return;
  const ok=b.dataset.o===q.ans;b.classList.add(ok?"right":"wrong");
  if(!ok)document.querySelectorAll(".opt").forEach(x=>{if(x.dataset.o===q.ans)x.classList.add("right")});
  answer(ok?1:0)});
$("qbox").addEventListener("click",e=>{const s=e.target.closest("[data-say]");if(s)say(s.dataset.say);
  if(e.target.id==="showPy"){$("pyHint").hidden=false;e.target.hidden=true}});
function answer(r,msg){const q=T.items[T.i],c=q.c;T.score+=r;
  gradeCard(c,r===1);
  if(r<1)T.miss.push(c);
  const f=$("fbk");f.className="feedback "+(r===1?"ok":"no");
  f.innerHTML=r===1?`Correct · <span style="font-family:var(--f-han)">${esc(c.hz)}</span> ${esc(c.py)} · ${esc(c.en)}`:
    (msg?esc(msg):`Answer: <span style="font-family:var(--f-han)">${esc(c.hz)}</span> ${esc(c.py)} · ${esc(c.en)}`);
  $("nextQ").hidden=false;$("nextQ").focus()}
$("nextQ").onclick=()=>{T.i++;if(T.i>=T.items.length)finish();else askQ()};
// Stopping midway: show results for what's answered so far, or leave without adding a score to the history.
const answeredSoFar=()=>T?T.i+($("nextQ").hidden?0:1):0;
function closeTest(){T=null;$("stopBox").hidden=true;$("testRun").hidden=true;$("testDone").hidden=true;$("testSetup").hidden=false;renderHist()}
$("quit").onclick=()=>{if(!T)return;const n=answeredSoFar();
  if(!n){closeTest();return}
  $("stopMsg").textContent=`Stop here? You've answered ${n} of ${T.items.length}.`;
  $("stopBox").hidden=false;$("stopResults").focus()};
$("stopCancel").onclick=()=>$("stopBox").hidden=true;
$("stopResults").onclick=()=>{$("stopBox").hidden=true;finish(true)};
$("stopDiscard").onclick=closeTest;
function finish(early){
  const n=early?answeredSoFar():T.items.length;$("stopBox").hidden=true;
  const sc=Math.round(T.score*10)/10;
  S.hist.push({score:sc,n,d:new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"})});S.hist=S.hist.slice(-30);save();
  const pct=n?Math.round(sc/n*100):0;
  const uniq=[...new Map(T.miss.map(c=>[c.id,c])).values()];
  $("testRun").hidden=true;const d=$("testDone");d.hidden=false;
  d.innerHTML=`<div class="row spread"><div><div class="label">Score</div><div class="score">${pct}%</div><div style="color:var(--muted)">${sc} of ${n} correct</div></div>
    <div class="row"><button class="btn" id="again2">New test</button>${uniq.length?`<button class="btn primary" id="drill">Study missed words</button>`:""}</div></div>
    ${uniq.length?`<div class="label" style="margin-top:18px">Review these</div><div class="miss">${uniq.map(c=>`<div><span class="mh">${esc(c.hz)}</span><span><b style="color:var(--jade)">${esc(c.py)}</b> · ${esc(c.en)}${c.hk?` <small>· ${esc(c.hk)}</small>`:""}</span></div>`).join("")}</div>`:`<p style="margin-top:14px">No mistakes. Try typing, listening or writing questions next.</p>`}`;
  $("again2").onclick=()=>{d.hidden=true;$("testSetup").hidden=false;renderHist()};
  if(uniq.length)$("drill").onclick=()=>{Q=shuffle(uniq);qi=0;location.hash="cards";showCard()};
  T=null;renderHist();
}

/* ---------- guided audio lessons ---------- */
let L=null;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function lessonSteps(c,mode){
  const r=+$("lrate").value,g=+$("lgap").value;
  const zh=(text,rate=r,line="")=>({t:"say",text,lang:"zh-CN",rate,line});
  const en=(text,line="")=>({t:"say",text,lang:"en-US",rate:1,line});
  const wait=(ms,line="",go=false)=>({t:"wait",ms,line,go});
  const show=(veil,sent=false)=>({t:"show",veil,sent});
  if(mode==="recall")return[show(true),en(c.en,"What's the Chinese for this?"),wait(g,"Say it in Chinese…",true),
    show(false),zh(c.hz,r,"Answer"),wait(700),wait(g*.8,"Say it again",true),zh(c.hz,r,"Once more"),wait(900)];
  if(mode==="shadow")return[show(false),zh(c.hz,Math.min(r,.6),"Slowly"),wait(g,"Repeat it",true),
    zh(c.hz,r,"Normal speed"),wait(g,"Repeat it",true),wait(400)];
  if(mode==="sentences"&&c.ex)return[show(false),zh(c.hz,r,"The word"),en(c.en),wait(500),show(false,true),
    zh(c.ex[0],Math.min(r,.7),"In a sentence, slowly"),en(c.ex[2]),wait(400),zh(c.ex[0],r,"Normal speed"),
    wait(g+c.ex[0].length*250,"Say the sentence",true),zh(c.ex[0],r,"Check yourself"),wait(900)];
  return[show(false),zh(c.hz,Math.min(r,.7),"Listen"),wait(500),en(c.en,"Meaning"),wait(400),zh(c.hz,r,"Again"),
    wait(g,"Your turn: say it",true),zh(c.hz,r,"Check yourself"),wait(900)];
}
function lessonCard(c,veil,sent){
  const v=veil?" veiled":"";const hide=$("lhide").checked;
  const word=hide&&!veil?`<div class="han">…</div>`:`<div class="${v}">${hanHtml(c)}<div class="py">${esc(c.py)}</div></div>`;
  const s=sent&&c.ex&&!hide?`<div class="ex"><div class="h">${esc(c.ex[0])}</div><div class="p">${esc(c.ex[1])}</div><div class="e">${esc(c.ex[2])}</div></div>`:"";
  return `${word}<div class="en" style="font-size:20px">${esc(c.en)}</div>${s}`}
async function runLesson(){
  if(!L)return;const tok=++L.tok;
  while(L&&L.i<L.items.length){
    const c=L.items[L.i];const steps=lessonSteps(c,L.mode);
    $("lpos").textContent=`Word ${L.i+1} of ${L.items.length}`;$("lbar").style.width=(L.i/L.items.length*100)+"%";
    for(;L.s<steps.length;L.s++){
      const st=steps[L.s];
      $("lstep").textContent=st.line||$("lstep").textContent;$("lstep").className="stepline"+(st.go?" go":"");
      if(st.t==="show")$("lcard").innerHTML=lessonCard(c,st.veil,st.sent);
      else if(st.t==="say"){$("lpulse").classList.add("on");await speak(st.text,st.lang,st.rate);$("lpulse").classList.remove("on")}
      else await sleep(st.ms);
      if(!L||tok!==L.tok)return;
    }
    L.seen.add(c.id);bump();save();L.i++;L.s=0;
  }
  lessonDone();
}
function stopSpeech(){try{speechSynthesis.cancel()}catch(e){}$("lpulse").classList.remove("on")}
function pauseLesson(){if(!L||L.paused)return;L.paused=true;L.tok++;stopSpeech();$("lpause").textContent="▶ Resume";$("lstep").textContent="Paused";$("lstep").className="stepline"}
function resumeLesson(){if(!L)return;L.paused=false;$("lpause").textContent="❚❚ Pause";runLesson()}
function jumpLesson(i){if(!L)return;L.tok++;stopSpeech();L.i=Math.max(0,i);L.s=0;if(L.i>=L.items.length)return lessonDone();
  if(L.paused){L.paused=false;$("lpause").textContent="❚❚ Pause"}runLesson()}
$("lstart").onclick=()=>{
  const mode=document.querySelector('input[name=lmode]:checked').value;
  let p=pool();if(mode==="sentences"){const w=p.filter(c=>c.ex);if(w.length)p=w}
  p=shuffle(p).sort((a,b)=>box(a)-box(b));
  const n=$("lcount").value==="all"?p.length:Math.min(+$("lcount").value,p.length);
  // iOS only allows speech that starts from a tap, so the first utterance must happen in this handler.
  try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(" ");u.volume=0;speechSynthesis.speak(u)}catch(e){}
  L={mode,items:p.slice(0,n),i:0,s:0,tok:0,paused:false,seen:new Set(),hard:new Set()};
  $("lsetup").hidden=true;$("ldone").hidden=true;$("lplay").hidden=false;$("lpause").textContent="❚❚ Pause";
  markDay();save();runLesson();
};
$("lpause").onclick=()=>L&&(L.paused?resumeLesson():pauseLesson());
$("lskip").onclick=()=>L&&jumpLesson(L.i+1);
$("lback").onclick=()=>L&&jumpLesson(L.i-1);
$("lreplay").onclick=()=>L&&jumpLesson(L.i);
$("lhard").onclick=()=>{if(!L)return;const c=L.items[L.i];if(!c)return;gradeCard(c,false);
  if(!L.hard.has(c.id)){L.hard.add(c.id);L.items.push(c)}$("lstep").textContent="Added to the end for another pass"};
$("leasy").onclick=()=>{if(!L)return;const c=L.items[L.i];if(!c)return;gradeCard(c,true);jumpLesson(L.i+1)};
$("lstop").onclick=()=>{if(!L)return;L.tok++;stopSpeech();lessonDone()};
function lessonDone(){
  if(!L)return;stopSpeech();const items=[...new Map(L.items.filter(c=>L.seen.has(c.id)).map(c=>[c.id,c])).values()];
  const hard=items.filter(c=>L.hard.has(c.id));L=null;
  $("lplay").hidden=true;const d=$("ldone");d.hidden=false;
  d.innerHTML=`<div class="row spread"><div><div class="label">Lesson complete</div><div class="score">${items.length}</div><div style="color:var(--muted)">words practised</div></div>
    <div class="row"><button class="btn" id="lagain">New lesson</button>${hard.length?`<button class="btn primary" id="lhardcards">Flashcards for hard words</button>`:""}</div></div>
    ${items.length?`<div class="miss">${items.map(c=>`<div><span class="mh">${esc(c.hz)}</span><span><b style="color:var(--jade)">${esc(c.py)}</b> · ${esc(c.en)}${hard.includes(c)?` <small>· marked hard</small>`:""}</span></div>`).join("")}</div>`:""}`;
  $("lagain").onclick=()=>{d.hidden=true;$("lsetup").hidden=false};
  if(hard.length)$("lhardcards").onclick=()=>{Q=shuffle(hard);qi=0;location.hash="cards";showCard()};
}

/* ---------- characters ---------- */
let CH=[],ci=0,wmode="watch",writer=null;
function buildChars(){
  const seen=new Map();
  pool().forEach(c=>hanChars(c.hz).forEach(ch=>{if(!seen.has(ch))seen.set(ch,seen.size)}));
  CH=[...seen.keys()];
  if(S.corder==="weak")CH=CH.map((ch,i)=>[ch,i]).sort((a,b)=>cbox(a[0])-cbox(b[0])||a[1]-b[1]).map(x=>x[0]);
  ci=Math.min(ci,CH.length-1);if(ci<0)ci=0;
  renderCharGrid();if(view==="chars")showChar();
}
function renderCharGrid(){
  $("chargrid").innerHTML=CH.map((ch,i)=>{const b=cbox(ch);return `<button class="cg ${b>=3?"s2":b>0?"s1":""}" data-i="${i}" aria-pressed="${i===ci}" aria-label="${esc(ch)}">${esc(ch)}</button>`}).join("");
}
function charMeaning(ch){const single=D.find(c=>c.hz===ch);return single?{py:single.py,en:single.en}:null}
function showChar(){
  const ch=CH[ci];if(!ch)return;
  const m=charMeaning(ch),mn=MN[ch];
  const words=D.filter(c=>c.hz.includes(ch)&&c.hz!==ch&&hanChars(c.hz).length<=6).slice(0,8);
  const b=cbox(ch);
  $("charinfo").innerHTML=`<div class="row" style="gap:12px"><span class="big">${esc(ch)}</span>
      ${canSpeak()?`<button class="speak" style="position:static" data-say="${esc(ch)}" aria-label="Hear it">🔊</button>`:""}
      <span class="boxes" title="Written correctly in a row">${[0,1,2].map(i=>`<span class="${b>i?"on":""}"></span>`).join("")}</span></div>
    ${m?`<div><span class="py">${esc(m.py)}</span> <span style="color:var(--muted)">· ${esc(m.en)}</span></div>`:""}
    ${mn?`<div><div class="label">Memory hook</div><div class="comp">${esc(mn[0])}</div><div class="story">${esc(mn[1])}</div></div>`:""}
    ${words.length?`<div><div class="label" style="margin-bottom:4px">Used in</div><div class="inwords">${words.map(c=>`<button data-say="${esc(c.hz)}"><span class="h">${esc(c.hz)}</span> ${esc(c.py)} · ${esc(c.en)}</button>`).join("")}</div></div>`:""}
    <div class="wstatus" id="wstatus"></div>
    <div class="row">${wmode==="watch"?`<button class="btn" id="replayStrokes">▶ Play strokes</button>`:`<button class="btn" id="resetWrite">↺ Start over</button><button class="ghost" id="hintWrite">Show me</button>`}</div>`;
  $("cpos").textContent=`${ci+1} of ${CH.length}`;
  document.querySelectorAll(".cg").forEach(x=>x.setAttribute("aria-pressed",+x.dataset.i===ci));
  document.querySelectorAll("#wmode button").forEach(x=>x.setAttribute("aria-pressed",x.dataset.m===wmode));
  mountWriter(ch);
}
function mountWriter(ch){
  const el=$("writer");
  if(!hasWriter()){el.innerHTML=`<div class="fallback">${esc(ch)}</div>`;$("wstatus").textContent="Stroke order needs an internet connection the first time.";return}
  if(wmode==="watch"){writer=makeWriter(el,ch,{showOutline:true});writer.animateCharacter();return}
  writer=makeWriter(el,ch,{showCharacter:false,showOutline:wmode==="trace"});
  $("wstatus").className="wstatus";$("wstatus").textContent=wmode==="trace"?"Trace each stroke in order":"Draw it from memory. A hint appears after 3 misses";
  writer.quiz({showHintAfterMisses:wmode==="trace"?2:3,
    onMistake:s=>{$("wstatus").className="wstatus no";$("wstatus").textContent=`Stroke ${s.strokeNum+1}: not quite. Try again`},
    onCorrectStroke:s=>{$("wstatus").className="wstatus";$("wstatus").textContent=`${s.strokeNum+1} of ${s.strokeNum+1+s.strokesRemaining} strokes`},
    onComplete:s=>{const ok=s.totalMistakes<=(wmode==="trace"?2:1);
      if(wmode==="recall"){S.cbox[ch]=ok?Math.min(cbox(ch)+1,5):0}else if(ok&&cbox(ch)<1)S.cbox[ch]=1;
      bump();save();renderCharGrid();
      $("wstatus").className="wstatus "+(ok?"ok":"no");
      $("wstatus").textContent=ok?`Nice. ${s.totalMistakes} mistake${s.totalMistakes===1?"":"s"}.`:`Done with ${s.totalMistakes} mistakes. Try it again.`}});
}
$("chargrid").addEventListener("click",e=>{const b=e.target.closest("[data-i]");if(!b)return;ci=+b.dataset.i;showChar();$("writer").scrollIntoView({behavior:"smooth",block:"center"})});
$("wmode").addEventListener("click",e=>{const b=e.target.closest("[data-m]");if(!b)return;wmode=b.dataset.m;showChar()});
$("charinfo").addEventListener("click",e=>{const s=e.target.closest("[data-say]");if(s){say(s.dataset.say);return}
  if(e.target.id==="replayStrokes"&&writer)writer.animateCharacter();
  if(e.target.id==="resetWrite")showChar();
  if(e.target.id==="hintWrite"&&writer){writer.cancelQuiz();writer.showOutline();writer.animateCharacter({onComplete:()=>setTimeout(showChar,900)})}});
$("cprev").onclick=()=>{ci=(ci-1+CH.length)%CH.length;showChar()};
$("cnext").onclick=()=>{ci=(ci+1)%CH.length;showChar()};
$("corder").value=S.corder;
$("corder").onchange=e=>{S.corder=e.target.value;save();ci=0;buildChars()};

/* ---------- home dashboard ---------- */
const dayKey=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
function bestStreak(){const ds=[...new Set(S.days)].sort();let best=0,run=0,prev=null;
  ds.forEach(k=>{const d=new Date(k+"T12:00");run=prev&&(d-prev)/864e5<1.5?run+1:1;best=Math.max(best,run);prev=d});return best}
function renderHome(){
  const now=new Date(),h=now.getHours();
  $("hDate").textContent=now.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  $("hGreet").textContent=(h<12?"Good morning":h<18?"Good afternoon":"Good evening")+" · 加油！";
  const st=streak();$("tStreak").textContent=st;
  $("tStreakSub").textContent=S.days.includes(today())?`Studied today · best ${bestStreak()}`:st?"Study today to keep it going":"Study today to start one";
  const m=D.filter(c=>box(c)>=3).length,l=D.filter(c=>box(c)>0&&box(c)<3).length;
  $("tWords").textContent=m;$("tWordsSub").textContent=`of ${D.length} · ${l} learning`;
  const all=[...new Set(D.flatMap(c=>hanChars(c.hz)))],cm=all.filter(ch=>cbox(ch)>=3).length,cw=all.filter(ch=>cbox(ch)>0).length;
  $("tChars").textContent=cm;$("tCharsSub").textContent=`mastered of ${all.length} · ${cw} written`;
  const last=S.hist.slice(-5);
  $("tTest").textContent=last.length?Math.round(last.reduce((a,x)=>a+(x.n?x.score/x.n:0),0)/last.length*100)+"%":"–";
  $("tTestSub").textContent=last.length?`last ${last.length} test${last.length>1?"s":""} · ${S.hist.length} total`:"No tests yet";
  // Activity: the last 7 days, one sequential hue, value label on today only; the rest show on hover.
  const days=[...Array(7)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-6+i);const k=dayKey(d);return{k,d,n:S.log[k]||0,studied:S.days.includes(k)}});
  const max=Math.max(5,...days.map(x=>x.n)),tot=days.reduce((a,x)=>a+x.n,0);
  $("weekSum").textContent=`${tot} review${tot===1?"":"s"} · ${days.filter(x=>x.n||x.studied).length} of 7 days`;
  $("week").setAttribute("aria-label","Reviews per day this week: "+days.map(x=>`${x.d.toLocaleDateString(undefined,{weekday:"short"})} ${x.n}`).join(", "));
  $("week").innerHTML=days.map((x,i)=>{const isT=i===6,wd=x.d.toLocaleDateString(undefined,{weekday:"short"});
    return `<div class="wk${isT?" today":""}" tabindex="0"><div class="col">${isT&&x.n?`<span class="v">${x.n}</span>`:""}<div class="b${x.n?"":" zero"}" style="height:${x.n/max*100}%"></div></div><span class="d">${isT?"Today":wd}</span>
      <span class="tip">${x.d.toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})} · ${x.n} review${x.n===1?"":"s"}</span></div>`}).join("");
  const weak=pool().filter(c=>box(c)<3).length;
  $("qWeakSub").textContent=weak?`${weak} not yet mastered in your decks`:"Everything in your decks is mastered";
  $("qTestSub").textContent=S.hist.length?`Last: ${S.hist[S.hist.length-1].score}/${S.hist[S.hist.length-1].n}`:"Check what's sticking";
  $("qCharSub").textContent=`${all.length-cw} you haven't written yet`;
  const rows=Object.entries(DECKS).map(([k,v])=>{const cs=D.filter(c=>c.deck===k);
    return [v,cs.length,cs.filter(c=>box(c)>=3).length,cs.filter(c=>box(c)>0&&box(c)<3).length]});
  rows.push(["Characters written",all.length,cm,all.filter(ch=>cbox(ch)>0&&cbox(ch)<3).length]);
  $("deckrows").innerHTML=rows.map(([v,n,m,l])=>`<div class="deckrow"><b>${v}</b><div class="bar" title="${m} mastered · ${l} learning · ${n-m-l} new"><i style="width:${m/n*100}%"></i><i style="width:${l/n*100}%"></i></div><span style="font-variant-numeric:tabular-nums;color:var(--muted);font-size:13px">${m}/${n}</span></div>`).join("");
  $("wordgrid").innerHTML=D.map(c=>{const b=box(c);const cls=b>=3?"s2":b>0?"s1":"s0";
    return `<div class="wg ${cls}" title="${esc(c.py)} · ${esc(c.en)}"><div class="h">${esc(c.hz.length>5?c.hz.slice(0,5)+"…":c.hz)}</div><small>${esc(c.en)}</small></div>`}).join("");
}
$("qWeak").onclick=()=>{S.order="weak";$("order").value="weak";save();buildQueue()};
$("reset").onclick=()=>{$("resetConfirm").hidden=false;$("resetConfirm").scrollIntoView({behavior:"smooth",block:"nearest"})};
$("resetNo").onclick=()=>$("resetConfirm").hidden=true;
$("resetBackup").onclick=()=>$("exportBtn").click();
$("resetYes").onclick=()=>{S.box={};S.cbox={};S.hist=[];S.days=[];S.log={};save();$("resetConfirm").hidden=true;
  $("syncNote").textContent="Progress reset. Everything starts fresh.";renderHome();renderHist();renderStreak();buildQueue();buildChars()};
$("exportBtn").onclick=()=>{
  const blob=new Blob([JSON.stringify({app:"hanzi-practice",v:1,saved:new Date().toISOString(),data:S})],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`hanzi-progress-${today()}.json`;
  document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),2000);
};
// Restoring merges: the better score per card wins, so a backup from another device never erases progress here.
$("importFile").onchange=e=>{const f=e.target.files[0];if(!f)return;const rd=new FileReader();
  rd.onload=()=>{try{const j=JSON.parse(rd.result),o=j.data||j;if(!o||typeof o.box!=="object")throw 0;
    for(const[k,v]of Object.entries(o.box))S.box[k]=Math.max(S.box[k]||0,+v||0);
    for(const[k,v]of Object.entries(o.cbox||{}))S.cbox[k]=Math.max(S.cbox[k]||0,+v||0);
    S.days=[...new Set([...S.days,...(o.days||[])])].sort().slice(-400);
    for(const[k,v]of Object.entries(o.log||{}))S.log[k]=Math.max(S.log[k]||0,+v||0);
    const hk=h=>h.d+"|"+h.score+"|"+h.n;const seenH=new Set(S.hist.map(hk));
    (o.hist||[]).forEach(h=>{if(!seenH.has(hk(h)))S.hist.push(h)});S.hist=S.hist.slice(-30);
    save();renderHome();renderHist();renderStreak();buildQueue();buildChars();
    $("syncNote").textContent="Backup restored and merged with this device's progress.";
  }catch(err){$("syncNote").textContent="That file isn't a Hanzi Practice backup."}e.target.value=""};
  rd.readAsText(f)};

/* ---------- routing ---------- */
const VIEWS=["home","cards","test","listen","chars"];
let view="home";
function route(){const prev=view;view=VIEWS.includes(location.hash.slice(1))?location.hash.slice(1):"home";
  VIEWS.forEach(v=>$("v-"+v).hidden=v!==view);$("deckbar").hidden=view==="home";
  document.querySelectorAll("nav a").forEach(a=>a.setAttribute("aria-current",a.dataset.view===view?"page":"false"));
  if(prev==="listen"&&view!=="listen")pauseLesson();
  if(view==="home")renderHome();if(view==="test")renderHist();if(view==="chars")showChar();if(view==="cards")fitCard()}
addEventListener("hashchange",route);
document.addEventListener("visibilitychange",()=>{if(document.hidden)pauseLesson()});

renderDecks();renderStreak();buildQueue();buildChars();route();

/* ---------- offline support ---------- */
if("serviceWorker" in navigator&&location.protocol!=="file:")addEventListener("load",()=>navigator.serviceWorker.register("sw.js").catch(()=>{}));
