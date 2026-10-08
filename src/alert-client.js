export async function requestBrowserNotifications(){
  if(!('Notification'in window))return'unsupported';
  if(Notification.permission==='granted')return'granted';
  return Notification.requestPermission();
}
export function showBrowserNotification(title,body){
  if('Notification'in window&&Notification.permission==='granted'){
    try{return new Notification(title,{body,icon:'./public/brand/trade-avata-logo.svg'});}catch{}
  }
  return null;
}
export function playAlertTone(){
  try{
    const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
    const ctx=new A(),osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type='sine';osc.frequency.value=880;gain.gain.setValueAtTime(.001,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.12,ctx.currentTime+.02);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.35);osc.connect(gain).connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.36);osc.onended=()=>ctx.close();
  }catch{}
}
