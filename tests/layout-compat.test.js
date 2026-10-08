import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const pane=fs.readFileSync(new URL('../src/chart-pane.js',import.meta.url),'utf8');
const native=fs.readFileSync(new URL('../src/native-chart.js',import.meta.url),'utf8');
const master=fs.readFileSync(new URL('../src/master-recovery.js',import.meta.url),'utf8');

test('Full Native restores the approved shell price-axis footprint',()=>{
  assert.match(pane,/minimumWidth:window\.innerWidth<=780\?42:46/);
  assert.match(native,/const shellAxis=this\.width<=780\?42:46/);
});

test('Compact Native axis labels fit inside the restored shell',()=>{
  assert.match(native,/const measured=\(\)=>typeof ctx\.measureText===\'function\'/);
  assert.match(native,/while\(fs>7&&measured\(\)>w-8\)/);
  assert.match(native,/ctx\.fillText\(label,x\+4,y,Math\.max\(1,w-7\)\)/);
});

test('Construction menu cannot render a null period label',()=>{
  assert.match(master,/displayLabel=\(label==null\|\|label===''/);
  assert.match(master,/describePeriod\(period\)/);
});
