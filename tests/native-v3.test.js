import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {
  TA_NATIVE_V3_BUILD,nativeWindow,xForIndex,indexForX,autoPriceRange,
  yForPrice,priceForY,scaleRange,preservePriceAnchor,priceTicks,
  timeTickIndices,homeSpacing,indicatorRange,validateNativeWindow
} from '../src/native-v3-core.js';

const page=fs.readFileSync(new URL('../engines/trade-avata-native-chart-v3.0.html',import.meta.url),'utf8');

test('Native v3 core identifies the full native build',()=>{
  assert.match(TA_NATIVE_V3_BUILD,/Native Engine v3\.0/);
});

test('Native v3 logical X coordinates round-trip without chart-library coordinates',()=>{
  const win=nativeWindow({length:500,plotWidth:900,spacing:8,scrollBars:0,liveGapPercent:10});
  assert.equal(validateNativeWindow(win,500),true);
  for(const i of [win.start,Math.floor((win.start+win.end)/2),win.end]){
    const x=xForIndex(i,win),j=indexForX(x,win);
    assert.ok(Math.abs(i-j)<1e-9);
  }
});

test('Native v3 price coordinates round-trip',()=>{
  const range={min:4100,max:4200};
  for(const p of [4100,4125,4150,4199.5,4200]){
    const y=yForPrice(p,range,0,600),q=priceForY(y,range,0,600);
    assert.ok(Math.abs(p-q)<1e-9);
  }
});

test('Native v3 auto price range contains all visible OHLC values',()=>{
  const bars=[
    {open:100,high:105,low:98,close:103},
    {open:103,high:111,low:102,close:109},
    {open:109,high:110,low:101,close:102}
  ];
  const r=autoPriceRange(bars,{start:0,end:2,pad:.08});
  assert.ok(r.min<98);
  assert.ok(r.max>111);
});

test('Native v3 vertical scaling preserves the selected anchor price',()=>{
  const r={min:100,max:200},anchor=160,ratio=.4;
  const s=scaleRange(r,.5,anchor,ratio);
  const reconstructed=s.max-(s.max-s.min)*ratio;
  assert.ok(Math.abs(reconstructed-anchor)<1e-9);
});

test('Native v3 timeframe price-anchor recovery keeps price in the requested zone',()=>{
  const base={min:300,max:500},anchor=425,ratio=.35;
  const r=preservePriceAnchor(null,base,anchor,ratio);
  const yRatio=(r.max-anchor)/(r.max-r.min);
  assert.ok(Math.abs(yRatio-ratio)<1e-9);
});

test('Native v3 generates usable price and time ticks',()=>{
  const pt=priceTicks({min:4100,max:4160},8);
  assert.ok(pt.length>=3);
  const win=nativeWindow({length:1000,plotWidth:1000,spacing:7});
  const tt=timeTickIndices(win,8);
  assert.ok(tt.length>=3);
});

test('Native v3 Home spacing remains readable',()=>{
  const s=homeSpacing(1000,80,10);
  assert.ok(s>=1.25&&s<=32);
});

test('Native v3 oscillator range includes guides and values',()=>{
  const r=indicatorRange([{values:[null,30,40,55,70]}],1,4,{guides:[20,80]});
  assert.ok(r.min<20&&r.max>80);
});

test('Native v3 laboratory has no Lightweight Charts or TradingView dependency',()=>{
  assert.doesNotMatch(page,/LightweightCharts/);
  assert.doesNotMatch(page,/lightweight-charts/);
  assert.doesNotMatch(page,/unpkg\.com\/lightweight-charts/i);
  assert.doesNotMatch(page,/window\.LightweightCharts/);
  assert.match(page,/NO TRADINGVIEW · NO LIGHTWEIGHT CHARTS/);
});



test('Native v3 browser module has valid JavaScript syntax',()=>{
  const start=page.indexOf('<script type="module">')+'<script type="module">'.length;
  const end=page.indexOf('</script>',start);
  assert.ok(start>0&&end>start);
  const file=path.join(os.tmpdir(),`ta-native-v3-${process.pid}.mjs`);
  fs.writeFileSync(file,page.slice(start,end));
  const r=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  fs.rmSync(file,{force:true});
  assert.equal(r.status,0,r.stderr||r.stdout);
});
test('Native v3 laboratory owns axes, crosshair, Home, Renko and native drawing coordinates',()=>{
  for(const marker of[
    'drawAxes(g,range,win,bars)',
    'drawCrosshair(g,range,win,bars)',
    'home(){',
    "this.period.mode==='renko-pips'",
    'drawingPoint(pt,g,range,win)',
    'priceForY',
    'indexForX'
  ])assert.ok(page.includes(marker),`missing ${marker}`);
});
