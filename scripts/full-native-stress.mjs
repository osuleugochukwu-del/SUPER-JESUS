import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateBars,buildPeriodBars,heikinAshi,SYMBOLS} from '../src/data.js';
import {nativeWindow,xForIndex,indexForX,autoPriceRange,yForPrice,priceForY,scaleRange,priceTicks,timeTickIndices} from '../src/native-v3-core.js';
import {resolveConstruction,historyPlanForPeriod,defaultHomeBars} from '../src/chart-transition.js';

const ITER=100000;
let seed=0x715a9e31;
const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const modes=[
  {mode:'time',value:'15s'},{mode:'time',value:'5m'},
  {mode:'renko-pips',value:5},{mode:'renko-pips',value:20},
  {mode:'renko-time',value:'1m'},{mode:'renko-time',value:'15m'},
  {mode:'range-pips',value:10}
];
for(let k=0;k<ITER;k++){
  const length=40+Math.floor(rnd()*3000),width=260+rnd()*1800,spacing=.8+rnd()*24,scroll=-20+rnd()*60;
  const win=nativeWindow({length,plotWidth:width,spacing,scrollBars:scroll,liveGapPercent:rnd()*25});
  assert.ok(win.spacing>0);assert.ok(win.start>=0&&win.end<length&&win.end>=win.start);
  const i=win.start+Math.floor(rnd()*(win.end-win.start+1));const x=xForIndex(i,win),back=indexForX(x,win);assert.ok(Math.abs(back-i)<1e-8);
  const lo=1+rnd()*5000,hi=lo+.01+rnd()*500;const range={min:lo,max:hi},price=lo+rnd()*(hi-lo),top=rnd()*50,height=120+rnd()*1200;
  const y=yForPrice(price,range,top,height),p=priceForY(y,range,top,height);assert.ok(Math.abs(p-price)<1e-7*Math.max(1,price));
  const scaled=scaleRange(range,.3+rnd()*3,price,rnd());assert.ok(scaled.max>scaled.min);
  assert.ok(priceTicks(range,8).length>0);assert.ok(timeTickIndices(win,8).length>0);
  const period=modes[Math.floor(rnd()*modes.length)],ct=rnd()<.25?'Heikin-Ashi':'Candles';const resolved=resolveConstruction({chartType:ct,period});assert.ok(resolved.period.mode);const plan=historyPlanForPeriod(period);assert.ok(plan.count>0);assert.ok(defaultHomeBars({period,isMobile:rnd()<.5,length})>0);
}

const bars=generateBars('XAUUSD','1s',12000);
for(const period of modes.filter(x=>x.mode!=='time')){
  const out=buildPeriodBars(bars,'XAUUSD',period,{renkoPips:5,rangePips:5});assert.ok(out.length>0);
  const ha=heikinAshi(out);assert.equal(ha.length,out.length);
  const r=autoPriceRange(out,{start:Math.max(0,out.length-100),end:out.length-1});assert.ok(r.max>r.min);
}

const runtimeFiles=['index.html','src/app.js','src/chart-pane.js','src/native-chart.js','src/native-v27-renderer.js','src/master-recovery.js','sw.js'];
for(const f of runtimeFiles){const t=fs.readFileSync(new URL('../'+f,import.meta.url),'utf8');assert.doesNotMatch(t,/lightweight-charts|LightweightCharts|unpkg\.com\/lightweight/i,`${f} still carries an external chart renderer`);}
console.log(`Trade Avata Full Native stress passed: ${ITER.toLocaleString()} randomized geometry/transition cases + construction integrity checks.`);
