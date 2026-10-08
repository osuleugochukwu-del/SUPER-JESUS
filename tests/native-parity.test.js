import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceValues,stochastic} from '../src/indicators.js';

class FakeContext{
  constructor(){this.globalAlpha=1;}
  setTransform(){} clearRect(){} fillRect(){} strokeRect(){} beginPath(){} moveTo(){} lineTo(){} stroke(){} fill(){} closePath(){} rect(){} clip(){} save(){} restore(){} setLineDash(){} fillText(){} drawImage(){}
}
class FakeCanvas{
  constructor(){this.width=0;this.height=0;this.style={};this.listeners=new Map();this.className='';this.tabIndex=0;}
  getContext(){return new FakeContext();} addEventListener(type,fn){this.listeners.set(type,fn);} setPointerCapture(){} remove(){} getBoundingClientRect(){return{width:220,height:160,left:0,top:0};}
}
class FakeHost{constructor(w=220,h=160){this.clientWidth=w;this.clientHeight=h;this.w=w;this.h=h;}replaceChildren(x){this.child=x;}getBoundingClientRect(){return{width:this.w,height:this.h,left:0,top:0};}}
globalThis.window={devicePixelRatio:1,innerWidth:390};
globalThis.document={createElement(tag){return tag==='canvas'?new FakeCanvas():{};}};
globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){}disconnect(){}};
globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
const {createNativeChart,NativeSeries}=await import('../src/native-chart.js');

function bars(n=160){let p=4100;return Array.from({length:n},(_,i)=>{const o=p,c=o+Math.sin(i/8)*.35+.03,h=Math.max(o,c)+.18,l=Math.min(o,c)-.18;p=c;return{time:1791417600+i*60,open:o,high:h,low:l,close:c};});}

test('native price scale owns last/bid/ask labels and candle countdown data',()=>{
  const chart=createNativeChart(new FakeHost(390,620),{majorRoundGrid:true,timezone:'UTC+1 Lagos'});
  const main=chart.addSeries(NativeSeries.CandlestickSeries,{priceFormat:{precision:2},lastValueVisible:true,priceLineVisible:true,priceLineColor:'#00c7b1',showCountdown:true,countdownText:'00:11'},0);
  main.setData(bars());
  main.createPriceLine({price:4108.65,color:'#00c7b1',title:'Bid',axisLabelVisible:true});
  main.createPriceLine({price:4108.85,color:'#f72585',title:'Ask',axisLabelVisible:true});
  const labels=chart._axisLabelCandidates();
  assert.ok(labels.some(x=>x.kind==='last'&&x.countdown==='00:11'));
  assert.ok(labels.some(x=>x.title==='Bid'));
  assert.ok(labels.some(x=>x.title==='Ask'));
});

test('oscillator panes enforce fixed 0-100 range and custom guides',()=>{
  const chart=createNativeChart(new FakeHost(500,500),{});
  const main=chart.addSeries(NativeSeries.CandlestickSeries,{priceFormat:{precision:2}},0);main.setData(bars());
  const st=chart.addSeries(NativeSeries.LineSeries,{color:'#18b7c8'},1);st.setData(bars().map((b,i)=>({time:b.time,value:30+(i%50)})));
  chart.setPaneOptions(1,{range:{min:0,max:100},guides:[20,50,80],title:'Stochastic'});
  assert.deepEqual(chart._rawPaneRange(1),{min:0,max:100});
  assert.deepEqual(chart.paneOptions.get(1).guides,[20,50,80]);
});

test('visible ranges cannot be dragged completely away from all chart data',()=>{
  const chart=createNativeChart(new FakeHost(600,400),{timeScale:{rightOffset:12,barSpacing:7,minBarSpacing:.45}});
  const main=chart.addSeries(NativeSeries.CandlestickSeries,{priceFormat:{precision:2}},0);main.setData(bars(240));
  for(let i=0;i<1000;i++){
    const from=-100000+i*211,to=from+10+(i%700);
    chart.timeScale().setVisibleLogicalRange({from,to});
    const r=chart.timeScale().getVisibleLogicalRange();
    assert.ok(r.to>=0,'range moved fully before history');
    assert.ok(r.from<=239,'range moved fully after history');
    assert.ok(r.to>r.from);
  }
});

test('small mobile panes use their real dimensions rather than a phantom minimum canvas',()=>{
  const host=new FakeHost(180,120),chart=createNativeChart(host,{});chart.resize();assert.equal(chart.width,180);assert.equal(chart.height,120);
});

test('indicator source selection changes source values and stochastic %D waits for real %K samples',()=>{
  const b=[{open:1,high:4,low:0,close:3},{open:2,high:5,low:1,close:4},{open:3,high:6,low:2,close:5},{open:4,high:7,low:3,close:6},{open:5,high:8,low:4,close:7}];
  assert.deepEqual(sourceValues(b,'open'),[1,2,3,4,5]);
  assert.deepEqual(sourceValues(b,'hl2'),[2,3,4,5,6]);
  const x=stochastic(b.map(x=>x.high),b.map(x=>x.low),b.map(x=>x.close),3,2);
  assert.equal(x.k[0],null);assert.equal(x.k[1],null);assert.equal(x.d[2],null);assert.ok(Number.isFinite(x.d[3]));
});

test('percent and indexed scales label transformed values instead of raw prices',()=>{
  const chart=createNativeChart(new FakeHost(600,400),{rightPriceScale:{mode:NativeSeries.PriceScaleMode.Percentage}});
  const main=chart.addSeries(NativeSeries.LineSeries,{priceFormat:{precision:2}},0);main.setData(bars());chart.timeScale().setVisibleLogicalRange({from:60,to:159});
  assert.ok(chart._axisTicks(0,8).every(t=>t.label.endsWith('%')));
  chart.priceScale().applyOptions({mode:NativeSeries.PriceScaleMode.IndexedTo100});
  assert.ok(chart._axisTicks(0,8).every(t=>!t.label.endsWith('%')));
});
