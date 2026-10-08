import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  clonePeriod, constructionId, resolveConstruction,
  historyPlanForPeriod, defaultHomeBars, isSameConstruction
} from '../src/chart-transition.js';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const pane=fs.readFileSync(new URL('../src/chart-pane.js',import.meta.url),'utf8');
const recovery=fs.readFileSync(new URL('../src/master-recovery.js',import.meta.url),'utf8');
const native=fs.readFileSync(new URL('../src/native-v27-renderer.js',import.meta.url),'utf8');

test('all public chart changes route through one app transition controller',()=>{
  assert.match(app,/applyChartTransition\(nextConfig=\{\},options=\{\}\)/);
  assert.match(app,/setPeriod\(period\)\{return this\.applyChartTransition/);
  assert.match(app,/setTimeframe\(tf\)\{return this\.applyChartTransition/);
  assert.match(app,/setConstruction\(chartType,period,options=\{\}\)\{return this\.applyChartTransition/);
  assert.doesNotMatch(recovery,/app\.setPeriod\s*=/);
  assert.doesNotMatch(native,/app\.setPeriod\s*=/);
});

test('construction resolution keeps Renko and Range out of Heiken layering',()=>{
  assert.deepEqual(resolveConstruction({chartType:'Heikin-Ashi',period:{mode:'renko-pips',value:5}}),{
    chartType:'Candles',period:{mode:'renko-pips',value:5},construction:'renko-pips'
  });
  assert.equal(constructionId('Heikin-Ashi',{mode:'time',value:'1m'}),'heikin');
  assert.equal(constructionId('Candles',{mode:'renko-time',value:'15m'}),'renko-time');
  assert.ok(isSameConstruction(
    {chartType:'Candles',period:{mode:'time',value:'1m'}},
    {chartType:'Candles',period:{mode:'time',value:'5m'}}
  ));
});

test('Renko Time history scales with the selected interval',()=>{
  const short=historyPlanForPeriod({mode:'renko-time',value:'15s'});
  const hour=historyPlanForPeriod({mode:'renko-time',value:'1h'});
  assert.equal(short.baseTimeframe,'1s');
  assert.equal(hour.baseTimeframe,'1m');
  assert.ok(hour.count>=20000);
  assert.ok(short.count>=6000);
});

test('Home is a hard chart refresh path and cancels stale transition frames',()=>{
  assert.match(pane,/hardHome\(\)/);
  assert.match(pane,/\+\+this\.transitionToken/);
  assert.match(pane,/cancelAnimationFrame\(this\.transitionFrame\)/);
  assert.match(pane,/autoScale:true/);
  assert.match(pane,/nativeV27Renderer\?\.render/);
  assert.match(recovery,/pane\.hardHome\?\.\(\)/);
});

test('new construction rebuilds do not restore the old logical range',()=>{
  assert.match(pane,/rebuildSeries\(\{preserveVisibleRange:false\}\)/);
  assert.match(pane,/rebuildSeries\(\{preserveVisibleRange=true\}=\{\}\)/);
  assert.match(pane,/scheduleTransitionView/);
});

test('construction tabs are navigation-only and every period row restores favourites',()=>{
  assert.match(recovery,/Tabs are navigation only/);
  assert.doesNotMatch(recovery,/const applyTab=id=>/);
  assert.match(recovery,/master-period-star/);
  assert.match(recovery,/toggleFavoritePeriod/);
});

test('full native mode renders price indicators directly without compatibility hiding',()=>{
  assert.match(pane,/createNativeChart/);
  assert.match(native,/architecture:'full-native'/);
  assert.doesNotMatch(native,/applyOverlayIndicatorVisibility/);
});

test('home bar targets give Renko a readable starting density',()=>{
  assert.equal(defaultHomeBars({period:clonePeriod({mode:'renko-pips',value:5}),isMobile:false,length:500}),78);
  assert.equal(defaultHomeBars({period:clonePeriod({mode:'renko-time',value:'1m'}),isMobile:true,length:500}),46);
  assert.equal(defaultHomeBars({period:clonePeriod({mode:'time',value:'15s'}),isMobile:false,length:500,desktop:180}),180);
});
