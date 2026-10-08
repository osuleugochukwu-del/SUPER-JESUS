import test from 'node:test';
import assert from 'node:assert/strict';
import {generateBars,buildPeriodBars,periodLabel,SYMBOLS} from '../src/data.js';

test('Renko pips, Renko time and Range pips are separate period modes',()=>{
  const raw=generateBars('XAUUSD','1s',4000);
  const rp=buildPeriodBars(raw,'XAUUSD',{mode:'renko-pips',value:5},{});
  const rt=buildPeriodBars(raw,'XAUUSD',{mode:'renko-time',value:'1m'},{renkoPips:5});
  const rg=buildPeriodBars(raw,'XAUUSD',{mode:'range-pips',value:5},{});
  assert.ok(rp.length>0);assert.ok(rt.length>0);assert.ok(rg.length>0);
  assert.notEqual(periodLabel({mode:'renko-pips',value:5}),periodLabel({mode:'renko-time',value:'1m'}));
  assert.equal(SYMBOLS.XAUUSD.pipSize,0.10);
});
