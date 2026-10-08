export function canUseSpeechRecognition(){return typeof window!=='undefined'&&!!(window.SpeechRecognition||window.webkitSpeechRecognition);}

export function startSpeechRecognition({language='en-US',onResult,onState,onError}={}){
  if(!canUseSpeechRecognition()){onError?.(new Error('Speech recognition is not available in this browser.'));return null;}
  const Ctor=window.SpeechRecognition||window.webkitSpeechRecognition;
  const rec=new Ctor();rec.lang=language;rec.interimResults=true;rec.continuous=false;rec.maxAlternatives=1;
  rec.onstart=()=>onState?.('listening');
  rec.onend=()=>onState?.('idle');
  rec.onerror=e=>{onState?.('idle');onError?.(new Error(e.error||'Voice input failed.'));};
  rec.onresult=e=>{let finalText='',interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=t;else interim+=t;}onResult?.({finalText:finalText.trim(),interim:interim.trim()});};
  rec.start();return rec;
}

export function speakText(text,{language='en-US',rate=1}={}){
  if(typeof window==='undefined'||!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined')return false;
  window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(String(text||''));u.lang=language;u.rate=rate;window.speechSynthesis.speak(u);return true;
}
export function stopSpeech(){if(typeof window!=='undefined'&&window.speechSynthesis)window.speechSynthesis.cancel();}

export function aiGateway(){
  if(typeof window==='undefined')return '';
  return window.TRADE_AVATA_AI_GATEWAY||localStorage.getItem('tradeAvataAiGateway')||window.TRADE_AVATA_BROKER_GATEWAY||localStorage.getItem('tradeAvataBrokerGateway')||'';
}

export async function requestAI({channel='market',message,context}={}){
  const gateway=aiGateway();if(!gateway)throw new Error('Secure AI backend is not configured yet.');
  const r=await fetch(`${gateway.replace(/\/$/,'')}/api/ai/${channel}`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,context})});
  if(r.status===401||r.status===403)throw new Error('Your account is not permitted to use AI chat.');
  if(!r.ok){const t=await r.text().catch(()=> '');throw new Error(t||`AI gateway returned ${r.status}`);}
  const out=await r.json();return String(out.reply||out.message||out.text||'').trim();
}
