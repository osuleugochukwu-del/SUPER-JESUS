import test from 'node:test';import assert from 'node:assert/strict';
import {generateBars,heikinAshi,niceStep,renkoBars,rangeBars} from '../src/data.js';
test('deterministic bars have OHLC integrity',()=>{const b=generateBars('XAUUSD','15s',200);assert.equal(b.length,200);for(const x of b){assert.ok(x.high>=Math.max(x.open,x.close));assert.ok(x.low<=Math.min(x.open,x.close));}});
test('heikin ashi preserves length and valid ranges',()=>{const h=heikinAshi(generateBars('EURUSD','1m',100));assert.equal(h.length,100);for(const x of h){assert.ok(x.high>=x.open&&x.high>=x.close);assert.ok(x.low<=x.open&&x.low<=x.close);}});
test('niceStep chooses human round intervals',()=>{assert.equal(niceStep(100,10),10);assert.ok([1,2,2.5,5,10].some(x=>Math.abs(niceStep(7,7)-x)<1e-9));});
test('renko and range builders return data',()=>{const b=generateBars('NAS100','1m',500);assert.ok(renkoBars(b,4).length>0);assert.ok(rangeBars(b,8).length>0);});
