/*
 * 春日部机场 · Signal Detection Theory (SDT) 实验
 * -------------------------------------------------
 * 本文件按“状态 → 页面交互 → 刺激生成 → 实验流程 → SDT计算 → 可视化 → 历史记录”组织。
 * 研究任务与结果计算均在前端完成，因此无需后端服务即可运行。
 */

// ==================== 1. 实验状态与通用 DOM 工具 ====================
const state={strategy:'strict',difficulty:'easy',trialIndex:0,practiceIndex:0,trials:[],responses:[],practiceTrials:[],current:null,responseReady:false,scanTimer:null,score:0,costs:{miss:0,fa:0}};
const screens=['home','setup','practice','game','results'];

// 统一的页面切换函数：一次只显示一个实验阶段。
const $=id=>document.getElementById(id);
function show(name){screens.forEach(s=>$(`screen-${s}`).classList.toggle('active',s===name));window.scrollTo(0,0)}
// ==================== 2. 首页与实验参数设置 ====================
function choiceSetup(){
 document.querySelectorAll('.choice.strategy').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.choice.strategy').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');state.strategy=b.dataset.value}));
 document.querySelectorAll('.choice.difficulty').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.choice.difficulty').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');state.difficulty=b.dataset.value}));
}
$('startSetup').onclick=()=>show('setup');$('backHome').onclick=()=>show('home');
$('startPractice').onclick=()=>{state.practiceIndex=0;state.practiceTrials=makeTrials(3,true);show('practice');renderPractice()};
$('again').onclick=()=>{resetGameState();show('setup')};$('home').onclick=()=>{resetGameState();show('home')};
// 清空上一轮实验的反应、计分与定时器。
function resetGameState(){if(state.scanTimer)clearTimeout(state.scanTimer);state.trialIndex=0;state.responses=[];state.current=null;state.responseReady=false;state.score=0;state.costs={miss:0,fa:0};}
// Fisher–Yates 洗牌：随机化正式 trial 的 Signal / Noise 顺序。
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
// 生成练习或正式试次；正式实验固定为 9 个 Signal + 21 个 Noise。
function makeTrials(n,practice=false){const types=[];if(practice){types.push(true,false,true)}else{for(let i=0;i<9;i++)types.push(true);for(let i=0;i<21;i++)types.push(false)}return shuffle(types).slice(0,n).map((signal,i)=>({id:i+1,signal}))}
// ==================== 3. 卡通行李与扫描场景 ====================
// 使用内嵌 SVG 绘制普通物品，避免额外网络依赖。
function svgItem(type){
 const common='stroke="#263746" stroke-width="4" stroke-linejoin="round"';
 const svgs={
 book:`<svg viewBox="0 0 100 90"><path ${common} fill="#f1c85a" d="M15 18h30c9 0 18 5 20 12v48c-7-7-14-9-25-9H15z"/><path ${common} fill="#e88b78" d="M85 18H55c-9 0-18 5-20 12v48c7-7 14-9 25-9h25z"/><path ${common} fill="none" d="M50 31v40"/></svg>`,
 shirt:`<svg viewBox="0 0 110 100"><path ${common} fill="#77a7d6" d="M31 18l18 10h12l18-10 22 21-14 14-8-8v40H30V45l-8 8L8 39z"/><path ${common} fill="#f7e7b2" d="M49 28h12l-6 12z"/></svg>`,
 shoe:`<svg viewBox="0 0 120 80"><path ${common} fill="#d98670" d="M18 23l42 16c8 3 15 7 21 15l25 2c8 1 10 12 2 15H21C8 71 7 56 17 48z"/><path ${common} fill="#f3d9c5" d="M67 54h33"/></svg>`,
 bottle:`<svg viewBox="0 0 80 110"><path ${common} fill="#7ec5d4" d="M27 20h26v17l9 13v47c0 7-5 10-12 10H30c-7 0-12-3-12-10V50l9-13z"/><path ${common} fill="#f0c95b" d="M27 9h26v12H27z"/></svg>`,
 teddy:`<svg viewBox="0 0 110 110"><circle ${common} fill="#d49a72" cx="28" cy="27" r="14"/><circle ${common} fill="#d49a72" cx="82" cy="27" r="14"/><circle ${common} fill="#d49a72" cx="55" cy="56" r="37"/><circle fill="#263746" cx="42" cy="53" r="4"/><circle fill="#263746" cx="68" cy="53" r="4"/><ellipse fill="#f2d2a7" cx="55" cy="67" rx="13" ry="9"/></svg>`,
 camera:`<svg viewBox="0 0 110 80"><rect ${common} fill="#71889b" x="8" y="22" width="94" height="46" rx="9"/><path ${common} fill="#536a7d" d="M32 22l8-10h28l8 10z"/><circle ${common} fill="#d7edf2" cx="55" cy="45" r="17"/><circle fill="#536a7d" cx="55" cy="45" r="8"/></svg>`,
 umbrella:`<svg viewBox="0 0 120 100"><path ${common} fill="#ef9d7c" d="M10 48c20-30 80-30 100 0H10z"/><path ${common} fill="none" d="M60 48v35c0 13 20 13 20 1"/></svg>`,
 headphones:`<svg viewBox="0 0 100 100"><path ${common} fill="none" d="M20 55V43c0-42 60-42 60 0v12"/><rect ${common} fill="#e3a94f" x="12" y="51" width="18" height="30" rx="8"/><rect ${common} fill="#6e8fc4" x="70" y="51" width="18" height="30" rx="8"/></svg>`};return svgs[type];
}
const itemTypes=['book','shirt','shoe','bottle','teddy','camera','umbrella','headphones'];
// 将一个普通行李物品放入扫描窗口，并随机设置位置与大小。
function addItem(parent,type,x,y,w,cls=''){const div=document.createElement('div');div.className=`item ${cls}`;div.style.left=x+'%';div.style.top=y+'%';div.style.width=w+'px';div.style.height=(w*.82)+'px';div.innerHTML=svgItem(type);parent.appendChild(div);return div}
// 绘制一次扫描画面。Signal 会被普通物品遮挡，以操纵辨别难度。
function renderScanner(el,signal,difficulty,practice=false){
 el.innerHTML='';el.classList.remove('complete');
 const win=document.createElement('div');win.className='scanner-window';
 const beam=document.createElement('div');beam.className='scan-beam';win.appendChild(beam);
 const bag=document.createElement('div');bag.className='baggage';const shell=document.createElement('div');shell.className='bag-shell';const contents=document.createElement('div');contents.className='bag-items';bag.appendChild(shell);bag.appendChild(contents);win.appendChild(bag);el.appendChild(win);
 const count={easy:6,medium:10,hard:14}[difficulty];
 if(signal){
   // The target is small and always enters first; ordinary objects are then layered over it.
   const spec={easy:{w:62,vis:.96},medium:{w:54,vis:.88},hard:{w:46,vis:.80}}[difficulty];
   const tx=34+Math.random()*28, ty=24+Math.random()*34;
   const target=document.createElement('div');target.className='item target';target.style.width=spec.w+'px';target.style.height=spec.w+'px';target.style.left=tx+'%';target.style.top=ty+'%';target.style.opacity=spec.vis;target.style.transform=`rotate(${(-10+Math.random()*20).toFixed(1)}deg)`;target.innerHTML='<img src="assets/target-transparent.png" alt="目标刺激：肥嘟嘟左卫门">';contents.appendChild(target);
   for(let i=0;i<count;i++){
     const w=42+Math.random()*36;const x=5+Math.random()*84;const y=6+Math.random()*70;
     addItem(contents,itemTypes[Math.floor(Math.random()*itemTypes.length)],x,y,w,(i<({easy:1,medium:3,hard:6}[difficulty]))?'cover-item':'');
   }
   // Dense foreground clutter is deliberately placed around the target so the signal is not visually obvious.
   const covers={easy:2,medium:5,hard:9}[difficulty];
   for(let k=0;k<covers;k++){
     const w=(difficulty==='hard'?42:46)+Math.random()*34;
     const x=Math.max(2,Math.min(82,tx-10+(Math.random()*24)-k*0.5));
     const y=Math.max(4,Math.min(70,ty-8+Math.random()*28));
     addItem(contents,itemTypes[(k+2)%itemTypes.length],x,y,w,'cover-item');
   }
 }else{
   for(let i=0;i<count+3;i++){const w=42+Math.random()*36;addItem(contents,itemTypes[Math.floor(Math.random()*itemTypes.length)],5+Math.random()*84,6+Math.random()*70,w);}
 }
 if(practice){setTimeout(()=>{el.classList.add('complete')},1800)}
}
// 根据扫描是否完成，控制 SAFE / CHECK 是否可点击。
function setButtons(enabled){document.querySelectorAll('#screen-game .answer').forEach(b=>b.disabled=!enabled);state.responseReady=enabled}
// ==================== 4. 练习阶段 ====================
function renderPractice(){const t=state.practiceTrials[state.practiceIndex];$('practiceCounter').textContent=`${state.practiceIndex+1} / 3`;renderScanner($('practiceScanner'),t.signal,state.difficulty,true);$('practiceFeedback').textContent='';$('practiceInstruction').textContent=state.strategy==='strict'?'先观察扫描中的行李；如果不确定，倾向选择 CHECK。':'先观察扫描中的行李；如果不确定，倾向选择 SAFE。';}
document.querySelectorAll('#screen-practice .answer').forEach(b=>b.addEventListener('click',()=>{
 const t=state.practiceTrials[state.practiceIndex],ans=b.dataset.answer;const correct=(t.signal&&ans==='check')||(!t.signal&&ans==='safe');$('practiceFeedback').textContent=correct?'✓ 正确。正式实验将不会显示即时反馈。':'✕ 这次判断与目标状态不一致。';$('practiceFeedback').style.color=correct?'#3f8a61':'#b34537';setTimeout(()=>{state.practiceIndex++;if(state.practiceIndex>=3){startGame()}else renderPractice()},650);
}));
// ==================== 5. 正式实验流程 ====================
function startGame(){state.trialIndex=0;state.responses=[];state.trials=makeTrials(30,false);state.current=null;state.score=0;state.costs={miss:0,fa:0};$('strategyBadge').textContent=state.strategy.toUpperCase();$('difficultyBadge').textContent=state.difficulty.toUpperCase();updateStrategyUI();show('game');renderTrial()}
// 开始当前 trial：先播放 1.8 秒扫描，再开放响应按钮。
function renderTrial(){const t=state.trials[state.trialIndex];state.current=t;$('trialCounter').textContent=`${state.trialIndex+1} / 30`;updateStrategyUI();setButtons(false);$('scanState').textContent='行李正在进入扫描通道…';$('responsePrompt').textContent='请等待扫描完成';$('responsePrompt').classList.add('muted');renderScanner($('scanner'),t.signal,state.difficulty);if(state.scanTimer)clearTimeout(state.scanTimer);state.scanTimer=setTimeout(()=>{setButtons(true);$('scanner').classList.add('complete');$('scanState').textContent='扫描完成，请立即判断';$('responsePrompt').textContent='现在请作出判断';$('responsePrompt').classList.remove('muted')},1800)}
// 记录被试反应、计算策略代价，并推进到下一 trial。
function respond(answer){if(!state.current||!state.responseReady)return;const signal=state.current.signal;let trialCost=0;if(signal&&answer==='safe')trialCost=state.strategy==='strict'?-10:-2;if(!signal&&answer==='check')trialCost=state.strategy==='strict'?-2:-10;if(trialCost<0){if(signal&&answer==='safe')state.costs.miss+=Math.abs(trialCost);if(!signal&&answer==='check')state.costs.fa+=Math.abs(trialCost);}state.score+=trialCost;state.responses.push({signal,answer,cost:trialCost});state.responseReady=false;setButtons(false);state.trialIndex++;if(state.trialIndex>=30){finishGame()}else{setTimeout(renderTrial,180)}}
document.querySelectorAll('#screen-game .answer').forEach(b=>b.addEventListener('click',()=>respond(b.dataset.answer)));window.addEventListener('keydown',e=>{if(!$('screen-game').classList.contains('active')||!state.responseReady)return;if(e.key==='ArrowLeft')respond('safe');if(e.key==='ArrowRight')respond('check')});
function correctedRate(x,n){return (x+0.5)/(n+1)}
function invNorm(p){const a=[-39.6968302866538,220.946098424521,-275.928510446969,138.357751867269,-30.6647980661472,2.50662827745924],b=[-54.4760987982241,161.585836858041,-155.698979859887,66.8013118877197,-13.2806815528857],c=[-0.00778489400243029,-0.322396458041136,-2.40075827716184,-2.54973253934373,4.37466414146497,2.93816398269878],d=[0.00778469570904146,0.32246712907004,2.445134137143,3.75440866190742],pl=.02425,ph=1-pl;let q,r;if(p<pl){q=Math.sqrt(-2*Math.log(p));return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}if(p>ph){q=Math.sqrt(-2*Math.log(1-p));return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1)}q=p-.5;r=q*q;return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1)}
// ==================== 6. SDT 数据计算 ====================
// 对极端比例使用 log-linear correction，避免 d′ / c 出现无穷或 NaN。
function calc(){let hit=0,miss=0,fa=0,cr=0;state.responses.forEach(r=>{if(r.signal&&r.answer==='check')hit++;else if(r.signal)miss++;else if(r.answer==='check')fa++;else cr++});const hr=correctedRate(hit,hit+miss),far=correctedRate(fa,fa+cr),accuracy=(hit+cr)/(hit+miss+fa+cr),d=invNorm(hr)-invNorm(far),c=-.5*(invNorm(hr)+invNorm(far));return{hit,miss,fa,cr,hr,far,accuracy,d,c}}
// 将策略条件同步到实验中的文字提示与实时得分。
function updateStrategyUI(){const strict=state.strategy==='strict';$('strategyInstruction').textContent=strict?'安全优先：漏检危险物品的代价更高。':'通行优先：误拦普通行李的代价更高。';$('strategyCost').textContent=strict?'漏检 −10｜误拦 −2':'漏检 −2｜误拦 −10';$('liveScore').textContent=state.score;}
// ==================== 7. 结果页与图表 ====================
function finishGame(){
 if(state.scanTimer)clearTimeout(state.scanTimer);
 state.responseReady=false;state.current=null;
 // Switch screens first so a chart/localStorage issue can never block the results page.
 show('results');
 let m;
 try{m=calc()}catch(err){m={hit:0,miss:0,fa:0,cr:0,hr:.5,far:.5,accuracy:0,d:0,c:0};console.error('SDT calculation error:',err)}
 $('mHit').textContent=m.hit;$('mMiss').textContent=m.miss;$('mFA').textContent=m.fa;$('mCR').textContent=m.cr;$('mScore').textContent=state.score;$('mMissCost').textContent='−'+state.costs.miss;$('mFACost').textContent='−'+state.costs.fa;
 $('mHR').textContent=(m.hr*100).toFixed(1)+'%';$('mFAR').textContent=(m.far*100).toFixed(1)+'%';$('mAccuracy').textContent=(m.accuracy*100).toFixed(1)+'%';$('mDprime').textContent=m.d.toFixed(2);$('mC').textContent=m.c.toFixed(2);
 $('resultMeta').textContent=`策略：${state.strategy.toUpperCase()} · 难度：${state.difficulty.toUpperCase()} · P(S)=30% · 呈现时间：1.8 s · 策略得分：${state.score}`;
 try{drawDistribution(m.d,m.c);drawROC(m.d,m.hr,m.far);setupCriterionDemo(m.d);drawComparison()}catch(err){console.error('Chart error:',err)}
 try{saveHistory(m);renderHistory()}catch(err){console.error('History error:',err)}
 requestAnimationFrame(()=>window.scrollTo(0,0));
}
// 通用二维坐标轴。
function axis(ctx,w,h){ctx.clearRect(0,0,w,h);ctx.strokeStyle='#b8c3cc';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(48,h-32);ctx.lineTo(w-18,h-32);ctx.moveTo(48,20);ctx.lineTo(48,h-32);ctx.stroke()}
// 根据本轮实验得到的 d′ 和 c 绘制 Signal / Noise 分布。
function drawDistribution(d,c){const cv=$('distCanvas'),ctx=cv.getContext('2d'),w=cv.width,h=cv.height;axis(ctx,w,h);const zmin=-4,zmax=4,base=h-32,scale=62;function normal(z,mu){return Math.exp(-.5*(z-mu)**2)/Math.sqrt(2*Math.PI)}function px(z){return 48+(z-zmin)/(zmax-zmin)*(w-66)}function py(v){return base-v*scale}ctx.lineWidth=3;ctx.strokeStyle='#4b78a8';ctx.beginPath();for(let i=0;i<=200;i++){const z=zmin+(zmax-zmin)*i/200;const x=px(z),y=py(normal(z,d/2));i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();ctx.strokeStyle='#d58b57';ctx.beginPath();for(let i=0;i<=200;i++){const z=zmin+(zmax-zmin)*i/200;const x=px(z),y=py(normal(z,-d/2));i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();const crit=-c;ctx.strokeStyle='#263746';ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(px(crit),24);ctx.lineTo(px(crit),base);ctx.stroke();ctx.setLineDash([]);ctx.fillStyle='#4b78a8';ctx.fillText('Signal',px(d/2),28);ctx.fillStyle='#d58b57';ctx.fillText('Noise',px(-d/2)-35,28);ctx.fillStyle='#263746';ctx.fillText('criterion',px(crit)+5,42)}
// 本轮结果对应的理论 ROC，并标记本轮观测点。
function drawROC(d,observedHR=null,observedFAR=null){const cv=$('rocCanvas'),ctx=cv.getContext('2d'),w=cv.width,h=cv.height;axis(ctx,w,h);const left=48,top=20,bottom=h-32,right=w-18;ctx.strokeStyle='#c2cbd2';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(left,bottom);ctx.lineTo(right,top);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#4b78a8';ctx.lineWidth=3;ctx.beginPath();for(let i=0;i<=100;i++){const far=Math.max(.001,Math.min(.999,i/100));const x=left+(i/100)*(right-left);const hit=normalCDF(invNorm(far)+d);const y=bottom-hit*(bottom-top);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();if(observedHR!==null&&observedFAR!==null){const ox=left+observedFAR*(right-left),oy=bottom-observedHR*(bottom-top);ctx.fillStyle='#17345f';ctx.beginPath();ctx.arc(ox,oy,6,0,Math.PI*2);ctx.fill();ctx.fillText('本轮',ox+8,oy-8)}ctx.fillStyle='#263746';ctx.fillText('False Alarm Rate',w/2-45,h-7);ctx.save();ctx.translate(15,h/2+35);ctx.rotate(-Math.PI/2);ctx.fillText('Hit Rate',0,0);ctx.restore()}
// 正态分布 CDF 与误差函数：用于 SDT 理论概率和 ROC 计算。
function normalCDF(x){return .5*(1+erf(x/Math.sqrt(2)))}function erf(x){const s=x<0?-1:1;x=Math.abs(x);const a1=.254829592,a2=-.284496736,a3=1.421413741,a4=-1.453152027,a5=1.061405429,p=.3275911,t=1/(1+p*x);return s*(1-((((a5*t+a4)*t+a3)*t+a2)*t+a1)*t*Math.exp(-x*x))}
// ==================== 8. 独立于实验的加分项：SDT 概念演示 ====================
// 这里的 d′ / c 完全由滑块控制，不读取本轮实验结果。
function setupCriterionDemo(){
 const dSlider=$('demoDSlider'),cSlider=$('criterionSlider');
 if(!dSlider||!cSlider)return;
 const update=()=>{
   const d=Math.max(0,Math.min(3,parseFloat(dSlider.value)||0));
   const c=Math.max(-2,Math.min(2,parseFloat(cSlider.value)||0));
   $('demoDValue').textContent=d.toFixed(2);
   $('criterionValue').textContent=c.toFixed(2);
   const hr=normalCDF(d/2-c),far=normalCDF(-d/2-c);
   $('criterionHR').textContent=(hr*100).toFixed(1)+'%';
   $('criterionFAR').textContent=(far*100).toFixed(1)+'%';
   drawConceptDistribution(d,c);
   drawConceptROC(d,c);
 };
 dSlider.oninput=update;
 cSlider.oninput=update;
 update();
}
// 加分项图表专用坐标轴。
function conceptAxis(ctx,w,h){
 ctx.clearRect(0,0,w,h);ctx.strokeStyle='#b8c3cc';ctx.lineWidth=1;
 const left=48,bottom=h-32;ctx.beginPath();ctx.moveTo(left,bottom);ctx.lineTo(w-18,bottom);ctx.moveTo(left,20);ctx.lineTo(left,bottom);ctx.stroke();
 return {left,top:20,bottom,right:w-18};
}
// 独立概念图：改变 d′ 时，Signal / Noise 分布间距即时变化。
function drawConceptDistribution(d,c){
 const cv=$('demoDistCanvas');if(!cv)return;
 const ctx=cv.getContext('2d'),w=cv.width,h=cv.height;const a=conceptAxis(ctx,w,h);
 const zmin=-4,zmax=4,scale=58;
 const normal=(z,mu)=>Math.exp(-.5*(z-mu)**2)/Math.sqrt(2*Math.PI);
 const px=z=>a.left+(z-zmin)/(zmax-zmin)*(a.right-a.left);
 const py=v=>a.bottom-v*scale;
 ctx.lineWidth=3;
 [['#4b78a8',d/2,'Signal'],['#d58b57',-d/2,'Noise']].forEach(([color,mu,label])=>{
   ctx.strokeStyle=color;ctx.beginPath();
   for(let i=0;i<=240;i++){const z=zmin+(zmax-zmin)*i/240,x=px(z),y=py(normal(z,mu));i?ctx.lineTo(x,y):ctx.moveTo(x,y)}
   ctx.stroke();
   ctx.fillStyle=color;ctx.font='12px sans-serif';ctx.fillText(label,Math.max(a.left+4,Math.min(a.right-45,px(mu))),26);
 });
 const crit=-c;ctx.strokeStyle='#263746';ctx.setLineDash([6,5]);ctx.beginPath();ctx.moveTo(px(crit),20);ctx.lineTo(px(crit),a.bottom);ctx.stroke();ctx.setLineDash([]);
 ctx.fillStyle='#263746';ctx.font='12px sans-serif';ctx.fillText('criterion c',Math.max(a.left+4,Math.min(a.right-70,px(crit)+5)),42);
 ctx.fillStyle='#61727e';ctx.fillText('证据强度 z',a.right-55,h-8);
}
// 独立概念图：改变 d′ 会改变 ROC 形状，改变 c 只移动当前决策点。
function drawConceptROC(d,c){
 const cv=$('demoROCCanvas');if(!cv)return;
 const ctx=cv.getContext('2d'),w=cv.width,h=cv.height;const a=conceptAxis(ctx,w,h);
 ctx.strokeStyle='#c2cbd2';ctx.setLineDash([5,5]);ctx.beginPath();ctx.moveTo(a.left,a.bottom);ctx.lineTo(a.right,a.top);ctx.stroke();ctx.setLineDash([]);
 ctx.strokeStyle='#4b78a8';ctx.lineWidth=3;ctx.beginPath();
 for(let i=0;i<=200;i++){const far=Math.max(.0005,Math.min(.9995,i/200));const hit=normalCDF(invNorm(far)+d);const x=a.left+far*(a.right-a.left),y=a.bottom-hit*(a.bottom-a.top);i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();
 const far=normalCDF(-d/2-c),hr=normalCDF(d/2-c);const x=a.left+far*(a.right-a.left),y=a.bottom-hr*(a.bottom-a.top);
 ctx.fillStyle='#d08a35';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();ctx.fillStyle='#263746';ctx.font='12px sans-serif';ctx.fillText('当前 c',Math.min(a.right-45,x+8),Math.max(a.top+12,y-8));
 ctx.fillStyle='#61727e';ctx.fillText('False Alarm Rate',a.left+(a.right-a.left)/2-45,h-7);ctx.save();ctx.translate(15,h/2+30);ctx.rotate(-Math.PI/2);ctx.fillText('Hit Rate',0,0);ctx.restore();
}
// ==================== 9. 多轮历史记录与比较 ====================
function drawComparison(){const hist=JSON.parse(localStorage.getItem('sdtHistory')||'[]').slice(0,6);const cv=$('compareCanvas');if(!cv)return;const ctx=cv.getContext('2d'),w=cv.width,h=cv.height;ctx.clearRect(0,0,w,h);ctx.fillStyle='#f7f9fa';ctx.fillRect(0,0,w,h);const metric=$('compareMetric')?.value||'d';const labels=hist.slice().reverse();const vals=labels.map(x=>metric==='accuracy'?((x.hit+x.cr)/(x.hit+x.miss+x.fa+x.cr))*100:Number(x[metric]||0));const max=Math.max(...vals.map(v=>Math.abs(v)),1);const left=55,right=w-20,base=h-35,top=25;ctx.strokeStyle='#c5d0d6';ctx.beginPath();ctx.moveTo(left,base);ctx.lineTo(right,base);ctx.stroke();const bw=Math.max(28,(right-left)/Math.max(labels.length,1)*.58);labels.forEach((x,i)=>{const v=vals[i],height=(Math.abs(v)/max)*(base-top-20);const bx=left+(i+.5)*(right-left)/Math.max(labels.length,1)-bw/2;const by=v>=0?base-height:base;ctx.fillStyle=v>=0?'#4b78a8':'#d58b57';ctx.fillRect(bx,by,bw,height);ctx.fillStyle='#263746';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText(metric==='accuracy'?v.toFixed(1)+'%':v.toFixed(2),bx+bw/2, v>=0?by-5:by+15);ctx.fillText((x.strategy||'').toUpperCase()+' / '+(x.difficulty||'').toUpperCase(),bx+bw/2,base+17)});ctx.textAlign='left';ctx.fillStyle='#61727e';ctx.fillText('最近 6 轮实验',left,15)}
$('compareMetric')?.addEventListener('change',drawComparison);
// 使用 localStorage 保存最近 8 轮，刷新页面后仍可读取。
function saveHistory(m){const hist=JSON.parse(localStorage.getItem('sdtHistory')||'[]');hist.unshift({date:new Date().toLocaleString(),strategy:state.strategy,difficulty:state.difficulty,d:m.d,c:m.c,hit:m.hit,miss:m.miss,fa:m.fa,cr:m.cr,score:state.score,accuracy:m.accuracy});localStorage.setItem('sdtHistory',JSON.stringify(hist.slice(0,8)))}
// 将历史实验渲染成表格，并同步更新比较图。
function renderHistory(){const hist=JSON.parse(localStorage.getItem('sdtHistory')||'[]');if(!hist.length){$('historyTable').innerHTML='<p class="muted">暂无历史记录。</p>';return}let html='<table><thead><tr><th>时间</th><th>策略</th><th>难度</th><th>Hit</th><th>FA</th><th>得分</th><th>准确率</th><th>d′</th><th>c</th></tr></thead><tbody>';hist.forEach(x=>html+=`<tr><td>${x.date}</td><td>${x.strategy.toUpperCase()}</td><td>${x.difficulty.toUpperCase()}</td><td>${x.hit}</td><td>${x.fa}</td><td>${x.score??'–'}</td><td>${x.accuracy!=null?(x.accuracy*100).toFixed(1)+'%':'–'}</td><td>${x.d.toFixed(2)}</td><td>${x.c.toFixed(2)}</td></tr>`);html+='</tbody></table>';$('historyTable').innerHTML=html;drawComparison()}
// ==================== 10. 初始化 ====================
choiceSetup();
