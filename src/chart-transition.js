import { timeframeSeconds } from './data.js';

export const STANDARD_TYPES=new Set(['Candles','Heikin-Ashi','Bars','Line','Area']);
export const NON_TIME_MODES=new Set(['tick','renko-pips','renko-time','range-pips']);

export function clonePeriod(period){
  if(typeof period==='string')return{mode:'time',value:period};
  const p=period&&typeof period==='object'?period:{};
  return{mode:p.mode||'time',value:p.value??'15s'};
}

export function constructionId(chartType='Candles',period={mode:'time',value:'15s'}){
  const mode=period?.mode||'time';
  if(mode==='renko-time')return'renko-time';
  if(mode==='renko-pips')return'renko-pips';
  if(mode==='range-pips')return'range-pips';
  if(mode==='tick')return'tick';
  if(chartType==='Heikin-Ashi')return'heikin';
  if(['Bars','Line','Area'].includes(chartType))return chartType.toLowerCase();
  return'candles';
}

export function resolveConstruction({chartType='Candles',period={mode:'time',value:'15s'}}={}){
  const next=clonePeriod(period);
  let type=STANDARD_TYPES.has(chartType)?chartType:'Candles';

  // Renko/Range/Tick are complete period constructions. Their visible shell is
  // the normal candle series; the period builder supplies the transformed bars.
  if(NON_TIME_MODES.has(next.mode))type='Candles';

  // Legacy chart-type choices are normalized into the richer period model.
  if(chartType==='Renko'){
    type='Candles';
    if(next.mode==='time'){
      next.mode='renko-pips';
      next.value=5;
    }
  }else if(chartType==='Range'){
    type='Candles';
    if(next.mode==='time'){
      next.mode='range-pips';
      next.value=5;
    }
  }

  return{chartType:type,period:next,construction:constructionId(type,next)};
}

export function isSameConstruction(a,b){
  return constructionId(a?.chartType,a?.period)===constructionId(b?.chartType,b?.period);
}

export function historyPlanForPeriod(period={mode:'time',value:'15s'}){
  const p=clonePeriod(period);
  const mode=p.mode;

  if(mode==='time'){
    return{baseTimeframe:String(p.value||'15s'),count:1800};
  }

  if(mode==='renko-time'){
    const interval=Math.max(1,timeframeSeconds(String(p.value||'1m')));
    let baseSeconds;
    if(interval<=30)baseSeconds=1;
    else if(interval<=300)baseSeconds=5;
    else if(interval<=1800)baseSeconds=15;
    else baseSeconds=60;

    const baseTimeframe=baseSeconds<60?`${baseSeconds}s`:`${baseSeconds/60}m`;
    const buckets=420;
    const samplesPerBucket=Math.max(1,Math.ceil(interval/baseSeconds));
    const count=Math.max(6000,Math.min(30000,buckets*samplesPerBucket));
    return{baseTimeframe,count};
  }

  if(mode==='renko-pips'||mode==='range-pips'){
    return{baseTimeframe:'1s',count:20000};
  }

  if(mode==='tick'){
    return{baseTimeframe:'1s',count:12000};
  }

  return{baseTimeframe:'1s',count:12000};
}

export function defaultHomeBars({period,desktop=180,mobile=90,isMobile=false,length=0}={}){
  const mode=period?.mode||'time';
  let target=isMobile?Number(mobile||90):Number(desktop||180);

  if(mode==='renko-pips'||mode==='renko-time'){
    target=isMobile?46:78;
  }else if(mode==='range-pips'){
    target=isMobile?56:96;
  }else if(mode==='tick'){
    target=isMobile?72:130;
  }

  if(Number.isFinite(length)&&length>0)target=Math.min(target,Math.max(24,length));
  return Math.max(24,Math.round(target));
}
