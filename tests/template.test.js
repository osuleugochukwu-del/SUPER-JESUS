import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultState,captureChartTemplate,applyChartTemplateToState,cloneSerializable,captureWorkspace,applyWorkspaceToState} from '../src/state.js';

test('chart template captures indicators and appearance but not symbol/account/drawings',()=>{
  const s=cloneSerializable(defaultState);
  s.symbol='EURUSD';
  s.background='#222222';
  s.indicators=[{id:'ema200',kind:'ema',name:'EMA 200',length:200,color:'#abcdef',visible:true,lineWidth:2,source:'close'}];
  s.drawings=[{id:'d1',type:'trend'}];
  s.connection={status:'live',account:{id:'secret-account'}};
  const t=captureChartTemplate(s,{name:'Trend Setup',chartType:'Candles',period:{mode:'time',value:'15m'},includePeriod:false});
  assert.equal(t.name,'Trend Setup');
  assert.equal(t.config.chartType,'Candles');
  assert.equal(t.config.period,undefined);
  assert.equal(t.config.background,'#222222');
  assert.equal(t.config.indicators[0].length,200);
  assert.equal(t.config.symbol,undefined);
  assert.equal(t.config.connection,undefined);
  assert.equal(t.config.drawings,undefined);
});

test('chart template can optionally capture any period and safely restore chart fields',()=>{
  const source=cloneSerializable(defaultState);
  source.candleStyle.upBody='#123456';
  source.quickTrade=false;
  source.indicators=[{id:'ema50x',kind:'ema',name:'EMA 50',length:50,color:'#fff000',visible:false,lineWidth:3,source:'close'}];
  const period={mode:'renko-pips',value:5};
  const t=captureChartTemplate(source,{name:'Reusable',chartType:'Candles',period,includePeriod:true});
  const target=cloneSerializable(defaultState);
  target.symbol='XAUUSD';
  target.drawings=[{id:'keep-me',type:'horizontal'}];
  applyChartTemplateToState(target,t);
  assert.deepEqual(t.config.period,period);
  assert.equal(target.candleStyle.upBody,'#123456');
  assert.equal(target.quickTrade,false);
  assert.equal(target.indicators[0].visible,false);
  assert.equal(target.symbol,'XAUUSD');
  assert.equal(target.drawings.length,1);
  assert.equal(target.activeChartTemplateId,t.id);
});

test('workspace captures multi-chart layout separately from chart templates',()=>{
  const s=cloneSerializable(defaultState);
  s.layout='4';
  s.paneConfigs=[
    {symbol:'XAUUSD',chartType:'Candles',period:{mode:'renko-pips',value:5}},
    {symbol:'EURUSD',chartType:'Candles',period:{mode:'time',value:'5m'}}
  ];
  const ws=captureWorkspace(s,{name:'Multi Monitor'});
  const target=cloneSerializable(defaultState);
  applyWorkspaceToState(target,ws);
  assert.equal(target.layout,'4');
  assert.equal(target.paneConfigs.length,2);
  assert.equal(target.paneConfigs[0].period.mode,'renko-pips');
});
