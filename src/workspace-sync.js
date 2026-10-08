export class WorkspaceBus{
  constructor(onMessage){
    this.channel=null;this.onMessage=onMessage;
    try{
      this.channel=new BroadcastChannel('trade-avata-chart-v8');
      this.channel.addEventListener('message',e=>this.onMessage?.(e.data));
    }catch{}
    this.storageHandler=e=>{if(e.key==='tradeAvataChartV8Sync'&&e.newValue){try{this.onMessage?.(JSON.parse(e.newValue));}catch{}}};
    window.addEventListener('storage',this.storageHandler);
  }
  send(type,payload={}){
    const message={type,payload,at:Date.now(),source:sessionStorage.getItem('ta-window-id')||this.ensureWindowId()};
    try{this.channel?.postMessage(message);}catch{}
    try{localStorage.setItem('tradeAvataChartV8Sync',JSON.stringify(message));localStorage.removeItem('tradeAvataChartV8Sync');}catch{}
  }
  ensureWindowId(){const id=`win-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;try{sessionStorage.setItem('ta-window-id',id);}catch{}return id;}
  close(){try{this.channel?.close();}catch{}window.removeEventListener('storage',this.storageHandler);}
}

export function detachedParams(){
  const q=new URLSearchParams(location.search);
  return {detached:q.get('detached')==='1',paneId:q.get('pane')||'',slot:Number(q.get('slot')||0)};
}

export function makeDetachedUrl({paneId,slot=0}={}){
  const u=new URL(location.href);u.searchParams.set('detached','1');u.searchParams.set('pane',paneId||'pane-0');u.searchParams.set('slot',String(slot));return u.toString();
}
