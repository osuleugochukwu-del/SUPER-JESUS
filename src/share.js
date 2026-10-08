const MAX_INDICATORS=8;
const MAX_POINTS=12;

export const SHARE_VERSION=1;

export function normalizeShareStatus({kind='chart',connectionStatus='demo',replayActive=false,forceStatus=null}={}){
  if(forceStatus)return String(forceStatus).toUpperCase();
  if(kind==='backtest')return 'BACKTEST';
  if(kind==='replay'||replayActive)return 'REPLAY';
  if(connectionStatus==='live')return 'LIVE';
  if(connectionStatus==='demo')return 'DEMO';
  return 'UNCONFIRMED';
}

export function makeReferralId(){
  const id=globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  return `ta-${String(id).replace(/[^a-zA-Z0-9-]/g,'').slice(0,36)}`;
}

function bytesToBase64(bytes){
  let bin='';for(const b of bytes)bin+=String.fromCharCode(b);
  if(typeof btoa==='function')return btoa(bin);
  return Buffer.from(bytes).toString('base64');
}
function base64ToBytes(s){
  const bin=typeof atob==='function'?atob(s):Buffer.from(s,'base64').toString('binary');
  return Uint8Array.from(bin,c=>c.charCodeAt(0));
}

export function encodeSharePayload(payload){
  const raw=JSON.stringify(payload);const bytes=new TextEncoder().encode(raw);
  return bytesToBase64(bytes).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
}
export function decodeSharePayload(encoded){
  if(!encoded)return null;
  try{
    const padded=encoded.replaceAll('-','+').replaceAll('_','/')+'='.repeat((4-encoded.length%4)%4);
    return JSON.parse(new TextDecoder().decode(base64ToBytes(padded)));
  }catch{return null;}
}

export function buildStatelessShareUrl(payload,href){
  const base=href||globalThis.location?.href||'https://tradeavata.local/';
  const url=new URL(base);url.hash=`ta-share=${encodeSharePayload(payload)}`;return url.toString();
}
export function readStatelessShareUrl(href){
  try{
    const url=new URL(href||globalThis.location?.href||'https://tradeavata.local/');
    const m=url.hash.match(/(?:^#|&)ta-share=([^&]+)/);return m?decodeSharePayload(m[1]):null;
  }catch{return null;}
}

export function compactIndicator(ind={}){
  return {
    id:String(ind.id||'').slice(0,48),kind:String(ind.kind||'').slice(0,32),name:String(ind.name||'Indicator').slice(0,80),
    length:Number(ind.length)||undefined,fast:Number(ind.fast)||undefined,slow:Number(ind.slow)||undefined,signal:Number(ind.signal)||undefined,
    period:Number(ind.period)||undefined,stdDev:Number(ind.stdDev)||undefined,color:String(ind.color||'').slice(0,24),visible:ind.visible!==false,
    lineWidth:Number(ind.lineWidth)||undefined,pane:String(ind.pane||'').slice(0,20)
  };
}

export function compactDrawing(d){
  if(!d)return null;
  return {
    type:String(d.type||'').slice(0,24),name:String(d.name||'').slice(0,80),riskPercent:Number(d.riskPercent)||undefined,
    text:d.text?String(d.text).slice(0,160):undefined,
    points:(d.points||[]).slice(0,MAX_POINTS).map(p=>({
      logical:Number.isFinite(Number(p.logical))?Number(p.logical):undefined,
      time:Number.isFinite(Number(p.time))?Number(p.time):undefined,
      price:Number.isFinite(Number(p.price))?Number(p.price):undefined
    })),
    style:d.style?{
      color:String(d.style.color||'').slice(0,24),profitColor:String(d.style.profitColor||'').slice(0,24),lossColor:String(d.style.lossColor||'').slice(0,24),
      entryColor:String(d.style.entryColor||'').slice(0,24),width:Number(d.style.width)||undefined,opacity:Number(d.style.opacity)||undefined,showStats:d.style.showStats!==false
    }:undefined
  };
}

export function createSharePayload({kind='chart',status='UNCONFIRMED',ref=null,chart={},indicators=[],drawing=null,metrics=null,replay=null,note=null}={}){
  return {
    v:SHARE_VERSION,product:'Trade Avata Chart',kind,status,createdAt:new Date().toISOString(),ref:ref||null,
    chart:{symbol:String(chart.symbol||'').slice(0,24),period:chart.period||null,chartType:String(chart.chartType||'Candles').slice(0,32)},
    indicators:(indicators||[]).filter(i=>i.visible!==false).slice(0,MAX_INDICATORS).map(compactIndicator),
    drawing:compactDrawing(drawing),metrics:metrics||null,replay:replay||null,note:note?String(note).slice(0,240):null
  };
}

export function buildShareSummary(payload={}){
  const symbol=payload.chart?.symbol||'Chart';const period=sharePeriodLabel(payload.chart?.period);const type=payload.chart?.chartType||'Candles';
  const head=`${symbol} · ${period} · ${type}`;const tag=`[${payload.status||'UNCONFIRMED'}]`;
  if(payload.kind==='trade'&&payload.drawing?.points?.length>=3){
    const [entry,target,stop]=payload.drawing.points,risk=Math.abs((entry.price||0)-(stop.price||0)),reward=Math.abs((target.price||0)-(entry.price||0)),rr=risk?reward/risk:0;
    return `${tag} ${head}\n${String(payload.drawing.type||'trade').toUpperCase()} · Entry ${fmt(entry.price)} · Stop ${fmt(stop.price)} · Target ${fmt(target.price)} · R:R ${rr.toFixed(2)}\nCreated with Trade Avata · Trade Simple`;
  }
  if(payload.kind==='analytics'&&payload.metrics){
    const m=payload.metrics;return `${tag} ${head}\nAnalytics · Trades ${m.totalTrades??'—'} · Win rate ${num(m.winRate,1)}% · Net ${money(m.net)} · Max DD ${num(m.maxDDPct,1)}%\nAnalyzed with Trade Avata · Trade Simple`;
  }
  if(payload.kind==='replay'&&payload.replay){
    const r=payload.replay;return `${tag} ${head}\nReplay session · ${num(r.progressPct,1)}% complete${r.time?` · ${new Date(r.time).toLocaleString()}`:''}\nCreated with Trade Avata · Trade Simple`;
  }
  return `${tag} ${head}\nCreated with Trade Avata · Trade Simple`;
}

export function createSocialCardCanvas(snapshot,payload,{width=1200,height=630}={}){
  if(typeof document==='undefined')return null;
  const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');
  ctx.fillStyle='#07111c';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#0b1b29';ctx.fillRect(0,0,width,72);
  ctx.fillStyle='#eef6ff';ctx.font='700 28px Inter,system-ui,sans-serif';ctx.fillText('Trade Avata Chart',34,44);
  ctx.fillStyle='#7f98ad';ctx.font='500 16px Inter,system-ui,sans-serif';ctx.fillText('Trade Simple',250,43);
  drawStatus(ctx,payload.status||'UNCONFIRMED',width-34,36);
  if(snapshot){
    const pad=24,top=88,bottom=118,availW=width-pad*2,availH=height-top-bottom;
    const scale=Math.min(availW/snapshot.width,availH/snapshot.height),dw=snapshot.width*scale,dh=snapshot.height*scale,dx=(width-dw)/2,dy=top+(availH-dh)/2;
    ctx.fillStyle='#0b1520';ctx.fillRect(pad,top,availW,availH);ctx.drawImage(snapshot,0,0,snapshot.width,snapshot.height,dx,dy,dw,dh);
  }
  ctx.fillStyle='#0b1b29';ctx.fillRect(0,height-102,width,102);
  ctx.fillStyle='#e9f4ff';ctx.font='700 23px Inter,system-ui,sans-serif';ctx.fillText(cardTitle(payload),34,height-65);
  ctx.fillStyle='#9ab0c3';ctx.font='500 16px Inter,system-ui,sans-serif';ctx.fillText(cardSubline(payload),34,height-34);
  ctx.textAlign='right';ctx.fillStyle='#62c9ff';ctx.font='600 15px Inter,system-ui,sans-serif';ctx.fillText('Created with Trade Avata · Trade Simple',width-34,height-34);ctx.textAlign='left';
  return c;
}

function drawStatus(ctx,status,right,y){
  const text=String(status).toUpperCase(),colors={LIVE:'#00bfae',DEMO:'#168cff',REPLAY:'#9b6cff',BACKTEST:'#f59e0b',UNCONFIRMED:'#64748b'},bg=colors[text]||colors.UNCONFIRMED;
  ctx.font='800 15px Inter,system-ui,sans-serif';const w=ctx.measureText(text).width+24;ctx.fillStyle=bg;roundedRect(ctx,right-w,y-16,w,30,8);ctx.fill();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(text,right-w/2,y+5);ctx.textAlign='left';
}
function roundedRect(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect?ctx.roundRect(x,y,w,h,r):(ctx.rect(x,y,w,h));}
function cardTitle(p){const c=p.chart||{};return `${c.symbol||'Chart'} · ${sharePeriodLabel(c.period)} · ${c.chartType||'Candles'}`;}
function cardSubline(p){
  if(p.kind==='trade'&&p.drawing?.points?.length>=3){const [e,t,s]=p.drawing.points,r=Math.abs((e.price||0)-(s.price||0)),rw=Math.abs((t.price||0)-(e.price||0));return `${String(p.drawing.type||'trade').toUpperCase()} setup · R:R ${r? (rw/r).toFixed(2):'—'}`;}
  if(p.kind==='analytics'&&p.metrics)return `Analytics · ${p.metrics.totalTrades??0} trades · ${num(p.metrics.winRate,1)}% win rate`;
  if(p.kind==='replay'&&p.replay)return `Replay · ${num(p.replay.progressPct,1)}% complete`;
  return `${p.indicators?.length||0} visible indicator(s) · ${p.status||'UNCONFIRMED'}`;
}
function sharePeriodLabel(period){if(!period)return '—';if(typeof period==='string')return period;const m=period.mode,v=period.value;if(m==='time')return String(v);if(m==='tick')return `${v} ticks`;if(m==='renko-pips')return `Renko ${v} pips`;if(m==='renko-time')return `Renko Time ${v}`;if(m==='range-pips')return `Range ${v} pips`;return String(v||m||'—');}
function fmt(v){return Number.isFinite(Number(v))?Number(v).toLocaleString(undefined,{maximumFractionDigits:5}):'—';}
function num(v,d=1){return Number.isFinite(Number(v))?Number(v).toFixed(d):'—';}
function money(v){const n=Number(v);return Number.isFinite(n)?`${n>=0?'+$':'-$'}${Math.abs(n).toFixed(2)}`:'—';}
