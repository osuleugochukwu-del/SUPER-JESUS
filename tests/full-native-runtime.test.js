import test from 'node:test';
import assert from 'node:assert/strict';

class FakeContext{
  constructor(){this.globalAlpha=1;}
  setTransform(){} clearRect(){} fillRect(){} strokeRect(){} beginPath(){} moveTo(){} lineTo(){} stroke(){} fill(){} closePath(){} rect(){} clip(){} save(){} restore(){} setLineDash(){} fillText(){} drawImage(){}
}
class FakeCanvas{
  constructor(){this.width=0;this.height=0;this.style={};this.listeners=new Map();this.className='';this.tabIndex=0;}
  getContext(){return new FakeContext();}
  addEventListener(type,fn){this.listeners.set(type,fn);}
  removeEventListener(type){this.listeners.delete(type);}
  setPointerCapture(){} remove(){} getBoundingClientRect(){return{width:900,height:560,left:0,top:0};}
}
class FakeHost{
  constructor(){this.clientWidth=900;this.clientHeight=560;this.child=null;}
  replaceChildren(x){this.child=x;}
  getBoundingClientRect(){return{width:900,height:560,left:0,top:0};}
}

globalThis.window={devicePixelRatio:1,innerWidth:1200};
globalThis.document={createElement(tag){return tag==='canvas'?new FakeCanvas():{};}};
globalThis.ResizeObserver=class{constructor(fn){this.fn=fn;}observe(){}disconnect(){}};
globalThis.requestAnimationFrame=()=>1;
globalThis.cancelAnimationFrame=()=>{};

const {createNativeChart,NativeSeries}=await import('../src/native-chart.js');

function bars(n=200){let p=100;return Array.from({length:n},(_,i)=>{const o=p,c=o+Math.sin(i/7)*.4+.05,h=Math.max(o,c)+.2,l=Math.min(o,c)-.2;p=c;return{time:1700000000+i*60,open:o,high:h,low:l,close:c};});}

test('full native production surface can construct render and round-trip coordinates',()=>{
  const host=new FakeHost();
  const chart=createNativeChart(host,{layout:{background:{color:'#111820'},textColor:'#9db4cc'},rightPriceScale:{scaleMargins:{top:.08,bottom:.08}},timeScale:{rightOffset:12,barSpacing:7}});
  const main=chart.addSeries(NativeSeries.CandlestickSeries,{upColor:'#0a8',downColor:'#f45',priceFormat:{precision:2},constructionMode:'time'},0);
  const data=bars();main.setData(data);
  const ema=chart.addSeries(NativeSeries.LineSeries,{color:'#168cff',lineWidth:2},0);ema.setData(data.map((b,i)=>({time:b.time,value:b.close+(i%3)*.01})));
  const rsi=chart.addSeries(NativeSeries.LineSeries,{color:'#a76dff'},1);rsi.setData(data.map((b,i)=>({time:b.time,value:50+Math.sin(i/9)*25})));
  chart.timeScale().setVisibleLogicalRange({from:80,to:205});
  chart.render();
  assert.equal(chart.panes().length,2);
  chart.panes()[1].setHeight(100);
  const x=chart.timeScale().logicalToCoordinate(120);const logical=chart.timeScale().coordinateToLogical(x);assert.ok(Math.abs(logical-120)<1e-9);
  const probe=data[120].close;const y=main.priceToCoordinate(probe);const price=main.coordinateToPrice(y);assert.ok(Math.abs(price-probe)<1e-6);
  chart.setCrosshairPosition(probe,data[120].time,main);chart.render();
  assert.ok(chart.takeScreenshot());
  chart.destroy();
});

test('full native surface handles Renko construction and pane guide lines',()=>{
  const chart=createNativeChart(new FakeHost(),{rightPriceScale:{scaleMargins:{top:.08,bottom:.08}}});
  const r=chart.addSeries(NativeSeries.CandlestickSeries,{constructionMode:'renko-pips',upColor:'#0a8',downColor:'#f45'},0);
  r.setData([{time:1,open:100,high:101,low:100,close:101},{time:2,open:101,high:102,low:101,close:102},{time:3,open:101,high:101,low:100,close:100}]);
  const osc=chart.addSeries(NativeSeries.LineSeries,{color:'#fff'},1);osc.setData([{time:1,value:30},{time:2,value:55},{time:3,value:70}]);osc.createPriceLine({price:50,color:'#999'});
  chart.timeScale().fitContent();chart.render();
  assert.ok(chart.timeScale().getVisibleLogicalRange());
  assert.ok(Number.isFinite(r.priceToCoordinate(101)));
});
