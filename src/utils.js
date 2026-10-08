export const $=(s,r=document)=>r.querySelector(s);
export const $$=(s,r=document)=>[...r.querySelectorAll(s)];
export function el(tag,attrs={},...children){
  const n=document.createElement(tag);
  for(const [k,v] of Object.entries(attrs||{})){
    if(k==='class')n.className=v;
    else if(k==='html')n.innerHTML=v;
    else if(k.startsWith('on')&&typeof v==='function')n.addEventListener(k.slice(2).toLowerCase(),v);
    else if(v!==false&&v!=null)n.setAttribute(k,v===true?'':String(v));
  }
  for(const c of children.flat()){
    if(c==null||c===false)continue;
    n.append(c.nodeType?c:document.createTextNode(String(c)));
  }
  return n;
}
export function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
export function debounce(fn,ms=80){let t;return(...a)=>{clearTimeout(t);t=setTimeout(()=>fn(...a),ms);};}
export function uid(prefix='id'){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,8)}`;}
export function toast(message,type='info'){
  const box=document.getElementById('toast-layer'); if(!box)return;
  const t=el('div',{class:`toast ${type}`},message);box.append(t);setTimeout(()=>t.classList.add('show'),10);setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),220);},2800);
}
export function icon(name){
  const map={
    cursor:'↖',crosshair:'＋',crossline:'⌖',trend:'╱',ray:'↗',horizontal:'━',vertical:'┃',rectangle:'□',fibonacci:'≋',text:'T',arrow:'➜',channel:'⌁',measure:'↔',brush:'✎',highlighter:'▰',long:'L',short:'S',magnet:'∩',lock:'⌑',hide:'◉',delete:'⌫',settings:'⚙',watchlist:'☷',market:'▦',ai:'✦',calendar:'▦',alerts:'◇',news:'▧',objects:'◇',tools:'▦',ops:'◌',more:'•••'
  };return map[name]||'·';
}
export function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},200);}
