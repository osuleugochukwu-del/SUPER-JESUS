export const BUILTIN_INDICATORS=[
  {kind:'ema',name:'Exponential Moving Average',short:'EMA',category:'Moving averages',pane:'price',defaults:{length:20}},
  {kind:'sma',name:'Simple Moving Average',short:'SMA',category:'Moving averages',pane:'price',defaults:{length:20}},
  {kind:'wma',name:'Weighted Moving Average',short:'WMA',category:'Moving averages',pane:'price',defaults:{length:20}},
  {kind:'bollinger',name:'Bollinger Bands',short:'BB',category:'Volatility',pane:'price',defaults:{length:20,multiplier:2}},
  {kind:'vwap',name:'Volume Weighted Average Price',short:'VWAP',category:'Volume',pane:'price',defaults:{}},
  {kind:'rsi',name:'Relative Strength Index',short:'RSI',category:'Oscillators',pane:'oscillator',defaults:{length:14}},
  {kind:'macd',name:'MACD',short:'MACD',category:'Oscillators',pane:'oscillator',defaults:{fast:12,slow:26,signal:9}},
  {kind:'stochastic',name:'Stochastic Oscillator',short:'Stoch',category:'Oscillators',pane:'oscillator',defaults:{k:14,d:3}},
  {kind:'atr',name:'Average True Range',short:'ATR',category:'Volatility',pane:'oscillator',defaults:{length:14}},
  {kind:'adx',name:'Average Directional Index',short:'ADX',category:'Trend',pane:'oscillator',defaults:{length:14}},
  {kind:'cci',name:'Commodity Channel Index',short:'CCI',category:'Oscillators',pane:'oscillator',defaults:{length:20}},
  {kind:'momentum',name:'Momentum',short:'MOM',category:'Oscillators',pane:'oscillator',defaults:{length:10}},
  {kind:'roc',name:'Rate of Change',short:'ROC',category:'Oscillators',pane:'oscillator',defaults:{length:12}},
  {kind:'volume',name:'Volume',short:'VOL',category:'Volume',pane:'oscillator',defaults:{}},
];

export function indicatorDefinition(kind){return BUILTIN_INDICATORS.find(x=>x.kind===kind)||null;}

export function makeIndicator(kind,{id,name,color='#178eff',...overrides}={}){
  const d=indicatorDefinition(kind);if(!d)return null;
  const params={...d.defaults,...overrides};
  return {id:id||`${kind}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,kind,name:name||`${d.short}${params.length?` ${params.length}`:''}`,color,visible:true,lineWidth:1.5,source:'close',pane:d.pane,...params};
}

export function computeIndicator(ind,bars){
  const closes=bars.map(b=>b.close),highs=bars.map(b=>b.high),lows=bars.map(b=>b.low),volumes=bars.map(b=>b.volume||0),source=sourceValues(bars,ind.source||'close');
  const base={pane:ind.pane||indicatorDefinition(ind.kind)?.pane||'price',kind:ind.kind};
  if(ind.kind==='ema')return {...base,series:[line(ind.name||'EMA',ema(source,ind.length||20),ind.color)]};
  if(ind.kind==='sma')return {...base,series:[line(ind.name||'SMA',sma(source,ind.length||20),ind.color)]};
  if(ind.kind==='wma')return {...base,series:[line(ind.name||'WMA',wma(source,ind.length||20),ind.color)]};
  if(ind.kind==='bollinger'){
    const x=bollinger(source,ind.length||20,ind.multiplier||2);
    return {...base,series:[line('BB Upper',x.upper,ind.color),line('BB Basis',x.mid,ind.basisColor||'#94a3b8'),line('BB Lower',x.lower,ind.color)]};
  }
  if(ind.kind==='vwap')return {...base,series:[line(ind.name||'VWAP',vwap(bars),ind.color)]};
  if(ind.kind==='rsi')return {...base,range:{min:0,max:100},guides:Array.isArray(ind.levels)?ind.levels:[30,50,70],series:[line(ind.name||'RSI',rsi(source,ind.length||14),ind.color)]};
  if(ind.kind==='macd'){
    const x=macd(source,ind.fast||12,ind.slow||26,ind.signal||9);
    return {...base,series:[line('MACD',x.macd,ind.color),line('Signal',x.signal,ind.signalColor||'#f3a000'),hist('Histogram',x.hist,ind.histColor||'#64748b')]};
  }
  if(ind.kind==='stochastic'){
    const x=stochastic(highs,lows,closes,ind.k||14,ind.d||3);
    return {...base,range:{min:0,max:100},guides:Array.isArray(ind.levels)?ind.levels:[20,50,80],series:[line('%K',x.k,ind.color),line('%D',x.d,ind.signalColor||'#f3a000')]};
  }
  if(ind.kind==='atr')return {...base,series:[line(ind.name||'ATR',atr(bars,ind.length||14),ind.color)]};
  if(ind.kind==='adx')return {...base,range:{min:0,max:100},guides:Array.isArray(ind.levels)?ind.levels:[20,25,50],series:[line(ind.name||'ADX',adx(bars,ind.length||14),ind.color)]};
  if(ind.kind==='cci')return {...base,guides:Array.isArray(ind.levels)?ind.levels:[-100,0,100],series:[line(ind.name||'CCI',cciFromSource(source,ind.length||20),ind.color)]};
  if(ind.kind==='momentum')return {...base,guides:Array.isArray(ind.levels)?ind.levels:[100],series:[line(ind.name||'Momentum',momentum(source,ind.length||10),ind.color)]};
  if(ind.kind==='roc')return {...base,guides:Array.isArray(ind.levels)?ind.levels:[0],series:[line(ind.name||'ROC',roc(source,ind.length||12),ind.color)]};
  if(ind.kind==='volume')return {...base,series:[hist(ind.name||'Volume',volumes,ind.color)]};
  return {...base,series:[]};
}

function line(name,values,color){return{type:'line',name,values,color};}
function hist(name,values,color){return{type:'histogram',name,values,color};}

export function sourceValues(bars,source='close'){
  return (bars||[]).map(b=>{
    if(source==='open')return b.open;
    if(source==='high')return b.high;
    if(source==='low')return b.low;
    if(source==='hl2')return (b.high+b.low)/2;
    if(source==='hlc3')return (b.high+b.low+b.close)/3;
    if(source==='ohlc4')return (b.open+b.high+b.low+b.close)/4;
    return b.close;
  });
}
function smaNullable(values,length=3){
  const n=Math.max(1,Math.round(length)),out=new Array(values.length).fill(null);
  for(let i=n-1;i<values.length;i++){
    let sum=0,ok=true;
    for(let j=i-n+1;j<=i;j++){const v=values[j];if(!Number.isFinite(v)){ok=false;break;}sum+=v;}
    if(ok)out[i]=sum/n;
  }
  return out;
}

export function sma(values,length=20){
  const n=Math.max(1,Math.round(length)),out=new Array(values.length).fill(null);let sum=0;
  for(let i=0;i<values.length;i++){sum+=values[i];if(i>=n)sum-=values[i-n];if(i>=n-1)out[i]=sum/n;}
  return out;
}
export function ema(values,length=20){
  const n=Math.max(1,Math.round(length)),out=new Array(values.length).fill(null);if(!values.length)return out;
  const k=2/(n+1);let acc=values[0];out[0]=acc;for(let i=1;i<values.length;i++){acc=values[i]*k+acc*(1-k);out[i]=acc;}return out;
}
export function wma(values,length=20){
  const n=Math.max(1,Math.round(length)),den=n*(n+1)/2,out=new Array(values.length).fill(null);
  for(let i=n-1;i<values.length;i++){let sum=0;for(let j=0;j<n;j++)sum+=values[i-n+1+j]*(j+1);out[i]=sum/den;}return out;
}
function rollingStd(values,length,mean){
  const n=Math.max(1,Math.round(length)),out=new Array(values.length).fill(null);
  for(let i=n-1;i<values.length;i++){let s=0;for(let j=i-n+1;j<=i;j++)s+=(values[j]-mean[i])**2;out[i]=Math.sqrt(s/n);}return out;
}
export function bollinger(values,length=20,mult=2){
  const mid=sma(values,length),sd=rollingStd(values,length,mid),upper=mid.map((v,i)=>v==null?null:v+mult*sd[i]),lower=mid.map((v,i)=>v==null?null:v-mult*sd[i]);return{mid,upper,lower};
}
export function vwap(bars){
  let pv=0,v=0;return bars.map(b=>{const vol=b.volume||1,tp=(b.high+b.low+b.close)/3;pv+=tp*vol;v+=vol;return pv/v;});
}
export function rsi(values,length=14){
  const n=Math.max(1,Math.round(length)),out=new Array(values.length).fill(null);if(values.length<2)return out;
  let gain=0,loss=0;for(let i=1;i<=Math.min(n,values.length-1);i++){const d=values[i]-values[i-1];gain+=Math.max(0,d);loss+=Math.max(0,-d);}
  if(values.length>n){let ag=gain/n,al=loss/n;out[n]=al===0?100:100-(100/(1+ag/al));for(let i=n+1;i<values.length;i++){const d=values[i]-values[i-1];ag=(ag*(n-1)+Math.max(0,d))/n;al=(al*(n-1)+Math.max(0,-d))/n;out[i]=al===0?100:100-(100/(1+ag/al));}}
  return out;
}
export function macd(values,fast=12,slow=26,signal=9){
  const a=ema(values,fast),b=ema(values,slow),m=a.map((v,i)=>v==null||b[i]==null?null:v-b[i]);const clean=m.map(v=>v??0),s=ema(clean,signal).map((v,i)=>m[i]==null?null:v),h=m.map((v,i)=>v==null||s[i]==null?null:v-s[i]);return{macd:m,signal:s,hist:h};
}
export function stochastic(highs,lows,closes,kLen=14,dLen=3){
  const k=new Array(closes.length).fill(null);for(let i=kLen-1;i<closes.length;i++){const hh=Math.max(...highs.slice(i-kLen+1,i+1)),ll=Math.min(...lows.slice(i-kLen+1,i+1));k[i]=hh===ll?50:(closes[i]-ll)/(hh-ll)*100;}const d=smaNullable(k,dLen);return{k,d};
}
export function trueRange(bars){return bars.map((b,i)=>i===0?b.high-b.low:Math.max(b.high-b.low,Math.abs(b.high-bars[i-1].close),Math.abs(b.low-bars[i-1].close)));}
export function atr(bars,length=14){return ema(trueRange(bars),length);}
export function adx(bars,length=14){
  const plusDM=new Array(bars.length).fill(0),minusDM=new Array(bars.length).fill(0),tr=trueRange(bars);
  for(let i=1;i<bars.length;i++){const up=bars[i].high-bars[i-1].high,down=bars[i-1].low-bars[i].low;plusDM[i]=up>down&&up>0?up:0;minusDM[i]=down>up&&down>0?down:0;}
  const atrv=ema(tr,length),plus=ema(plusDM,length),minus=ema(minusDM,length),dx=new Array(bars.length).fill(null);
  for(let i=0;i<bars.length;i++){if(!atrv[i])continue;const p=100*plus[i]/atrv[i],m=100*minus[i]/atrv[i];dx[i]=(p+m)===0?0:100*Math.abs(p-m)/(p+m);}return ema(dx.map(v=>v??0),length).map((v,i)=>dx[i]==null?null:v);
}
export function cci(highs,lows,closes,length=20){
  const tp=closes.map((c,i)=>(highs[i]+lows[i]+c)/3),ma=sma(tp,length),out=new Array(tp.length).fill(null);
  for(let i=length-1;i<tp.length;i++){let md=0;for(let j=i-length+1;j<=i;j++)md+=Math.abs(tp[j]-ma[i]);md/=length;out[i]=md===0?0:(tp[i]-ma[i])/(0.015*md);}return out;
}
export function cciFromSource(values,length=20){
  const ma=sma(values,length),out=new Array(values.length).fill(null);
  for(let i=length-1;i<values.length;i++){
    let md=0,ok=true;
    for(let j=i-length+1;j<=i;j++){if(!Number.isFinite(values[j])||!Number.isFinite(ma[i])){ok=false;break;}md+=Math.abs(values[j]-ma[i]);}
    if(!ok)continue;md/=length;out[i]=md===0?0:(values[i]-ma[i])/(0.015*md);
  }
  return out;
}
export function momentum(values,length=10){return values.map((v,i)=>i<length?null:(values[i-length]===0?null:v/values[i-length]*100));}
export function roc(values,length=12){return values.map((v,i)=>i<length?null:(values[i-length]===0?null:(v-values[i-length])/values[i-length]*100));}

export function valuesToData(bars,values,maxIndex=null){
  const end=maxIndex==null?bars.length:Math.min(bars.length,maxIndex+1);const out=[];
  for(let i=0;i<end;i++)if(values[i]!=null&&Number.isFinite(values[i]))out.push({time:bars[i].time,value:values[i]});return out;
}
