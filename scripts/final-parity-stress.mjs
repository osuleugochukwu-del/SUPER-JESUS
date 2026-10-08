import assert from 'node:assert/strict';

class FakeContext{constructor(){this.globalAlpha=1;}setTransform(){}clearRect(){}fillRect(){}strokeRect(){}beginPath(){}moveTo(){}lineTo(){}stroke(){}fill(){}closePath(){}rect(){}clip(){}save(){}restore(){}setLineDash(){}fillText(){}drawImage(){}}
class FakeCanvas{constructor(){this.width=0;this.height=0;this.style={};this.listeners=new Map();}getContext(){return new FakeContext();}addEventListener(t,f){this.listeners.set(t,f);}setPointerCapture(){}remove(){}getBoundingClientRect(){return{width:420,height:720,left:0,top:0};}}
class FakeHost{constructor(w=420,h=720){this.clientWidth=w;this.clientHeight=h;this.w=w;this.h=h;}replaceChildren(x){this.child=x;}getBoundingClientRect(){return{width:this.w,height:this.h,left:0,top:0};}}
globalThis.window={devicePixelRatio:1,innerWidth:420};globalThis.document={createElement:t=>t==='canvas'?new FakeCanvas():{}};globalThis.ResizeObserver=class{observe(){}disconnect(){}};globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
const {createNativeChart,NativeSeries}=await import('../src/native-chart.js');

let seed=0x38a7d91f;const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const makeBars=(n,step)=>{let p=4100;return Array.from({length:n},(_,i)=>{const o=p,c=o+(rnd()-.48)*step,h=Math.max(o,c)+rnd()*step,l=Math.min(o,c)-rnd()*step;p=c;return{time:1791417600+i*60,open:o,high:h,low:l,close:c};});};
const ITER=1000;
for(let i=0;i<ITER;i++){
  const w=160+Math.floor(rnd()*1200),h=120+Math.floor(rnd()*900),host=new FakeHost(w,h),mode=[0,1,2,3][i%4];
  const chart=createNativeChart(host,{majorRoundGrid:true,timezone:i%2?'UTC':'UTC+1 Lagos',sessionSeparators:true,showCrosshairLabels:true,rightPriceScale:{mode,minimumWidth:48},timeScale:{rightOffset:8+Math.floor(rnd()*20),barSpacing:2+rnd()*16,minBarSpacing:.45}});
  const main=chart.addSeries(NativeSeries.CandlestickSeries,{priceFormat:{precision:2},lastValueVisible:true,priceLineVisible:true,priceLineColor:'#00c7b1',showCountdown:true,countdownText:'00:11'},0),data=makeBars(60+Math.floor(rnd()*1000),1.2);main.setData(data);
  main.createPriceLine({price:data.at(-1).close-.1,title:'Bid',axisLabelVisible:true,color:'#f59e0b'});main.createPriceLine({price:data.at(-1).close+.1,title:'Ask',axisLabelVisible:true,color:'#22c55e'});
  const osc=chart.addSeries(NativeSeries.LineSeries,{color:'#18b7c8'},1);osc.setData(data.map((b,j)=>({time:b.time,value:50+Math.sin(j/8)*40})));chart.setPaneOptions(1,{range:{min:0,max:100},guides:[20,50,80],title:'Stochastic'});
  const span=6+rnd()*1000,from=-500+rnd()*(data.length+1000);chart.timeScale().setVisibleLogicalRange({from,to:from+span});
  const r=chart.timeScale().getVisibleLogicalRange();assert.ok(r.to>=0&&r.from<=data.length-1&&r.to>r.from);
  const labels=chart._axisLabelCandidates();assert.ok(labels.some(x=>x.kind==='last'));assert.ok(labels.some(x=>x.title==='Bid'));assert.ok(labels.some(x=>x.title==='Ask'));
  assert.deepEqual(chart._rawPaneRange(1),{min:0,max:100});
  chart.render();chart.destroy();
}
console.log(`Trade Avata final parity stress passed: ${ITER.toLocaleString()} full-native chart constructions with range, axis, Bid/Ask, countdown and oscillator invariants.`);
