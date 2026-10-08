import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarketBars, buildHeatmap, buildScreener, marketSentiment, buildAIContext } from '../src/market-intelligence.js';

test('market snapshot exposes structured analysis fields',()=>{
  const x=analyzeMarketBars('XAUUSD','15m');
  assert.equal(x.symbol,'XAUUSD');
  assert.ok(['bullish','bearish','neutral'].includes(x.direction));
  assert.ok(Number.isFinite(x.support));
  assert.ok(Number.isFinite(x.resistance));
  assert.ok(x.summary.length>20);
  assert.ok(x.scenario.length>20);
});

test('heat map and screener cover supplied symbols',()=>{
  const syms=['XAUUSD','EURUSD','GBPUSD'];
  assert.equal(buildHeatmap(syms,'15m').length,3);
  const rows=buildScreener(syms,'15m');
  assert.equal(rows.length,3);
  assert.ok(rows.every(x=>['Buy','Sell','Neutral'].includes(x.signal)));
});

test('market sentiment percentages form a complete distribution',()=>{
  const s=marketSentiment(buildScreener(['XAUUSD','EURUSD','GBPUSD','BTCUSD'],'15m'));
  assert.ok(Math.abs((s.bullish+s.neutral+s.bearish)-100)<=1);
});

test('AI context contains structured market and indicator data',()=>{
  const snap=analyzeMarketBars('EURUSD','1h');
  const ctx=buildAIContext(snap,[{name:'EMA 20',kind:'ema',length:20,pane:'price',visible:true}]);
  assert.equal(ctx.symbol,'EURUSD');
  assert.equal(ctx.indicators.length,1);
  assert.equal(ctx.indicators[0].kind,'ema');
});
