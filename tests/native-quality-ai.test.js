import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const chart=fs.readFileSync(new URL('../src/native-chart.js',import.meta.url),'utf8');
const pane=fs.readFileSync(new URL('../src/chart-pane.js',import.meta.url),'utf8');
const recovery=fs.readFileSync(new URL('../src/master-recovery.js',import.meta.url),'utf8');
const bridge=fs.readFileSync(new URL('../src/native-v27-renderer.js',import.meta.url),'utf8');
const quality=fs.readFileSync(new URL('../src/chart-quality-ai.js',import.meta.url),'utf8');
const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server/app.py',import.meta.url),'utf8');

test('full native renderer is the only production chart engine',()=>{
  assert.match(chart,/Trade Avata Native Chart v3\.2/);
  assert.match(pane,/createNativeChart/);
  assert.match(bridge,/architecture:'full-native'/);
  assert.match(recovery,/FULL NATIVE · ACTIVE/);
  assert.doesNotMatch(index,/unpkg\.com/);
  assert.doesNotMatch(index,/lightweight-charts/i);
  assert.doesNotMatch(pane,/window\.LightweightCharts/);
});

test('native chart owns axes coordinates crosshair panes and screenshot',()=>{
  for(const key of ['NativeTimeScale','NativePriceScale','logicalToCoordinate','coordinateToLogical','priceToCoordinate','coordinateToPrice','subscribeCrosshairMove','setCrosshairPosition','panes()','takeScreenshot'])assert.match(chart,new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('native chart owns candles bars lines area histogram and Renko bodies',()=>{
  for(const key of ['_drawCandles','_drawBars','_drawLine','_drawHistogram','renko-pips','renko-time','constructionMode'])assert.match(chart,new RegExp(key));
  assert.match(chart,/spacing\*\.96/);
});

test('native chart owns desktop and mobile interaction primitives',()=>{
  for(const key of ["kind:'pinch'","kind:'pan'","kind:'price'","kind:'timezoom'","kind:'separator'",'wheel','dblclick'])assert.match(chart,new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
});

test('native chart supports oscillator pane resizing and guides',()=>{
  assert.match(chart,/paneHeights/);
  assert.match(chart,/setHeight\(h\)/);
  assert.match(chart,/priceLines/);
  assert.match(recovery,/OSC_GUIDES/);
});

test('Chart Quality AI remains owner-only',()=>{
  assert.match(recovery,/installChartQualityAI\s*\(\s*app\s*\)/);
  assert.match(quality,/u\.role==='owner'/);
  assert.doesNotMatch(quality,/u\.role==='admin'/);
  assert.match(quality,/Trade Avata Native v3\.2/);
});

test('quality monitor measures native paint frame rate and errors',()=>{
  for(const key of ['recordNativeRender','fps_sample','long_task','oscillator_height_drift','series_rebuild'])assert.match(quality,new RegExp(key));
});

test('quality AI retains local fallback and backend quality channel',()=>{
  assert.match(quality,/localAnswer/);
  assert.match(quality,/channel\s*:\s*'quality'/);
  assert.match(server,/quality/);
});
