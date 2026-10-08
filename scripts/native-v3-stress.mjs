import {
  nativeWindow,xForIndex,indexForX,autoPriceRange,yForPrice,priceForY,
  scaleRange,preservePriceAnchor,validateNativeWindow,homeSpacing
} from '../src/native-v3-core.js';

function rand(a,b){return a+Math.random()*(b-a);}
function assert(ok,msg){if(!ok)throw new Error(msg);}

for(let t=0;t<100000;t++){
  const length=Math.floor(rand(30,30000));
  const width=rand(280,2400);
  const spacing=rand(1.25,32);
  const scroll=rand(-10,80);
  const win=nativeWindow({length,plotWidth:width,spacing,scrollBars:scroll,liveGapPercent:rand(0,25),edgePadding:rand(1,8)});
  assert(validateNativeWindow(win,length),'invalid native window');

  const i=Math.floor(rand(win.start,win.end+1));
  const x=xForIndex(i,win),j=indexForX(x,win);
  assert(Math.abs(i-j)<1e-7,'logical coordinate drift');

  const base=rand(.5,100000),span=rand(.0001,base*.08+1),range={min:base-span,max:base+span};
  const p=rand(range.min,range.max),h=rand(180,1200),y=yForPrice(p,range,0,h),q=priceForY(y,range,0,h);
  assert(Math.abs(p-q)<=Math.max(1e-7,Math.abs(p)*1e-10),'price coordinate drift');

  const ratio=rand(.08,.92),scaled=scaleRange(range,rand(.15,4),p,ratio);
  const recovered=scaled.max-(scaled.max-scaled.min)*ratio;
  assert(Math.abs(recovered-p)<=Math.max(1e-7,Math.abs(p)*1e-10),'scale anchor drift');

  const target=preservePriceAnchor(null,range,p,ratio);
  const rr=(target.max-p)/(target.max-target.min);
  assert(Math.abs(rr-ratio)<1e-7,'timeframe anchor drift');

  const bars=[];let price=base;
  for(let k=0;k<12;k++){const o=price,c=o+rand(-span*.1,span*.1),hi=Math.max(o,c)+rand(0,span*.05),lo=Math.min(o,c)-rand(0,span*.05);bars.push({open:o,high:hi,low:lo,close:c});price=c;}
  const ar=autoPriceRange(bars,{start:0,end:bars.length-1,pad:.08});
  assert(bars.every(b=>b.low>=ar.min&&b.high<=ar.max),'auto range clipped OHLC');

  const hs=homeSpacing(width,Math.floor(rand(24,200)),10);
  assert(hs>=1.25&&hs<=32,'invalid Home spacing');
}

console.log('Trade Avata Native v3 stress: 100,000 native geometry/axis/Home/timeframe-anchor scenarios passed.');
