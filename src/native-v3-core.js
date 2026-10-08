/*
 * Trade Avata Native Engine v3.0 — pure chart geometry/core.
 *
 * This file deliberately has NO dependency on third-party chart libraries
 * and NO DOM dependency. The browser renderer consumes these helpers, while
 * Node tests can stress the same coordinate/viewport rules.
 */

export const TA_NATIVE_V3_BUILD='Trade Avata Native Engine v3.0';

export function clamp(v,min,max){
  return Math.max(min,Math.min(max,v));
}

export function finite(v,fallback=0){
  const n=Number(v);
  return Number.isFinite(n)?n:fallback;
}

export function visibleCapacity(plotWidth,spacing){
  return Math.max(2,Math.floor(Math.max(1,plotWidth)/Math.max(.25,spacing)));
}

export function liveGapPx(plotWidth,pct=10){
  return clamp(Math.max(0,plotWidth)*finite(pct,10)/100,0,Math.max(0,plotWidth)*.30);
}

export function nativeWindow({
  length,
  plotWidth,
  spacing=8,
  scrollBars=0,
  liveGapPercent=10,
  edgePadding=4
}={}){
  const n=Math.max(0,Math.floor(finite(length,0)));
  if(!n)return{start:0,end:-1,lastX:0,capacity:0,spacing:Math.max(.25,spacing)};

  const gap=liveGapPx(plotWidth,liveGapPercent);
  const s=Math.max(.25,finite(spacing,8));
  const right=Math.max(0,plotWidth)-Math.max(0,edgePadding);
  const left=Math.max(0,edgePadding);
  const last=n-1;
  const liveX=right-gap;
  const rawLastX=liveX+finite(scrollBars,0)*s;
  const end=clamp(Math.floor(last+(right-rawLastX)/s+1e-9),0,last);
  const start=clamp(Math.ceil(last+(left-rawLastX)/s-1e-9),0,end);
  const lastX=rawLastX-(last-end)*s;

  return{
    start,
    end,
    lastX,
    spacing:s,
    capacity:visibleCapacity(Math.max(1,right-left),s),
    liveGap:gap,
    left,
    right
  };
}

export function xForIndex(index,window){
  if(!window||window.end<window.start)return null;
  return window.lastX-(window.end-finite(index))*window.spacing;
}

export function indexForX(x,window){
  if(!window||window.end<window.start)return 0;
  return window.end+(finite(x)-window.lastX)/window.spacing;
}

export function autoPriceRange(bars,{start=0,end=bars?.length-1,pad=.08,minSpan=1e-8}={}){
  if(!Array.isArray(bars)||!bars.length)return{min:0,max:1};
  const a=clamp(Math.floor(finite(start,0)),0,bars.length-1);
  const b=clamp(Math.ceil(finite(end,bars.length-1)),a,bars.length-1);
  let lo=Infinity,hi=-Infinity;

  for(let i=a;i<=b;i++){
    const bar=bars[i];
    const low=finite(bar?.low,finite(bar?.close,0));
    const high=finite(bar?.high,finite(bar?.close,0));
    if(Number.isFinite(low))lo=Math.min(lo,low);
    if(Number.isFinite(high))hi=Math.max(hi,high);
  }

  if(!Number.isFinite(lo)||!Number.isFinite(hi))return{min:0,max:1};
  if(hi<=lo){
    const d=Math.max(Math.abs(lo)*.001,minSpan);
    lo-=d;hi+=d;
  }

  const span=Math.max(minSpan,hi-lo);
  const p=span*clamp(finite(pad,.08),0,.40);
  return{min:lo-p,max:hi+p};
}

export function yForPrice(price,range,top,height){
  const min=finite(range?.min,0),max=finite(range?.max,1);
  const span=Math.max(1e-12,max-min);
  return finite(top,0)+(max-finite(price,min))/span*Math.max(1,finite(height,1));
}

export function priceForY(y,range,top,height){
  const min=finite(range?.min,0),max=finite(range?.max,1);
  const span=Math.max(1e-12,max-min);
  const q=clamp((finite(y)-finite(top,0))/Math.max(1,finite(height,1)),0,1);
  return max-q*span;
}

export function scaleRange(range,factor,anchorPrice=null,anchorRatio=.5){
  const min=finite(range?.min,0),max=finite(range?.max,1);
  const oldSpan=Math.max(1e-12,max-min);
  const f=clamp(finite(factor,1),.05,20);
  const span=oldSpan*f;
  const ratio=clamp(finite(anchorRatio,.5),0,1);
  const anchor=Number.isFinite(Number(anchorPrice))?Number(anchorPrice):(max-oldSpan*ratio);
  return{
    min:anchor-span*(1-ratio),
    max:anchor+span*ratio
  };
}

export function panRange(range,deltaPrice){
  const d=finite(deltaPrice,0);
  return{min:finite(range?.min,0)+d,max:finite(range?.max,1)+d};
}

export function preservePriceAnchor(oldRange,newBaseRange,anchorPrice,anchorRatio=.5){
  const baseSpan=Math.max(1e-12,finite(newBaseRange?.max,1)-finite(newBaseRange?.min,0));
  const q=clamp(finite(anchorRatio,.5),.08,.92);
  const p=finite(anchorPrice,(finite(newBaseRange?.min,0)+finite(newBaseRange?.max,1))/2);
  return{min:p-baseSpan*(1-q),max:p+baseSpan*q};
}

export function roundStep(range,target=8){
  const rough=Math.max(1e-12,Math.abs(finite(range,1))/Math.max(2,finite(target,8)));
  const power=10**Math.floor(Math.log10(rough));
  const n=rough/power;
  const unit=n<=1?1:n<=2?2:n<=5?5:10;
  return unit*power;
}

export function priceTicks(range,target=8){
  const min=finite(range?.min,0),max=finite(range?.max,1);
  const step=roundStep(max-min,target);
  const out=[];
  let p=Math.ceil(min/step)*step;
  let guard=0;
  while(p<=max+step*.001&&guard++<100){out.push(p);p+=step;}
  return out;
}

export function timeTickIndices(window,target=8){
  if(!window||window.end<window.start)return[];
  const count=Math.max(1,window.end-window.start+1);
  const step=Math.max(1,Math.ceil(count/Math.max(2,target)));
  const out=[];
  let first=Math.ceil(window.start/step)*step;
  for(let i=first;i<=window.end;i+=step)out.push(i);
  return out;
}

export function homeSpacing(plotWidth,targetBars=120,liveGapPercent=10){
  const usable=Math.max(80,finite(plotWidth,800)-liveGapPx(plotWidth,liveGapPercent));
  return clamp(usable/Math.max(12,finite(targetBars,120)),1.25,32);
}

export function indicatorRange(seriesList,start,end,{guides=[],fixed=null,pad=.08}={}){
  if(fixed&&Number.isFinite(fixed.min)&&Number.isFinite(fixed.max))return{min:fixed.min,max:fixed.max};
  let lo=Infinity,hi=-Infinity;
  for(const series of seriesList||[]){
    const vals=series?.values||[];
    for(let i=Math.max(0,start);i<=Math.min(vals.length-1,end);i++){
      const v=vals[i];
      if(Number.isFinite(v)){lo=Math.min(lo,v);hi=Math.max(hi,v);}
    }
  }
  for(const g of guides||[]){if(Number.isFinite(g)){lo=Math.min(lo,g);hi=Math.max(hi,g);}}
  if(!Number.isFinite(lo)||!Number.isFinite(hi))return{min:0,max:1};
  if(hi<=lo){lo-=1;hi+=1;}
  const span=hi-lo;
  return{min:lo-span*pad,max:hi+span*pad};
}

export function validateNativeWindow(window,length){
  if(!window||!Number.isFinite(window.start)||!Number.isFinite(window.end))return false;
  if(length<=0)return window.end===-1;
  return window.start>=0&&window.end>=window.start&&window.end<length&&window.spacing>0;
}
