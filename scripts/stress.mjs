import { resolveConstruction, historyPlanForPeriod, defaultHomeBars, constructionId } from '../src/chart-transition.js';
import { renkoBars } from '../src/data.js';

const modes=['time','renko-pips','renko-time','range-pips','tick'];
const types=['Candles','Heikin-Ashi','Bars','Line','Area','Renko','Range'];
const timeValues=['1s','5s','15s','30s','1m','5m','15m','1h'];
const renkoTimes=['5s','15s','30s','1m','5m','15m','1h'];
let seed=0x9e3779b9;
const rnd=()=>{seed=(Math.imul(seed^seed>>>16,0x45d9f3b)>>>0);seed=(Math.imul(seed^seed>>>16,0x45d9f3b)>>>0);seed=(seed^seed>>>16)>>>0;return seed/4294967296;};
const pick=a=>a[Math.floor(rnd()*a.length)];
const fail=(i,msg)=>{throw new Error(`stress case ${i}: ${msg}`);};

for(let i=0;i<100000;i++){
  const mode=pick(modes);
  let value;
  if(mode==='time')value=pick(timeValues);
  else if(mode==='renko-time')value=pick(renkoTimes);
  else value=[1,2,3,5,10,20,50,100][Math.floor(rnd()*8)];
  const requested={chartType:pick(types),period:{mode,value}};
  const resolved=resolveConstruction(requested);
  if(['renko-pips','renko-time','range-pips','tick'].includes(resolved.period.mode)&&resolved.chartType!=='Candles')fail(i,'non-time construction layered on non-candle shell');
  const id=constructionId(resolved.chartType,resolved.period);
  if(!id)fail(i,'missing construction id');
  const plan=historyPlanForPeriod(resolved.period);
  if(!plan.baseTimeframe||!Number.isFinite(plan.count)||plan.count<1800)fail(i,'invalid history plan');
  const home=defaultHomeBars({period:resolved.period,isMobile:rnd()<.5,length:1000});
  if(!Number.isFinite(home)||home<24||home>180)fail(i,'invalid home target');

  // Every twentieth scenario also exercises the real Renko threshold builder.
  if(i%20===0){
    const bars=[];let p=100;
    for(let j=0;j<36;j++){
      const open=p,delta=(rnd()-.5)*4,close=open+delta;
      bars.push({time:j+1,open,high:Math.max(open,close)+rnd(),low:Math.min(open,close)-rnd(),close,volume:1});
      p=close;
    }
    const size=.5+[1,2,4][Math.floor(rnd()*3)]*.25;
    const out=renkoBars(bars,size);
    let prevTime=-Infinity;
    for(const b of out){
      if(!(b.high>=Math.max(b.open,b.close)&&b.low<=Math.min(b.open,b.close)))fail(i,'invalid Renko OHLC');
      if(!(b.time>prevTime))fail(i,'Renko time not strictly increasing');
      prevTime=b.time;
      if(b.renkoDirection!=null&&![-1,1].includes(b.renkoDirection))fail(i,'invalid Renko direction');
      if(out.length>1&&Math.abs(Math.abs(b.close-b.open)-size)>1e-9)fail(i,'Renko brick size drift');
    }
  }
}

console.log('Trade Avata v9.3 stress: 100,000 randomized transition/Renko scenarios passed.');
