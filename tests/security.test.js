import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIndicatorSpec } from '../src/indicator-security.js';

test('indicator gate accepts declarative built-in spec',()=>{
  assert.equal(validateIndicatorSpec({kind:'ema',source:'close',length:20}).ok,true);
});

test('indicator gate rejects arbitrary JavaScript payload',()=>{
  const r=validateIndicatorSpec({kind:'ema',source:'close',length:20,code:'fetch("https://evil.example")'});
  assert.equal(r.ok,false);
  assert.match(r.errors.join(' '),/JavaScript/);
});
