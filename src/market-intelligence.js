import { SYMBOLS, generateBars } from './data.js';

const pct=(a,b)=>b?((a-b)/b*100):0;
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:0;
const stdev=a=>{if(a.length<2)return 0;const m=avg(a);return Math.sqrt(avg(a.map(x=>(x-m)**2)));};
const ema=(values,n)=>{if(!values.length)return 0;const k=2/(Math.max(1,n)+1);let out=values[0];for(let i=1;i<values.length;i++)out=values[i]*k+out*(1-k);return out;};

export function analyzeMarketBars(symbol='XAUUSD', timeframe='15m', bars=[]){
  const cfg=SYMBOLS[symbol]||SYMBOLS.XAUUSD;
  const data=bars.length?bars:generateBars(symbol,timeframe,260);
  const closes=data.map(x=>Number(x.close));
  const recent=data.slice(-80),last=data.at(-1)||{close:cfg.base,high:cfg.base,low:cfg.base};
  const prev=data.at(-2)||last;
  const ema20=ema(closes.slice(-120),20),ema50=ema(closes.slice(-180),50);
  const returns=[];for(let i=Math.max(1,data.length-80);i<data.length;i++)returns.push(pct(data[i].close,data[i-1].close));
  const recentHigh=Math.max(...recent.map(x=>x.high));
  const recentLow=Math.min(...recent.map(x=>x.low));
  const range=Math.max(cfg.minMove,recentHigh-recentLow);
  const momentum=pct(last.close,data[Math.max(0,data.length-12)]?.close||last.close);
  const trendGap=pct(ema20,ema50);
  const vol=stdev(returns);
  const direction=last.close>ema20&&ema20>=ema50?'bullish':last.close<ema20&&ema20<=ema50?'bearish':'neutral';
  const trendStrength=Math.min(100,Math.round(Math.abs(trendGap)*1200+Math.abs(momentum)*45));
  const momentumScore=Math.min(100,Math.round(Math.abs(momentum)*120));
  const volatilityLabel=vol>.12?'High':vol>.055?'Moderate':'Low';
  const setupQuality=Math.max(1,Math.min(5,Math.round((trendStrength*.55+momentumScore*.25+(direction==='neutral'?10:70)*.2)/20)));
  const support=Math.min(...data.slice(-30).map(x=>x.low));
  const resistance=Math.max(...data.slice(-30).map(x=>x.high));
  const change=pct(last.close,prev.close);
  const summary=direction==='bullish'
    ? `${symbol} is showing bullish structure on ${timeframe}. Price is holding above the short and medium trend averages, while recent momentum remains ${momentum>=0?'positive':'mixed'}.`
    : direction==='bearish'
      ? `${symbol} is showing bearish structure on ${timeframe}. Price is trading below the short and medium trend averages, while recent momentum remains ${momentum<=0?'negative':'mixed'}.`
      : `${symbol} is mixed on ${timeframe}. Trend averages and price are not fully aligned, so the market is better treated as neutral until structure becomes clearer.`;
  const scenario=direction==='bullish'
    ? `Continuation remains favored while price holds above ${support.toFixed(cfg.precision)}. A clean break above ${resistance.toFixed(cfg.precision)} would strengthen the bullish case.`
    : direction==='bearish'
      ? `Continuation remains favored while price stays below ${resistance.toFixed(cfg.precision)}. A clean break below ${support.toFixed(cfg.precision)} would strengthen the bearish case.`
      : `A break above ${resistance.toFixed(cfg.precision)} or below ${support.toFixed(cfg.precision)} would provide clearer directional information.`;
  return {symbol,timeframe,last:last.close,change,direction,trendStrength,momentum,momentumScore,volatility:vol,volatilityLabel,support,resistance,setupQuality,ema20,ema50,summary,scenario,source:'derived'};
}

export function buildHeatmap(symbols=Object.keys(SYMBOLS),timeframe='15m'){
  return symbols.filter(s=>SYMBOLS[s]).map(symbol=>{
    const bars=generateBars(symbol,timeframe,180),last=bars.at(-1),first=bars[Math.max(0,bars.length-50)];
    const change=pct(last.close,first.close),snap=analyzeMarketBars(symbol,timeframe,bars);
    return {symbol,name:SYMBOLS[symbol].name,price:last.close,change,bias:snap.direction,strength:snap.trendStrength};
  }).sort((a,b)=>b.change-a.change);
}

export function buildScreener(symbols=Object.keys(SYMBOLS),timeframe='15m'){
  return symbols.filter(s=>SYMBOLS[s]).map(symbol=>{
    const snapshot=analyzeMarketBars(symbol,timeframe,generateBars(symbol,timeframe,260));
    const signal=snapshot.direction==='bullish'&&snapshot.trendStrength>=38?'Buy':snapshot.direction==='bearish'&&snapshot.trendStrength>=38?'Sell':'Neutral';
    return {...snapshot,signal,score:Math.min(100,Math.round(snapshot.trendStrength*.7+snapshot.momentumScore*.3))};
  }).sort((a,b)=>b.score-a.score);
}

export function marketSentiment(rows=[]){
  const data=rows.length?rows:buildScreener();
  const bull=data.filter(x=>x.direction==='bullish').length,bear=data.filter(x=>x.direction==='bearish').length,total=Math.max(1,data.length),neutral=total-bull-bear;
  return {bullish:Math.round(bull/total*100),bearish:Math.round(bear/total*100),neutral:Math.round(neutral/total*100)};
}

export function buildAIContext(snapshot, indicators=[]){
  return {
    symbol:snapshot.symbol,timeframe:snapshot.timeframe,last:snapshot.last,bias:snapshot.direction,
    trendStrength:snapshot.trendStrength,momentum:snapshot.momentum,volatility:snapshot.volatilityLabel,
    support:snapshot.support,resistance:snapshot.resistance,setupQuality:snapshot.setupQuality,
    indicators:indicators.filter(x=>x.visible!==false).map(x=>({name:x.name,kind:x.kind,length:x.length,pane:x.pane}))
  };
}
