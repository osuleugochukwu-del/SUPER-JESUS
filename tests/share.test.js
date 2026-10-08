import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharePayload,encodeSharePayload,decodeSharePayload,buildStatelessShareUrl,readStatelessShareUrl,normalizeShareStatus,buildShareSummary} from '../src/share.js';

test('share payload round-trips without image storage',()=>{
  const payload=createSharePayload({kind:'chart',status:'DEMO',ref:'ta-demo',chart:{symbol:'XAUUSD',period:{mode:'time',value:'15s'},chartType:'Candles'},indicators:[{id:'ema20',kind:'ema',name:'EMA 20',length:20,color:'#178eff'}]});
  const encoded=encodeSharePayload(payload),decoded=decodeSharePayload(encoded);
  assert.equal(decoded.chart.symbol,'XAUUSD');
  assert.equal(decoded.status,'DEMO');
  assert.equal(decoded.indicators[0].kind,'ema');
  assert.equal('image' in decoded,false);
});

test('stateless share link carries compact payload in hash',()=>{
  const payload=createSharePayload({kind:'replay',status:'REPLAY',ref:'ta-r1',chart:{symbol:'EURUSD',period:{mode:'renko-pips',value:5},chartType:'Candles'},replay:{index:50,total:100,progressPct:50}});
  const url=buildStatelessShareUrl(payload,'https://example.com/chart/');
  assert.match(url,/#ta-share=/);
  const decoded=readStatelessShareUrl(url);
  assert.equal(decoded.kind,'replay');
  assert.equal(decoded.ref,'ta-r1');
  assert.equal(decoded.replay.progressPct,50);
});

test('verification labels prioritize simulation modes',()=>{
  assert.equal(normalizeShareStatus({kind:'replay',connectionStatus:'live'}),'REPLAY');
  assert.equal(normalizeShareStatus({kind:'backtest',connectionStatus:'live'}),'BACKTEST');
  assert.equal(normalizeShareStatus({kind:'chart',connectionStatus:'live'}),'LIVE');
  assert.equal(normalizeShareStatus({kind:'chart',connectionStatus:'demo'}),'DEMO');
});

test('trade summary clearly includes verification and risk reward',()=>{
  const payload=createSharePayload({kind:'trade',status:'DEMO',chart:{symbol:'XAUUSD',period:{mode:'time',value:'15s'},chartType:'Candles'},drawing:{type:'long',points:[{price:100},{price:110},{price:95}]}});
  const text=buildShareSummary(payload);
  assert.match(text,/\[DEMO\]/);
  assert.match(text,/R:R 2\.00/);
  assert.match(text,/Trade Avata/);
});
