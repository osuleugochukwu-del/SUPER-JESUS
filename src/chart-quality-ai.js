import { requestAI, speakText, stopSpeech } from './ai-client.js';

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;
const pct=(a,p=.95)=>{if(!a.length)return 0;const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor((s.length-1)*p))];};
const OWNER_QUESTIONS=[
  'What should I improve first?',
  'Are drawings moving perfectly with the chart?',
  'Are MACD, RSI and other oscillators stable across timeframe changes?',
  'Is the native chart fast enough on this device?',
  'Is mobile drawing behaving correctly?',
  'Which chart behaviour is most likely to annoy users?',
  'What changed during this session?',
  'What should we test before the next deployment?'
];

export class ChartQualityMonitor{
  constructor(app){
    this.app=app;this.startedAt=Date.now();this.events=[];this.nativeRenders=[];this.frameSamples=[];this.longTasks=[];this.errors=[];this.timeframeSwitches=[];this.rebuilds=[];this.syncSamples=[];this.max=350;
    this.enabled=app.state.qualityAI?.enabled!==false;app.state.qualityAI={enabled:true,autoMonitor:true,history:[],...(app.state.qualityAI||{})};
    this.installGlobalObservers();this.installAppHooks();this.startFrameSampler();
  }
  owner(){const u=this.app.state.connection?.tradeAvataUser||{};return this.app.isLocalOwnerPreview?.()||u.role==='owner';}
  record(type,data={}){if(!this.enabled)return;this.events.push({type,time:Date.now(),...data});if(this.events.length>this.max)this.events.splice(0,this.events.length-this.max);}
  recordNativeRender(ms,data={}){if(!this.enabled)return;this.nativeRenders.push(Number(ms)||0);if(this.nativeRenders.length>180)this.nativeRenders.shift();this.record('native_render',{ms,...data});}
  installGlobalObservers(){
    window.addEventListener('error',e=>{const message=String(e.message||'Runtime error');this.errors.push({time:Date.now(),message});this.errors=this.errors.slice(-50);this.record('error',{message});});
    window.addEventListener('unhandledrejection',e=>{const message=String(e.reason?.message||e.reason||'Unhandled rejection');this.errors.push({time:Date.now(),message});this.errors=this.errors.slice(-50);this.record('error',{message});});
    try{const po=new PerformanceObserver(list=>{for(const x of list.getEntries()){this.longTasks.push(x.duration);if(this.longTasks.length>80)this.longTasks.shift();this.record('long_task',{ms:x.duration});}});po.observe({entryTypes:['longtask']});this.performanceObserver=po;}catch{}
  }
  installAppHooks(){
    const app=this.app;
    const setPeriod=app.setPeriod.bind(app);app.setPeriod=(...args)=>{const t=performance.now(),before=app.activeConfig?.();const r=setPeriod(...args);requestAnimationFrame(()=>{const ms=performance.now()-t;this.timeframeSwitches.push(ms);this.timeframeSwitches=this.timeframeSwitches.slice(-80);this.record('period_switch',{ms,from:before?.period?.value||before?.period?.mode,to:app.activeConfig?.().period?.value||app.activeConfig?.().period?.mode});this.checkOscillatorLayout();});return r;};
    const applyLayout=app.applyLayout.bind(app);app.applyLayout=(...args)=>{const r=applyLayout(...args);setTimeout(()=>this.instrumentPanes(),0);return r;};
    this.instrumentPanes();
  }
  instrumentPanes(){
    for(const pane of this.app.panes||[]){if(pane.__qualityAIInstrumented)continue;pane.__qualityAIInstrumented=true;
      const rebuild=pane.rebuildSeries.bind(pane);pane.rebuildSeries=(...args)=>{const t=performance.now(),r=rebuild(...args),ms=performance.now()-t;this.rebuilds.push(ms);this.rebuilds=this.rebuilds.slice(-80);this.record('series_rebuild',{ms,paneId:pane.id,indicators:this.app.state.indicators.length});return r;};
      const render=pane.renderOverlays.bind(pane);pane.renderOverlays=(...args)=>{const t=performance.now(),r=render(...args),ms=performance.now()-t;this.syncSamples.push(ms);this.syncSamples=this.syncSamples.slice(-120);return r;};
    }
  }
  checkOscillatorLayout(){
    setTimeout(()=>{for(const p of this.app.panes||[]){for(const x of p.oscillatorPanes||[]){const wanted=Number(x.cfg?.paneHeight),actual=p.chart?.panes?.()?.[x.paneIndex]?.getHeight?.();if(Number.isFinite(wanted)&&Number.isFinite(actual)&&Math.abs(wanted-actual)>12)this.record('oscillator_height_drift',{indicator:x.cfg?.name||x.id,wanted,actual});}}},80);
  }
  startFrameSampler(){
    const sample=()=>{if(document.hidden||!this.enabled){this.sampleTimer=setTimeout(sample,15000);return;}let frames=0,start=performance.now();const step=t=>{frames++;if(t-start<1200){requestAnimationFrame(step);return;}const fps=frames/((t-start)/1000);this.frameSamples.push(fps);this.frameSamples=this.frameSamples.slice(-40);this.record('fps_sample',{fps:Number(fps.toFixed(1))});this.sampleTimer=setTimeout(sample,14000);};requestAnimationFrame(step);};
    this.sampleTimer=setTimeout(sample,1000);
  }
  snapshot(){
    const drift=this.events.filter(x=>x.type==='oscillator_height_drift').length;
    return {
      build:this.app.state.masterRecoveryVersion||'unknown',engine:this.app.state.chartEngines?.active||'native',sessionMinutes:(Date.now()-this.startedAt)/60000,
      fpsAvg:mean(this.frameSamples),fpsLow:this.frameSamples.length?Math.min(...this.frameSamples):0,
      nativeRenderAvg:mean(this.nativeRenders),nativeRenderP95:pct(this.nativeRenders),
      rebuildAvg:mean(this.rebuilds),switchAvg:mean(this.timeframeSwitches),overlayAvg:mean(this.syncSamples),
      longTasks:this.longTasks.length,longTaskP95:pct(this.longTasks),errors:this.errors.length,oscillatorDrift:drift,
      indicators:this.app.state.indicators?.length||0,panes:this.app.panes?.length||0,recentEvents:this.events.slice(-30)
    };
  }
  recommendations(){
    const s=this.snapshot(),out=[];
    if(s.errors)out.push({severity:'high',title:'Runtime errors need attention',detail:`${s.errors} runtime error(s) were recorded in this session. Inspect these before deployment.`});
    if(s.fpsAvg&&s.fpsAvg<45)out.push({severity:'high',title:'Chart animation is below target',detail:`Average sampled frame rate is ${s.fpsAvg.toFixed(0)} FPS. Reduce per-frame work or indicator load on this device.`});
    if(s.nativeRenderP95>12)out.push({severity:'medium',title:'Native renderer can be faster',detail:`95th-percentile native candle render is ${s.nativeRenderP95.toFixed(1)} ms. Keep expensive calculations outside the paint loop.`});
    if(s.switchAvg>300)out.push({severity:'medium',title:'Timeframe switching can be tightened',detail:`Average switch time is ${s.switchAvg.toFixed(0)} ms. Cache unchanged indicator inputs and constructed bars.`});
    if(s.oscillatorDrift)out.push({severity:'high',title:'Oscillator layout drift detected',detail:`${s.oscillatorDrift} pane-height mismatch event(s) occurred after chart changes. Preserve layout state separately from recalculation state.`});
    if(s.longTasks>2)out.push({severity:'medium',title:'Main-thread stalls detected',detail:`${s.longTasks} long task(s) were recorded. Candidate work should move to Web Workers or be chunked.`});
    if(s.overlayAvg>8)out.push({severity:'medium',title:'Drawing/overlay redraw is relatively expensive',detail:`Overlay work averages ${s.overlayAvg.toFixed(1)} ms. Keep chart and drawing transforms in one animation frame.`});
    if(!out.length)out.push({severity:'good',title:'Chart session looks healthy',detail:'No major quality warning has been detected yet. Continue testing zoom, drawings, oscillators, replay, mobile gestures and construction switching.'});
    return out;
  }
  localAnswer(question='What should I improve first?'){
    const s=this.snapshot(),r=this.recommendations();const lines=[`Chart Quality AI · Trade Avata Native v3.2`,`Session: ${s.sessionMinutes.toFixed(1)} min · FPS ${s.fpsAvg?s.fpsAvg.toFixed(0):'collecting'} · Native render ${s.nativeRenderAvg.toFixed(1)} ms avg · ${s.errors} errors.`];
    const q=question.toLowerCase();
    if(q.includes('drawing'))lines.push(`Overlay redraw average: ${s.overlayAvg.toFixed(1)} ms. ${s.overlayAvg>8?'This is worth optimizing.':'No obvious drawing redraw bottleneck yet.'}`);
    else if(q.includes('oscillator')||q.includes('macd')||q.includes('rsi'))lines.push(`Oscillator pane drift events: ${s.oscillatorDrift}. ${s.oscillatorDrift?'Investigate pane-height restoration after period changes.':'No pane-height drift has been detected in this session.'}`);
    else if(q.includes('mobile'))lines.push('Mobile priority: drawing tools must capture the active gesture, prevent chart pan during placement, then release control after completion. Test this on a real touch device before deployment.');
    else if(q.includes('test'))lines.push('Run interaction sequences, not isolated buttons: draw → scale → timeframe → replay → Home → Live; and MACD → resize → timeframe → hide/show → replay.');
    lines.push('',...r.slice(0,4).map((x,i)=>`${i+1}. ${x.title}: ${x.detail}`));return lines.join('\n');
  }
  async answer(question){
    const context=this.snapshot();try{return await requestAI({channel:'quality',message:question,context});}catch{return this.localAnswer(question);}
  }
}

function make(tag,cls,text=''){const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;}
function ownerOnly(app){const u=app.state.connection?.tradeAvataUser||{};return app.isLocalOwnerPreview?.()||u.role==='owner';}

export function installChartQualityAI(app){
  const monitor=new ChartQualityMonitor(app);globalThis.__tradeAvataChartQuality=monitor;
  app.openChartQualityAI=function(){
    if(!ownerOnly(this))return;this.closeMenu?.();const m=this.makeModal('Trade Avata Chart Quality AI · Owner','quality-ai-modal'),body=make('div','ta-quality-ai');m.main.replaceChildren(body);m.ok.style.display='none';m.cancel.textContent='Close';
    const render=()=>{const s=monitor.snapshot(),rec=monitor.recommendations();body.innerHTML='';const hero=make('div','ta-quality-hero');hero.innerHTML=`<div><strong>Native chart health</strong><small>Lightweight monitoring · no broker passwords, tokens or private indicator source are sent.</small></div><span class="status-badge">${s.engine==='native'?'NATIVE v2.7':'FALLBACK'}</span>`;body.append(hero);
      const metrics=make('div','ta-quality-metrics');for(const [k,v] of [['FPS',s.fpsAvg?s.fpsAvg.toFixed(0):'…'],['Native paint',`${s.nativeRenderAvg.toFixed(1)} ms`],['TF switch',`${s.switchAvg.toFixed(0)} ms`],['Errors',String(s.errors)],['Osc drift',String(s.oscillatorDrift)],['Indicators',String(s.indicators)]]){const c=make('div','ta-quality-metric');c.innerHTML=`<small>${k}</small><strong>${v}</strong>`;metrics.append(c);}body.append(metrics);
      const insights=make('div','ta-quality-insights');insights.append(make('h4','','Automatic recommendations'));for(const x of rec){const c=make('div',`ta-quality-insight ${x.severity}`);c.innerHTML=`<strong>${x.title}</strong><p>${x.detail}</p>`;insights.append(c);}body.append(insights);
      const prompts=make('div','ta-quality-prompts');prompts.append(make('h4','','Suggested questions'));for(const q of OWNER_QUESTIONS){const b=make('button','ta-quality-prompt',q);b.onclick=()=>ask(q);prompts.append(b);}body.append(prompts);
      const chat=make('div','ta-quality-chat');chat.append(make('h4','','Ask Chart Quality AI'));const history=make('div','ta-quality-history');for(const x of (this.state.qualityAI.history||[]).slice(-8)){const row=make('div',`ta-quality-msg ${x.role}`);row.innerHTML=`<small>${x.role==='user'?'You':'Quality AI'}</small><p></p>`;row.querySelector('p').textContent=x.text;history.append(row);}const input=make('textarea','field');input.placeholder='Ask about chart quality, lag, drawings, oscillators, replay or mobile behaviour…';const actions=make('div','ta-quality-actions');const send=make('button','primary','Ask');const listen=make('button','secondary','▶ Read latest');const stop=make('button','secondary','■ Stop');send.onclick=()=>ask(input.value.trim(),input);listen.onclick=()=>{const last=[...(this.state.qualityAI.history||[])].reverse().find(x=>x.role==='assistant');if(last)speakText(last.text);};stop.onclick=()=>stopSpeech();actions.append(send,listen,stop);chat.append(history,input,actions);body.append(chat);};
    const ask=async(q,input)=>{if(!q)return;this.state.qualityAI.history=this.state.qualityAI.history||[];this.state.qualityAI.history.push({role:'user',text:q,time:Date.now()});if(input)input.value='';this.save?.();render();const ans=await monitor.answer(q);this.state.qualityAI.history.push({role:'assistant',text:ans,time:Date.now()});this.state.qualityAI.history=this.state.qualityAI.history.slice(-30);this.save?.();render();};render();
  };
  const ops=app.renderOps.bind(app);app.renderOps=function(body){ops(body);if(!ownerOnly(this))return;const s=monitor.snapshot(),card=make('div','side-card ta-quality-ops');card.innerHTML=`<h4>Chart Quality AI</h4><p>Monitoring is ON by default and samples performance lightly. Current engine: <strong>${s.engine}</strong>.</p>`;const b=make('button','primary','Open Quality AI');b.onclick=()=>this.openChartQualityAI();card.append(b);body.append(card);};
  const top=app.renderTopbar.bind(app);app.renderTopbar=function(){top();if(!ownerOnly(this))return;const old=document.querySelector('.owner-ai');if(!old)return;const fresh=old.cloneNode(true);old.replaceWith(fresh);fresh.title='Trade Avata AI suite';fresh.onclick=e=>{e.preventDefault();e.stopPropagation();const menu=this.createMenu(fresh,230,'ta-ai-suite-menu');for(const [label,fn] of [['Indicator AI',()=>this.openAI()],['Market AI',()=>this.toggleRightPanel('ai')],['Chart Quality AI',()=>this.openChartQualityAI()]]){const b=make('button','menu-item',label);b.onclick=()=>{this.closeMenu();fn();};menu.append(b);}};};
  app.renderTopbar();app.save?.();return monitor;
}
