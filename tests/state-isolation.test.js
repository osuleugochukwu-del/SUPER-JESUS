import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadState} from '../src/state.js';

const stateSource=fs.readFileSync(new URL('../src/state.js',import.meta.url),'utf8');

test('Full Native uses repository-isolated storage and only imports old key as legacy',()=>{
  assert.match(stateSource,/const KEY='tradeAvataFullNativeV10State'/);
  assert.match(stateSource,/LEGACY_KEYS=\['tradeAvataChartV8State'/);
  assert.match(stateSource,/normalizeFullNativeState/);
});

test('Full Native sanitizes layout and chart geometry before startup',()=>{
  assert.match(stateSource,/VALID_LAYOUTS=new Set/);
  assert.match(stateSource,/barSpacing:clampNumber/);
  assert.match(stateSource,/s\.paneConfigs=Array\.from/);
  assert.match(stateSource,/delete s\.ui\.visibleRange/);
});

test('legacy state migrates once into isolated Full Native storage without corrupt viewport values',()=>{
  const store=new Map();
  const legacy={
    layout:'2h',activePane:9,
    paneConfigs:[
      {symbol:'XAUUSD',chartType:'Candles',period:{mode:'time',value:'1m'}},
      {symbol:'EURUSD',chartType:'Heikin-Ashi',period:{mode:'time',value:'5m'}}
    ],
    chartSettings:{barSpacing:999,rightOffset:-50,topMargin:9,bottomMargin:-3,homeBarsDesktop:9999,homeBarsMobile:1},
    favoritePeriods:[null,{mode:'time',value:'15s'}],
    ui:{visibleRange:{from:999999,to:1000000},manualRange:{min:-1,max:1},lockedCursorTime:null},
    drawings:[{id:'d1',type:'trend',points:[]}]
  };
  store.set('tradeAvataChartV8State',JSON.stringify(legacy));
  global.localStorage={
    getItem:k=>store.has(k)?store.get(k):null,
    setItem:(k,v)=>store.set(k,String(v)),
    removeItem:k=>store.delete(k)
  };
  const state=loadState();
  assert.equal(state.layout,'2h');
  assert.equal(state.paneConfigs.length,2);
  assert.equal(state.paneConfigs[1].symbol,'EURUSD');
  assert.equal(state.activePane,1);
  assert.equal(state.chartSettings.barSpacing,20);
  assert.equal(state.chartSettings.rightOffset,0);
  assert.equal(state.chartSettings.topMargin,.35);
  assert.equal(state.chartSettings.bottomMargin,0);
  assert.equal(state.chartSettings.homeBarsDesktop,400);
  assert.equal(state.chartSettings.homeBarsMobile,40);
  assert.deepEqual(state.favoritePeriods,[{mode:'time',value:'15s'}]);
  assert.equal(state.drawings.length,1);
  assert.equal('visibleRange' in state.ui,false);
  assert.equal('manualRange' in state.ui,false);
  assert.ok(store.has('tradeAvataFullNativeV10State'));
  assert.ok(store.has('tradeAvataChartV8State'),'legacy key must remain untouched for the older repository');

  // Once isolated state exists, later changes to the old key must not affect Full Native.
  store.set('tradeAvataChartV8State',JSON.stringify({layout:'4'}));
  const second=loadState();
  assert.equal(second.layout,'2h');
});
