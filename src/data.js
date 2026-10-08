export const SYMBOLS = {
  XAUUSD: { name:'Gold Spot / U.S. Dollar', base:4131.20, precision:2, minMove:0.01, pipSize:0.10, market:'Metals', volPerSqrtSecond:0.000025 },
  NAS100: { name:'US Tech 100', base:24880.0, precision:1, minMove:0.1, pipSize:1, market:'Indices', volPerSqrtSecond:0.000035 },
  EURUSD: { name:'Euro / U.S. Dollar', base:1.16350, precision:5, minMove:0.00001, pipSize:0.0001, market:'Forex', volPerSqrtSecond:0.000008 },
  GBPUSD: { name:'British Pound / U.S. Dollar', base:1.34210, precision:5, minMove:0.00001, pipSize:0.0001, market:'Forex', volPerSqrtSecond:0.000009 },
  USDJPY: { name:'U.S. Dollar / Japanese Yen', base:153.82, precision:3, minMove:0.001, pipSize:0.01, market:'Forex', volPerSqrtSecond:0.000009 },
  BTCUSD: { name:'Bitcoin / U.S. Dollar', base:124800, precision:2, minMove:0.01, pipSize:1, market:'Crypto', volPerSqrtSecond:0.000080 },
  US30: { name:'Dow Jones 30', base:49200, precision:1, minMove:0.1, pipSize:1, market:'Indices', volPerSqrtSecond:0.000028 },
};

export const TIMEFRAMES = [
  ['1s','1 second'],['2s','2 seconds'],['3s','3 seconds'],['5s','5 seconds'],['10s','10 seconds'],['15s','15 seconds'],['20s','20 seconds'],['30s','30 seconds'],['45s','45 seconds'],
  ['1m','1 minute'],['2m','2 minutes'],['3m','3 minutes'],['5m','5 minutes'],['10m','10 minutes'],['15m','15 minutes'],['30m','30 minutes'],['45m','45 minutes'],
  ['1h','1 hour'],['2h','2 hours'],['3h','3 hours'],['4h','4 hours'],['1D','1 day'],['1W','1 week'],['1M','1 month']
];

export const TICK_PERIODS = [1,5,10,20,50,100,250,500,1000];
export const RENKO_PIP_PERIODS = [1,2,3,5,10,15,20,30,50,100];
export const RANGE_PIP_PERIODS = [1,2,3,5,10,15,20,30,50,100,200];
export const RENKO_TIME_PERIODS = ['5s','10s','15s','30s','1m','2m','5m','15m','30m','1h'];

export const DEFAULT_FAVORITES = ['1s','5s','15s','30s','1m','5m','15m'];
export const DEFAULT_PERIOD_FAVORITES = [
  {mode:'time',value:'1s'}, {mode:'time',value:'5s'}, {mode:'time',value:'15s'},
  {mode:'time',value:'30s'}, {mode:'time',value:'1m'},
  {mode:'renko-pips',value:5}, {mode:'renko-time',value:'1m'}, {mode:'range-pips',value:5}
];

export function timeframeSeconds(tf){
  if(typeof tf!=='string') return 60;
  if(tf.endsWith('s')) return Number(tf.slice(0,-1)) || 1;
  if(tf.endsWith('m')) return (Number(tf.slice(0,-1)) || 1)*60;
  if(tf.endsWith('h')) return (Number(tf.slice(0,-1)) || 1)*3600;
  if(tf==='1D') return 86400;
  if(tf==='1W') return 604800;
  if(tf==='1M') return 2592000;
  return 60;
}

export function periodKey(period={mode:'time',value:'15s'}){
  const mode=period.mode||'time';
  return `${mode}:${period.value ?? ''}`;
}

export function periodLabel(period={mode:'time',value:'15s'}){
  const mode=period.mode||'time', v=period.value;
  if(mode==='time') return String(v||'15s');
  if(mode==='tick') return `T${v||50}`;
  if(mode==='renko-pips') return `R${v||5}`;
  if(mode==='renko-time') return `RT ${v||'1m'}`;
  if(mode==='range-pips') return `RG${v||5}`;
  return String(v||'15s');
}

export function describePeriod(period={mode:'time',value:'15s'}){
  const mode=period.mode||'time', v=period.value;
  if(mode==='time') return TIMEFRAMES.find(([k])=>k===v)?.[1] || v;
  if(mode==='tick') return `${v} ticks`;
  if(mode==='renko-pips') return `Renko · ${v} pips`;
  if(mode==='renko-time') return `Renko Time · ${v}`;
  if(mode==='range-pips') return `Range · ${v} pips`;
  return String(v||'');
}

function hashString(s){
  let h=2166136261>>>0;
  for(let i=0;i<s.length;i++){ h^=s.charCodeAt(i); h=Math.imul(h,16777619); }
  return h>>>0;
}
function mulberry32(seed){
  return function(){
    let t=seed+=0x6D2B79F5;
    t=Math.imul(t^t>>>15,t|1);
    t^=t+Math.imul(t^t>>>7,t|61);
    return ((t^t>>>14)>>>0)/4294967296;
  };
}
function gaussian(rand){
  const u=Math.max(1e-12,rand()),v=Math.max(1e-12,rand());
  return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);
}

/**
 * Realistic deterministic demo bars. The old generator could drift hundreds of
 * dollars in minutes on XAUUSD. This generator scales volatility by sqrt(time)
 * and mean-reverts slow drift so demo data behaves like an intraday feed.
 */
export function generateBars(symbol='XAUUSD', timeframe='15s', count=1800){
  const cfg=SYMBOLS[symbol]||SYMBOLS.XAUUSD;
  const sec=Math.max(1,timeframeSeconds(timeframe));
  const rand=mulberry32(hashString(`${symbol}-${timeframe}-trade-avata-v8`));
  const now=Math.floor(Date.now()/1000/sec)*sec;
  const start=now-(count-1)*sec;
  const bars=[];
  let price=cfg.base*(0.9985+rand()*0.003);
  let anchor=price;
  let slowDrift=0;
  for(let i=0;i<count;i++){
    if(i%160===0){
      anchor=price*(0.9985+rand()*0.003);
      slowDrift=gaussian(rand)*cfg.volPerSqrtSecond*0.06;
    }
    const sigma=cfg.volPerSqrtSecond*Math.sqrt(sec);
    const meanRevert=((anchor-price)/Math.max(cfg.minMove,price))*0.018;
    const cyc=Math.sin(i/53)*sigma*0.08+Math.sin(i/211)*sigma*0.12;
    const ret=slowDrift+meanRevert+cyc+gaussian(rand)*sigma;
    const open=price;
    const close=Math.max(cfg.minMove,open*(1+ret));
    const wickScale=Math.max(cfg.minMove,open*sigma*(0.3+rand()*0.85));
    const high=Math.max(open,close)+wickScale*rand();
    const low=Math.max(cfg.minMove,Math.min(open,close)-wickScale*rand());
    const volume=Math.round(150+rand()*3800+Math.abs(close-open)/Math.max(cfg.minMove,open*sigma)*500);
    bars.push({time:start+i*sec,open,high,low,close,volume});
    price=close;
  }
  return bars;
}

export function aggregateTimeBars(bars, seconds){
  if(!bars.length||!Number.isFinite(seconds)||seconds<=0)return bars.slice();
  const out=[];let bucket=null;
  for(const b of bars){
    const start=Math.floor(Number(b.time)/seconds)*seconds;
    if(!bucket||bucket.time!==start){
      if(bucket)out.push(bucket);
      bucket={time:start,open:b.open,high:b.high,low:b.low,close:b.close,volume:b.volume||0};
    }else{
      bucket.high=Math.max(bucket.high,b.high);bucket.low=Math.min(bucket.low,b.low);bucket.close=b.close;bucket.volume+=(b.volume||0);
    }
  }
  if(bucket)out.push(bucket);
  return out;
}

export function tickBars(bars,ticks=50){
  // Browser demo approximation: the 1-second feed is treated as a stream of
  // micro batches. Production tick charts must use actual broker ticks.
  const n=Math.max(1,Math.round(Number(ticks)||50));
  if(n===1)return bars.slice();
  const batch=Math.max(1,Math.round(n/10));
  const out=[];
  for(let i=0;i<bars.length;i+=batch){
    const part=bars.slice(i,i+batch);if(!part.length)continue;
    out.push({time:part[0].time,open:part[0].open,high:Math.max(...part.map(x=>x.high)),low:Math.min(...part.map(x=>x.low)),close:part.at(-1).close,volume:part.reduce((a,x)=>a+(x.volume||0),0),approximateTick:true});
  }
  return out;
}

export function heikinAshi(bars){
  if(!bars.length) return [];
  const out=[];
  let prevOpen=(bars[0].open+bars[0].close)/2;
  let prevClose=(bars[0].open+bars[0].high+bars[0].low+bars[0].close)/4;
  bars.forEach((b,i)=>{
    const close=(b.open+b.high+b.low+b.close)/4;
    const open=i===0 ? (b.open+b.close)/2 : (prevOpen+prevClose)/2;
    const high=Math.max(b.high,open,close);
    const low=Math.min(b.low,open,close);
    out.push({...b,open,high,low,close});
    prevOpen=open; prevClose=close;
  });
  return out;
}

export function renkoBars(bars, brickSize){
  if(!bars.length || !Number.isFinite(brickSize) || brickSize<=0) return bars.slice();
  const out=[];
  let anchor=bars[0].open;
  let direction=0;
  let seq=0,lastSynthetic=Math.floor(Number(bars[0].time))-1;
  const pushBrick=(dir,b)=>{
    const open=anchor;
    const close=anchor+dir*brickSize;
    lastSynthetic=Math.max(lastSynthetic+1,Math.floor(Number(b.time)));
    out.push({time:lastSynthetic,open,high:Math.max(open,close),low:Math.min(open,close),close,volume:b.volume||0,renkoDirection:dir,sourceTime:b.time,sequence:seq++});
    anchor=close;direction=dir;
  };
  const processPrice=(price,b)=>{
    let guard=0;
    while(guard++<2000){
      if(direction===0){
        if(price>=anchor+brickSize){pushBrick(1,b);continue;}
        if(price<=anchor-brickSize){pushBrick(-1,b);continue;}
        break;
      }
      if(direction>0){
        if(price>=anchor+brickSize){pushBrick(1,b);continue;}
        if(price<=anchor-2*brickSize){anchor-=brickSize;pushBrick(-1,b);continue;}
        break;
      }
      if(price<=anchor-brickSize){pushBrick(-1,b);continue;}
      if(price>=anchor+2*brickSize){anchor+=brickSize;pushBrick(1,b);continue;}
      break;
    }
  };
  for(const b of bars){
    // Deterministic OHLC path is only an approximation. Production cTrader-style
    // Renko must run this threshold logic on licensed historical/live ticks.
    const path=b.close>=b.open?[b.open,b.low,b.high,b.close]:[b.open,b.high,b.low,b.close];
    for(const price of path)processPrice(price,b);
  }
  return out.length ? out : bars.slice(-1);
}

export function renkoTimeBars(bars,{interval='1m',brickSize=1}={}){
  const buckets=aggregateTimeBars(bars,timeframeSeconds(interval));
  if(!buckets.length)return [];
  // Trade Avata Renko Time: evaluate the fixed-pip Renko thresholds at the end
  // of each time bucket instead of every incoming tick. This is intentionally
  // separate from cTrader's native price-only Renko.
  const closeOnly=buckets.map(b=>({...b,high:Math.max(b.open,b.close),low:Math.min(b.open,b.close)}));
  return renkoBars(closeOnly,brickSize).map(x=>({...x,renkoTimeInterval:interval}));
}

export function rangeBars(bars, rangeSize){
  if(!bars.length || !Number.isFinite(rangeSize) || rangeSize<=0) return bars.slice();
  const out=[];
  let o=bars[0].open,h=o,l=o,v=0,t=bars[0].time;
  for(const b of bars){
    const path=b.close>=b.open?[b.open,b.low,b.high,b.close]:[b.open,b.high,b.low,b.close];
    for(const p of path){
      h=Math.max(h,p);l=Math.min(l,p);
      let guard=0;
      while(h-l>=rangeSize&&guard++<1000){
        const up=(h-o)>=rangeSize;
        const close=up?o+rangeSize:o-rangeSize;
        const syntheticTime=out.length?Math.max(Math.floor(Number(t)),Number(out.at(-1).time)+1):Math.floor(Number(t));
        out.push({time:syntheticTime,open:o,high:Math.max(o,close),low:Math.min(o,close),close,volume:v,sourceTime:b.time});
        o=close;h=close;l=close;v=0;t=b.time;
        if(p>h)h=p;if(p<l)l=p;
      }
    }
    v+=b.volume||0;
  }
  return out.length?out:bars.slice(-1);
}

export function buildPeriodBars(raw,symbol,period={mode:'time',value:'15s'},settings={}){
  const cfg=SYMBOLS[symbol]||SYMBOLS.XAUUSD;
  const mode=period?.mode||'time';
  const value=period?.value;
  if(mode==='time') return raw;
  if(mode==='tick') return tickBars(raw,Number(value)||settings.tickCount||50);
  if(mode==='renko-pips') return renkoBars(raw,cfg.pipSize*(Number(value)||settings.renkoPips||5));
  if(mode==='renko-time') return renkoTimeBars(raw,{interval:String(value||settings.renkoTime||'1m'),brickSize:cfg.pipSize*(Number(settings.renkoPips)||5)});
  if(mode==='range-pips') return rangeBars(raw,cfg.pipSize*(Number(value)||settings.rangePips||5));
  return raw;
}

export function ema(values,length){
  const out=new Array(values.length).fill(null);
  if(!values.length)return out;
  const n=Math.max(1,Math.round(length||1)),k=2/(n+1);
  let acc=values[0];out[0]=acc;
  for(let i=1;i<values.length;i++){acc=values[i]*k+acc*(1-k);out[i]=acc;}
  return out;
}

export function niceStep(range,targetTicks=8){
  if(!Number.isFinite(range)||range<=0)return 1;
  const rough=range/Math.max(2,targetTicks);
  const power=Math.pow(10,Math.floor(Math.log10(rough)));
  const normalized=rough/power;
  const nice=normalized<=1?1:normalized<=2?2:normalized<=2.5?2.5:normalized<=5?5:10;
  return nice*power;
}

export function formatPrice(symbol,value){
  const cfg=SYMBOLS[symbol]||SYMBOLS.XAUUSD;
  return Number(value).toLocaleString(undefined,{minimumFractionDigits:cfg.precision,maximumFractionDigits:cfg.precision});
}

export function makeHeikinLabel(type){return type==='Heikin-Ashi'?'Heikin Ashi':type;}

// Backward-compatible chart-style transform used by old saved states.
export function buildDisplayBars(raw,chartType,options={}){
  if(chartType==='Heikin-Ashi')return heikinAshi(raw);
  if(chartType==='Renko')return renkoBars(raw,options.renkoSize||((raw.at(-1)?.close||100)*0.0005));
  if(chartType==='Range')return rangeBars(raw,options.rangeSize||((raw.at(-1)?.close||100)*0.0008));
  return raw;
}
