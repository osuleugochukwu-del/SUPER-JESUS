import test from 'node:test';
import assert from 'node:assert/strict';
import { renkoBars } from '../src/data.js';

test('renko continuation uses one brick and reversal waits for two bricks',()=>{
  const bars=[
    {time:1,open:100,high:102,low:100,close:102,volume:1},
    {time:2,open:102,high:102,low:101.1,close:101.1,volume:1},
    {time:3,open:101.1,high:101.1,low:100,close:100,volume:1},
  ];
  const r=renkoBars(bars,1);
  assert.ok(r.length>=3);
  assert.equal(r[0].renkoDirection,1);
  assert.equal(r[1].renkoDirection,1);
  assert.ok(r.some(x=>x.renkoDirection===-1));
});
