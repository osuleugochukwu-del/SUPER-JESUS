import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const pane=fs.readFileSync(new URL('../src/chart-pane.js',import.meta.url),'utf8');
const share=fs.readFileSync(new URL('../src/share.js',import.meta.url),'utf8');

test('every this.method() call in app resolves to a class method',()=>{
  const defs=new Set([...app.matchAll(/^\s{2}(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^\n]*\)\s*\{/gm)].map(m=>m[1]));
  const calls=new Set([...app.matchAll(/this\.([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]));
  const missing=[...calls].filter(name=>!defs.has(name));
  assert.deepEqual(missing,[]);
});

test('known frontend placeholder actions are removed',()=>{
  for(const bad of ['Modify position panel opened','Favorite drawing tools can be pinned here in a later workspace preset','order confirmation opened'])assert.equal(app.includes(bad),false,bad);
});

test('share output carries Trade Avata brand and slogan',()=>{
  assert.match(share,/Trade Avata Chart/);
  assert.match(share,/Trade Simple/);
  assert.match(share,/Created with Trade Avata/);
  assert.match(pane,/Trade Avata · Trade Simple/);
});

test('frontend trading controls have order, modify and cancel flows',()=>{
  for(const key of ['openOrderTicket','sendBrokerCommand','openPositionModify','requestClosePosition','cancelOrder','renderOrders'])assert.match(app,new RegExp(key));
});


test('indicator eye controls and oscillator pane workflow are wired',()=>{
  for(const key of ['toggleIndicatorVisibility','toggleOscillatorIndicators'])assert.match(app,new RegExp(key));
  for(const key of ['legend-eye','isPlainMainChartPoint','captureOscillatorPaneHeights','applyOscillatorPaneHeights','oscillatorPanes'])assert.match(pane,new RegExp(key));
  assert.match(pane,/nextOscillatorPane/);
  assert.doesNotMatch(pane,/toggleOscillatorIndicators/); // chart double-click must not toggle oscillators
});

test('market intelligence and controlled AI surfaces are wired',()=>{
  for(const key of ['renderMarketCenter','renderAIInsights','canUseAIChat','renderAIChatComposer','startAIInputVoice','submitAIChat','speakAI'])assert.match(app,new RegExp(key));
  assert.match(app,/Public users receive automated market outputs only/);
  assert.match(app,/OWNER \/ ENTITLED/);
});

test('AI voice and read-aloud client is present',()=>{
  const ai=fs.readFileSync(new URL('../src/ai-client.js',import.meta.url),'utf8');
  assert.match(ai,/SpeechRecognition|webkitSpeechRecognition/);
  assert.match(ai,/speechSynthesis/);
  assert.match(ai,/\/api\/ai\//);
});
