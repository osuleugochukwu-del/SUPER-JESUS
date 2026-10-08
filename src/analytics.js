export function summarizeTrades(trades=[],startingBalance=10000){
  const closed=trades.filter(t=>Number.isFinite(Number(t.pnl)));
  const pnl=closed.map(t=>Number(t.pnl)||0),wins=pnl.filter(x=>x>0),losses=pnl.filter(x=>x<0);
  const grossProfit=wins.reduce((a,b)=>a+b,0),grossLoss=Math.abs(losses.reduce((a,b)=>a+b,0));
  const net=grossProfit-grossLoss;
  const winRate=closed.length?wins.length/closed.length*100:0;
  const profitFactor=grossLoss?grossProfit/grossLoss:(grossProfit?Infinity:0);
  const avgWin=wins.length?grossProfit/wins.length:0,avgLoss=losses.length?grossLoss/losses.length:0;
  const expectancy=closed.length?net/closed.length:0;
  let bal=startingBalance,peak=bal,maxDD=0,maxDDPct=0;const equity=[{i:0,value:bal,time:closed[0]?.openTime||Date.now()}];
  closed.forEach((t,i)=>{bal+=Number(t.pnl)||0;peak=Math.max(peak,bal);const dd=peak-bal;maxDD=Math.max(maxDD,dd);maxDDPct=Math.max(maxDDPct,peak?dd/peak*100:0);equity.push({i:i+1,value:bal,time:t.closeTime||t.openTime||Date.now()+i});});
  const avgR=mean(closed.map(t=>Number(t.rMultiple)).filter(Number.isFinite));
  const long=closed.filter(t=>String(t.side).toLowerCase()==='buy'||String(t.side).toLowerCase()==='long');
  const short=closed.filter(t=>String(t.side).toLowerCase()==='sell'||String(t.side).toLowerCase()==='short');
  const avgDurationMs=mean(closed.map(t=>duration(t)).filter(Number.isFinite));
  const avgPips=mean(closed.map(t=>Number(t.pips)).filter(Number.isFinite));
  const commissions=closed.reduce((a,t)=>a+Math.abs(Number(t.commission)||0),0);
  const volume=closed.reduce((a,t)=>a+(Number(t.size)||Number(t.volume)||0),0);
  return {
    totalTrades:closed.length,wins:wins.length,losses:losses.length,winRate,net,grossProfit,grossLoss,profitFactor,
    avgWin,avgLoss,expectancy,maxDD,maxDDPct,startingBalance,currentBalance:bal,equity,avgR,avgDurationMs,avgPips,commissions,volume,
    long:summarizeSubset(long),short:summarizeSubset(short),
    largestWin:wins.length?Math.max(...wins):0,largestLoss:losses.length?Math.min(...losses):0,
  };
}

function summarizeSubset(trades){
  const pnl=trades.map(t=>Number(t.pnl)||0),net=pnl.reduce((a,b)=>a+b,0),wins=pnl.filter(x=>x>0).length;
  return {count:trades.length,net,winRate:trades.length?wins/trades.length*100:0};
}
function duration(t){const a=new Date(t.openTime||0).getTime(),b=new Date(t.closeTime||0).getTime();return a&&b&&b>=a?b-a:NaN;}
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:0;}

export function profitabilityBySymbol(trades=[]){
  const map=new Map();
  for(const t of trades){const s=t.symbol||'Unknown',x=map.get(s)||{symbol:s,trades:0,wins:0,losses:0,net:0,long:0,short:0,pips:0,volume:0};x.trades++;const p=Number(t.pnl)||0;x.net+=p;if(p>0)x.wins++;if(p<0)x.losses++;if(String(t.side).toLowerCase().startsWith('b')||String(t.side).toLowerCase()==='long')x.long+=p;else x.short+=p;x.pips+=Number(t.pips)||0;x.volume+=Number(t.size)||Number(t.volume)||0;map.set(s,x);}
  return [...map.values()].sort((a,b)=>b.net-a.net);
}

export function performanceByBucket(trades=[],bucket='day'){ 
  const map=new Map();
  for(const t of trades){const d=new Date(t.closeTime||t.openTime||Date.now());let key;if(bucket==='hour')key=String(d.getHours()).padStart(2,'0')+':00';else if(bucket==='weekday')key=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];else key=d.toISOString().slice(0,10);const x=map.get(key)||{key,trades:0,wins:0,losses:0,net:0};x.trades++;const p=Number(t.pnl)||0;x.net+=p;if(p>0)x.wins++;if(p<0)x.losses++;map.set(key,x);}return [...map.values()];
}

export function behaviorInsights(trades=[]){
  if(!trades.length)return ['Complete replay trades or connect broker history to generate behavioural insights.'];
  const s=summarizeTrades(trades);const out=[];
  if(s.avgLoss>s.avgWin*1.5&&s.losses)out.push('Average losing trade is much larger than the average winner. Review stop discipline and loss size.');
  if(s.winRate>55&&s.net<0)out.push('Win rate is positive but net P&L is negative. Large losses are outweighing frequent small wins.');
  if(s.winRate<40&&s.profitFactor>1)out.push('Low win rate is being offset by larger winners. Protect reward-to-risk quality rather than chasing more trades.');
  if(s.maxDDPct>10)out.push(`Maximum drawdown reached ${s.maxDDPct.toFixed(1)}%. Consider reducing risk during losing sequences.`);
  const afterLoss=[];for(let i=1;i<trades.length;i++)if((Number(trades[i-1].pnl)||0)<0)afterLoss.push(Number(trades[i].pnl)||0);if(afterLoss.length>=3&&mean(afterLoss)<s.expectancy*0.5)out.push('Performance after a losing trade is weaker than your overall expectancy. Watch for revenge trading or rushed re-entry.');
  const hours=performanceByBucket(trades,'hour').sort((a,b)=>b.net-a.net);if(hours.length>1){out.push(`Best observed trading hour: ${hours[0].key}. Weakest observed hour: ${hours.at(-1).key}.`);}
  const symbols=profitabilityBySymbol(trades);if(symbols.length>1)out.push(`Best symbol in this sample: ${symbols[0].symbol}; weakest: ${symbols.at(-1).symbol}.`);
  if(!out.length)out.push('No dominant behavioural weakness detected in the current sample. Continue collecting trades for stronger conclusions.');
  return out;
}

export function formatDuration(ms){
  if(!Number.isFinite(ms)||ms<=0)return '—';const mins=Math.round(ms/60000);if(mins<60)return `${mins}m`;const h=Math.floor(mins/60),m=mins%60;return `${h}h ${m}m`;
}

export function makeDemoHistory(){
  const symbols=['XAUUSD','XAUUSD','NAS100','EURUSD','XAUUSD','GBPUSD'];const out=[];let balance=10000;
  for(let i=0;i<36;i++){
    const symbol=symbols[i%symbols.length],side=i%3===0?'Sell':'Buy',risk=70+(i%5)*15;
    const edge=Math.sin(i*1.7)*1.1+Math.cos(i*.53)*.7;const r=Math.round((edge+(i%4===0?-0.8:.35))*100)/100;const pnl=Math.round(r*risk*100)/100;
    const open=new Date(Date.now()-(36-i)*6*3600000);const close=new Date(open.getTime()+(20+(i*17)%160)*60000);balance+=pnl;
    out.push({id:`H-${1000+i}`,symbol,side,size:.1+(i%4)*.05,pnl,rMultiple:r,pips:Math.round(r*(8+(i%7))*10)/10,commission:1.5+(i%3)*.4,openTime:open.toISOString(),closeTime:close.toISOString(),balance});
  }
  return out;
}
