export async function fetchOnlineReplay({gateway,symbol,timeframe,start,end}){
  if(!gateway)throw new Error('Online replay server is not configured.');
  const base=gateway.replace(/\/$/,'');
  const q=new URLSearchParams({symbol,timeframe,start:String(start||''),end:String(end||'')});
  const r=await fetch(`${base}/api/replay/bars?${q}`,{credentials:'include'});
  if(!r.ok)throw new Error(await r.text()||`Replay request failed (${r.status})`);
  const data=await r.json();
  if(!Array.isArray(data.bars))throw new Error('Replay server returned invalid data.');
  return data.bars;
}
