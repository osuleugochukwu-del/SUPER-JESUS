import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_INDICATORS,makeIndicator,computeIndicator,valuesToData} from '../src/indicators.js';
import {generateBars} from '../src/data.js';

test('professional indicator library contains core families',()=>{
  const kinds=new Set(BUILTIN_INDICATORS.map(x=>x.kind));
  for(const k of ['ema','sma','rsi','macd','stochastic','bollinger','atr','adx','vwap','volume'])assert.ok(kinds.has(k));
});

test('replay truncates indicator series at replay cursor',()=>{
  const bars=generateBars('EURUSD','1m',300),ind=makeIndicator('ema',{length:20});
  const x=computeIndicator(ind,bars),values=x.series[0].values;
  const data=valuesToData(bars,values,120);
  assert.ok(data.length<=121);
  assert.ok(data.at(-1).time<=bars[120].time);
});
