/*
 * Trade Avata Native Chart v3.2 — price-scale integrity + smooth direct drag patch.
 *
 * Zero third-party chart dependencies. The compatibility API intentionally
 * mirrors the small subset the Trade Avata workspace already consumes while
 * the renderer, axes, panes, crosshair and interactions are fully native.
 *
 * This patch keeps the approved SUPER-JESUS chart surface intact and changes only
 * engine-level interaction behavior:
 * - main price-axis manual ranges always stay in real instrument prices
 * - invalid / zero-centered main ranges are rejected and repaired
 * - AUTO/Home truly clears native manual price ranges
 * - normal drag is direct: hold -> move -> release -> stop (no fling)
 * - horizontal rendering keeps fractional positions for smooth movement
 */
import {
  clamp, yForPrice, priceForY, scaleRange,
  priceTicks, timeTickIndices
} from './native-v3-core.js';

export const NativeSeries={
  CandlestickSeries:'candlestick',
  BarSeries:'bar',
  LineSeries:'line',
  AreaSeries:'area',
  HistogramSeries:'histogram',
  CrosshairMode:{Normal:0,MagnetOHLC:1},
  LineStyle:{Solid:0,Dotted:1,Dashed:2},
  PriceScaleMode:{Normal:0,Logarithmic:1,Percentage:2,IndexedTo100:3}
};

const DPR=()=>Math.max(1,Math.min(4,window.devicePixelRatio||1));
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
const snapPx=v=>Math.round(Number(v)*DPR())/DPR();
const snapSize=v=>Math.max(1/DPR(),Math.round(Number(v)*DPR())/DPR());
const rgbaTransparent=v=>String(v||'').replace(/\s/g,'')==='rgba(0,0,0,0)'||String(v||'')==='transparent';

const hexAlpha=(color,alpha=1)=>{
  if(typeof color!=='string')return color;
  if(/^#[0-9a-f]{6}$/i.test(color)){
    const a=Math.round(clamp(alpha,0,1)*255).toString(16).padStart(2,'0');
    return `${color}${a}`;
  }
  return color;
};

function timezoneId(value){
  if(value==='UTC')return'UTC';
  if(value==='UTC+1 Lagos')return'Africa/Lagos';
  return undefined;
}

function fmtTime(sec,timezone='Local',withSeconds=false){
  const d=new Date(Number(sec)*1000);
  if(!Number.isFinite(d.getTime()))return'';
  const tz=timezoneId(timezone);

  const opts={
    hour:'2-digit',
    minute:'2-digit',
    hour12:false,
    ...(withSeconds?{second:'2-digit'}:{})
  };

  if(tz)opts.timeZone=tz;
  return new Intl.DateTimeFormat(undefined,opts).format(d);
}

function fmtDate(sec,timezone='Local'){
  const d=new Date(Number(sec)*1000);
  if(!Number.isFinite(d.getTime()))return'';

  const opts={month:'short',day:'numeric'};
  const tz=timezoneId(timezone);

  if(tz)opts.timeZone=tz;

  return new Intl.DateTimeFormat(undefined,opts).format(d);
}

function fmtNumber(v,precision=2){
  const n=Number(v);
  return Number.isFinite(n)
    ?n.toFixed(Math.max(0,Math.min(8,precision)))
    :'—';
}

function lineDash(style){
  if(style===2||style==='dashed')return[6,4];
  if(style===1||style==='dotted')return[2,3];
  return[];
}

function rgbaWithAlpha(color,alpha){
  if(!Number.isFinite(alpha)||alpha>=.999)return color;

  if(/^#[0-9a-f]{6}$/i.test(String(color||''))){
    return hexAlpha(color,alpha);
  }

  return color;
}

function separatorKey(sec,interval){
  const d=new Date(Number(sec)*1000);

  if(interval<=3600){
    return`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  }

  if(interval<=14400){
    const copy=new Date(
      Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.getUTCDate()
      )
    );

    const day=(copy.getUTCDay()+6)%7;
    copy.setUTCDate(copy.getUTCDate()-day);

    return`w-${copy.toISOString().slice(0,10)}`;
  }

  if(interval<=86400){
    return`${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  }

  return`${d.getUTCFullYear()}`;
}

class NativePaneHandle{
  constructor(chart,index){
    this.chart=chart;
    this.index=index;
  }

  getHeight(){
    return this.chart._paneRects()[this.index]?.height||0;
  }

  setHeight(h){
    if(this.index===0)return;

    this.chart.paneHeights.set(
      this.index,
      Math.max(42,finite(h,90))
    );

    this.chart.requestRender();
  }
}

class NativePriceScale{
  constructor(chart,id='right'){
    this.chart=chart;
    this.id=id;
  }

  applyOptions(opts={}){
    const previousMode=finite(
      this.chart.priceScaleOptions.mode,
      0
    );

    Object.assign(
      this.chart.priceScaleOptions,
      opts||{}
    );

    if(opts?.scaleMargins){
      this.chart.priceScaleOptions.scaleMargins={
        ...this.chart.priceScaleOptions.scaleMargins,
        ...opts.scaleMargins
      };
    }

    /*
     * AUTO/Home must actually remove the internal native manual Y-range.
     *
     * Before this repair the chart could say AUTO while an old manual
     * range still existed internally.
     */
    if(opts?.autoScale===true){
      this.chart.manualPaneRanges.delete(0);
      this.chart.lastValidMainRange=null;
    }

    /*
     * Prevent a manual price range captured under one scale mode
     * contaminating another mode.
     */
    if(
      Object.prototype.hasOwnProperty.call(opts||{},'mode') &&
      finite(opts.mode,0)!==previousMode
    ){
      this.chart.manualPaneRanges.delete(0);
      this.chart.lastValidMainRange=null;
      this.chart.priceScaleOptions.autoScale=true;
    }

    this.chart.requestRender();
  }

  options(){
    return structuredClone(
      this.chart.priceScaleOptions
    );
  }
}

class NativeTimeScale{
  constructor(chart){
    this.chart=chart;
  }

  options(){
    return structuredClone(
      this.chart.timeScaleOptions
    );
  }

  applyOptions(opts={}){
    const oldOffset=finite(
      this.chart.timeScaleOptions.rightOffset,
      0
    );

    Object.assign(
      this.chart.timeScaleOptions,
      opts||{}
    );

    if(
      Number.isFinite(Number(opts.rightOffset)) &&
      this.chart.visibleRange &&
      !Number.isFinite(Number(opts.barSpacing))
    ){
      const d=
        Number(opts.rightOffset)-
        oldOffset;

      this.chart._setRange({
        from:this.chart.visibleRange.from+d,
        to:this.chart.visibleRange.to+d
      },{
        emit:true
      });
    }

    if(
      Number.isFinite(Number(opts.barSpacing)) &&
      this.chart.visibleRange
    ){
      const plot=this.chart._plotRect();

      const span=this.chart._boundedSpan(
        plot.width/
        Math.max(.25,Number(opts.barSpacing))
      );

      const c=
        (
          this.chart.visibleRange.from+
          this.chart.visibleRange.to
        )/2;

      this.chart._setRange({
        from:c-span/2,
        to:c+span/2
      },{
        emit:true
      });
    }

    this.chart.requestRender();
  }

  subscribeVisibleLogicalRangeChange(fn){
    this.chart.rangeListeners.add(fn);
  }

  unsubscribeVisibleLogicalRangeChange(fn){
    this.chart.rangeListeners.delete(fn);
  }

  getVisibleLogicalRange(){
    return this.chart.visibleRange
      ?{...this.chart.visibleRange}
      :null;
  }

  setVisibleLogicalRange(range){
    if(
      !range ||
      !Number.isFinite(range.from) ||
      !Number.isFinite(range.to) ||
      range.to<=range.from
    )return;

    this.chart._setRange(
      range,
      {emit:true}
    );
  }

  fitContent(){
    const n=this.chart._dataLength();

    if(!n)return;

    this.chart.followLive=false;

    this.setVisibleLogicalRange({
      from:-1,
      to:n
    });
  }

  scrollToRealTime(){
    const n=this.chart._dataLength();

    if(!n)return;

    const span=
      this.chart.visibleRange
        ?Math.max(
          12,
          this.chart.visibleRange.to-
          this.chart.visibleRange.from
        )
        :100;

    const off=finite(
      this.chart.timeScaleOptions.rightOffset,
      12
    );

    this.chart.followLive=true;

    this.chart._setRange({
      from:n-1+off-span,
      to:n-1+off
    },{
      emit:true
    });
  }

  logicalToCoordinate(logical){
    const r=this.chart.visibleRange;
    const p=this.chart._plotRect();

    if(!r)return null;

    return p.left+
      (
        Number(logical)-r.from
      )/
      (
        r.to-r.from
      )*
      p.width;
  }

  coordinateToLogical(x){
    const r=this.chart.visibleRange;
    const p=this.chart._plotRect();

    if(!r)return 0;

    return r.from+
      (
        Number(x)-p.left
      )/
      Math.max(1,p.width)*
      (
        r.to-r.from
      );
  }

  timeToCoordinate(time){
    const data=this.chart._mainData();

    if(!data.length)return null;

    const t=Number(time);

    let lo=0;
    let hi=data.length-1;

    while(lo<=hi){
      const m=(lo+hi)>>1;
      const mt=Number(data[m]?.time);

      if(mt===t){
        return this.logicalToCoordinate(m);
      }

      if(mt<t){
        lo=m+1;
      }else{
        hi=m-1;
      }
    }

    return this.logicalToCoordinate(
      clamp(
        lo,
        0,
        data.length-1
      )
    );
  }
}

class NativeSeriesObject{
  constructor(
    chart,
    type,
    options={},
    paneIndex=0
  ){
    this.chart=chart;
    this.type=type;
    this.optionsData={...options};
    this.paneIndex=paneIndex;
    this.data=[];
    this.priceLines=[];
  }

  setData(data){
    const before=this.data.length;

    this.data=
      Array.isArray(data)
        ?data.slice()
        :[];

    this.chart._ensureInitialRange();

    this.chart._onSeriesDataChanged(
      this,
      before,
      this.data.length
    );

    this.chart.requestRender();
  }

  update(item){
    if(!item)return;

    const before=this.data.length;
    const t=Number(item.time);
    const last=this.data.at(-1);

    if(
      last &&
      Number(last.time)===t
    ){
      this.data[
        this.data.length-1
      ]=item;
    }else{
      this.data.push(item);
    }

    this.chart._ensureInitialRange();

    this.chart._onSeriesDataChanged(
      this,
      before,
      this.data.length
    );

    this.chart.requestRender();
  }

  applyOptions(opts={}){
    Object.assign(
      this.optionsData,
      opts||{}
    );

    this.chart.requestRender();
  }

  options(){
    return structuredClone(
      this.optionsData
    );
  }

  priceToCoordinate(price){
    return this.chart._priceToY(
      Number(price),
      this.paneIndex,
      this
    );
  }

  coordinateToPrice(y){
    return this.chart._yToPrice(
      Number(y),
      this.paneIndex,
      this
    );
  }

  createPriceLine(opts={}){
    const x={
      ...opts,
      id:
        `pl-${Date.now()}-`+
        Math.random()
          .toString(36)
          .slice(2,7)
    };

    this.priceLines.push(x);

    this.chart.requestRender();

    return x;
  }

  removePriceLine(line){
    this.priceLines=
      this.priceLines.filter(
        x=>
          x!==line &&
          x.id!==line?.id
      );

    this.chart.requestRender();
  }
}

export class TradeAvataNativeChart{
  constructor(host,options={}){
    this.host=host;

    this.optionsData=
      structuredClone(
        options||{}
      );

    this.series=[];
    this.rangeListeners=new Set();
    this.crosshairListeners=new Set();
    this.paneHeights=new Map();
    this.paneOptions=new Map();
    this.manualPaneRanges=new Map();

    this.visibleRange=null;
    this.raf=0;
    this.destroyed=false;
    this.followLive=true;

    this.lastValidMainRange=null;

    this.timeScaleOptions={
      rightOffset:12,
      barSpacing:7,
      minBarSpacing:.45,
      ...(options.timeScale||{})
    };

    this.priceScaleOptions={
      autoScale:true,
      mode:0,
      scaleMargins:{
        top:.08,
        bottom:.08
      },
      ...(options.rightPriceScale||{})
    };

    this.canvas=
      document.createElement('canvas');

    this.canvas.className=
      'ta-native-v3-chart';

    this.canvas.tabIndex=-1;

    this.canvas.style.cssText=
      'position:absolute;'+
      'inset:0;'+
      'width:100%;'+
      'height:100%;'+
      'display:block;'+
      'touch-action:none;';

    this.ctx=
      this.canvas.getContext(
        '2d',
        {
          alpha:false,
          desynchronized:true
        }
      );

    host.replaceChildren(
      this.canvas
    );

    this.timeScaleApi=
      new NativeTimeScale(this);

    this.priceScaleApi=
      new NativePriceScale(
        this,
        'right'
      );

    this.pointerMap=new Map();
    this.drag=null;
    this.crosshair=null;
    this.externalCrosshair=null;

    this.resizeObserver=
      new ResizeObserver(
        ()=>this.resize()
      );

    this.resizeObserver.observe(
      host
    );

    this._bind();
    this.resize();
  }

  addSeries(
    type,
    options={},
    paneIndex=0
  ){
    const s=
      new NativeSeriesObject(
        this,
        type,
        options,
        paneIndex
      );

    this.series.push(s);

    this.requestRender();

    return s;
  }

  removeSeries(series){
    this.series=
      this.series.filter(
        x=>x!==series
      );

    this.requestRender();
  }

  setPaneOptions(
    index,
    opts={}
  ){
    this.paneOptions.set(
      Number(index),
      {
        ...(
          this.paneOptions.get(
            Number(index)
          )||{}
        ),
        ...opts
      }
    );

    this.requestRender();
  }

  clearPaneOptions(){
    this.paneOptions.clear();

    for(
      const k
      of[
        ...this.manualPaneRanges.keys()
      ]
    ){
      if(k>0){
        this.manualPaneRanges.delete(k);
      }
    }

    this.requestRender();
  }

  timeScale(){
    return this.timeScaleApi;
  }

  priceScale(){
    return this.priceScaleApi;
  }

  panes(){
    const count=Math.max(
      1,
      ...this.series.map(
        s=>s.paneIndex+1
      )
    );

    return Array.from(
      {length:count},
      (_,i)=>
        new NativePaneHandle(
          this,
          i
        )
    );
  }

  applyOptions(opts={}){
    this.optionsData={
      ...this.optionsData,
      ...opts
    };

    if(opts.layout){
      this.optionsData.layout={
        ...(this.optionsData.layout||{}),
        ...opts.layout
      };
    }

    if(opts.grid){
      this.optionsData.grid={
        ...(this.optionsData.grid||{}),
        ...opts.grid
      };
    }

    if(opts.rightPriceScale){
      this.priceScaleApi.applyOptions(
        opts.rightPriceScale
      );
    }

    if(opts.timeScale){
      this.timeScaleApi.applyOptions(
        opts.timeScale
      );
    }

    if(opts.crosshair){
      this.optionsData.crosshair={
        ...(this.optionsData.crosshair||{}),
        ...opts.crosshair
      };
    }

    this.requestRender();
  }

  subscribeCrosshairMove(fn){
    this.crosshairListeners.add(fn);
  }

  unsubscribeCrosshairMove(fn){
    this.crosshairListeners.delete(fn);
  }

  setCrosshairPosition(price,time){
    const x=
      this.timeScaleApi.timeToCoordinate(
        time
      );

    const y=
      this._priceToY(
        price,
        0
      );

    if(
      x==null ||
      y==null
    )return;

    this.externalCrosshair={
      x,
      y,
      time:Number(time),
      price:Number(price),
      paneIndex:0
    };

    this.requestRender();
  }

  clearCrosshairPosition(){
    this.externalCrosshair=null;
    this.requestRender();
  }

  takeScreenshot(){
    const out=
      document.createElement(
        'canvas'
      );

    out.width=this.canvas.width;
    out.height=this.canvas.height;

    out
      .getContext('2d')
      .drawImage(
        this.canvas,
        0,
        0
      );

    return out;
  }

  remove(){
    this.destroy();
  }

  destroy(){
    if(this.destroyed)return;

    this.destroyed=true;

    cancelAnimationFrame(
      this.raf
    );

    this.resizeObserver?.disconnect();

    this.canvas.remove();

    this.rangeListeners.clear();
    this.crosshairListeners.clear();
  }

  requestRender(){
    if(
      this.destroyed ||
      this.raf
    )return;

    this.raf=
      requestAnimationFrame(
        ()=>{
          this.raf=0;
          this.render();
        }
      );
  }

  resize(){
    const r=
      this.host
        .getBoundingClientRect();

    const d=DPR();

    this.width=Math.max(
      1,
      r.width||
      this.host.clientWidth||
      1
    );

    this.height=Math.max(
      1,
      r.height||
      this.host.clientHeight||
      1
    );

    const W=Math.max(
      1,
      Math.round(
        this.width*d
      )
    );

    const H=Math.max(
      1,
      Math.round(
        this.height*d
      )
    );

    if(
      this.canvas.width!==W
    ){
      this.canvas.width=W;
    }

    if(
      this.canvas.height!==H
    ){
      this.canvas.height=H;
    }

    this.ctx.setTransform(
      d,
      0,
      0,
      d,
      0,
      0
    );

    this.ctx.imageSmoothingEnabled=false;

    if(this.visibleRange){
      this._setRange(
        this.visibleRange,
        {emit:false}
      );
    }

    this.requestRender();
  }

  _dataLength(){
    return Math.max(
      0,
      ...this.series
        .filter(
          s=>s.paneIndex===0
        )
        .map(
          s=>s.data.length
        )
    );
  }

  _mainSeries(){
    return(
      this.series.find(
        s=>
          s.paneIndex===0 &&
          [
            'candlestick',
            'bar',
            'line',
            'area'
          ].includes(s.type)
      )||
      this.series.find(
        s=>s.paneIndex===0
      )||
      null
    );
  }

  _mainData(){
    return(
      this._mainSeries()?.data||
      []
    );
  }

  _plotRect(){
    const shellAxis=
      this.width<=780
        ?42
        :46;

    const axisW=
      Math.min(
        Math.max(
          shellAxis,
          finite(
            this.priceScaleOptions.minimumWidth,
            shellAxis
          )
        ),
        Math.max(
          shellAxis,
          this.width*.30
        )
      );

    const timeH=
      Math.min(
        28,
        Math.max(
          22,
          this.height*.08
        )
      );

    return{
      left:0,
      top:0,
      right:Math.max(
        1,
        this.width-axisW
      ),
      bottom:Math.max(
        1,
        this.height-timeH
      ),
      width:Math.max(
        1,
        this.width-axisW
      ),
      height:Math.max(
        1,
        this.height-timeH
      ),
      axisW,
      timeH
    };
  }

  _boundedSpan(span){
    const p=this._plotRect();

    const minSpacing=
      Math.max(
        .2,
        finite(
          this.timeScaleOptions.minBarSpacing,
          .45
        )
      );

    const maxSpan=
      Math.max(
        8,
        p.width/minSpacing
      );

    return clamp(
      finite(span,80),
      6,
      maxSpan
    );
  }

  _normalizeRange(range){
    const n=this._dataLength();

    const rawSpan=
      Math.max(
        6,
        Number(range.to)-
        Number(range.from)
      );

    const span=
      this._boundedSpan(
        rawSpan
      );

    let c=
      (
        Number(range.from)+
        Number(range.to)
      )/2;

    let from=
      c-span/2;

    let to=
      c+span/2;

    if(!n){
      return{from,to};
    }

    const maxFuture=
      Math.max(
        finite(
          this.timeScaleOptions.rightOffset,
          12
        )+2,
        span*.30
      );

    const maxTo=
      n-1+maxFuture;

    const minFrom=
      -Math.min(
        12,
        span*.15
      );

    if(from>n-1){
      const d=from-(n-1);
      from-=d;
      to-=d;
    }

    if(to<0){
      const d=-to;
      from+=d;
      to+=d;
    }

    if(to>maxTo){
      const d=to-maxTo;
      from-=d;
      to-=d;
    }

    if(from<minFrom){
      const d=minFrom-from;
      from+=d;
      to+=d;
    }

    return{from,to};
  }

  _setRange(
    range,
    {
      emit=true,
      user=false
    }={}
  ){
    if(
      !range ||
      !Number.isFinite(
        Number(range.from)
      )||
      !Number.isFinite(
        Number(range.to)
      )
    )return;

    this.visibleRange=
      this._normalizeRange({
        from:Number(range.from),
        to:Number(range.to)
      });

    const p=this._plotRect();

    this.timeScaleOptions.barSpacing=
      p.width/
      Math.max(
        1,
        this.visibleRange.to-
        this.visibleRange.from
      );

    if(user){
      this.followLive=
        this._isAtLiveEdge();
    }

    if(emit){
      this._emitRange();
    }

    this.requestRender();
  }

  _isAtLiveEdge(){
    const n=this._dataLength();

    if(
      !n ||
      !this.visibleRange
    )return true;

    const off=
      finite(
        this.timeScaleOptions.rightOffset,
        12
      );

    const tol=
      Math.max(
        2,
        (
          this.visibleRange.to-
          this.visibleRange.from
        )*.04
      );

    return(
      Math.abs(
        this.visibleRange.to-
        (n-1+off)
      )<=tol
    );
  }

  _ensureInitialRange(){
    if(this.visibleRange)return;

    const n=this._dataLength();

    if(!n)return;

    const p=this._plotRect();

    const span=
      this._boundedSpan(
        Math.max(
          24,
          p.width/
          Math.max(
            1,
            finite(
              this.timeScaleOptions.barSpacing,
              7
            )
          )
        )
      );

    const off=
      finite(
        this.timeScaleOptions.rightOffset,
        12
      );

    this.visibleRange=
      this._normalizeRange({
        from:n-1+off-span,
        to:n-1+off
      });
  }

  _onSeriesDataChanged(
    series,
    before,
    after
  ){
    if(
      series!==this._mainSeries() ||
      !this.visibleRange ||
      before<=0 ||
      after<=before ||
      !this.followLive
    )return;

    const d=after-before;

    this.visibleRange=
      this._normalizeRange({
        from:this.visibleRange.from+d,
        to:this.visibleRange.to+d
      });

    this._emitRange();
  }

  _paneRects(){
    const p=this._plotRect();

    const count=
      Math.max(
        1,
        ...this.series.map(
          s=>s.paneIndex+1
        )
      );

    if(count===1){
      return[{
        left:0,
        top:0,
        width:p.width,
        height:p.height,
        bottom:p.bottom,
        right:p.right,
        index:0
      }];
    }

    let oscTotal=0;
    const heights=[];

    for(
      let i=1;
      i<count;
      i++
    ){
      const h=
        Math.max(
          42,
          this.paneHeights.get(i)||
          Math.min(
            120,
            p.height*.18
          )
        );

      heights[i]=h;
      oscTotal+=h;
    }

    const gap=count-1;

    let main=
      Math.max(
        72,
        p.height-
        oscTotal-
        gap
      );

    if(
      main+
      oscTotal+
      gap>
      p.height
    ){
      const avail=
        Math.max(
          42,
          p.height-main-gap
        );

      const k=
        avail/
        Math.max(
          1,
          oscTotal
        );

      for(
        let i=1;
        i<count;
        i++
      ){
        heights[i]=
          Math.max(
            42,
            heights[i]*
            Math.max(.25,k)
          );
      }

      main=
        Math.max(
          56,
          p.height-
          heights
            .slice(1)
            .reduce(
              (a,b)=>a+b,
              0
            )-
          gap
        );
    }

    const out=[];
    let top=0;

    out.push({
      left:0,
      top,
      width:p.width,
      height:main,
      bottom:top+main,
      right:p.right,
      index:0
    });

    top+=main+1;

    for(
      let i=1;
      i<count;
      i++
    ){
      const h=
        Math.min(
          heights[i],
          Math.max(
            42,
            p.bottom-top
          )
        );

      out.push({
        left:0,
        top,
        width:p.width,
        height:h,
        bottom:top+h,
        right:p.right,
        index:i
      });

      top+=h+1;
    }

    return out;
  }

  _visibleIndexRange(){
    const n=this._dataLength();

    if(!n){
      return{
        start:0,
        end:-1
      };
    }

    const r=
      this.visibleRange||
      {
        from:0,
        to:n-1
      };

    return{
      start:clamp(
        Math.floor(r.from)-2,
        0,
        n-1
      ),
      end:clamp(
        Math.ceil(r.to)+2,
        0,
        n-1
      )
    };
  }

  _seriesValue(s,d){
    if(!d)return null;

    if('value'in d){
      return Number(d.value);
    }

    if('close'in d){
      return Number(d.close);
    }

    return null;
  }

  /*
   * Actual visible market-price bounds from the primary series.
   *
   * This deliberately ignores percentage/index transforms because
   * manualPaneRanges always store REAL instrument prices.
   */
  _mainVisiblePriceBounds(){
    const s=this._mainSeries();
    const data=s?.data||[];

    if(!data.length)return null;

    const {
      start,
      end
    }=
      this._visibleIndexRange();

    let lo=Infinity;
    let hi=-Infinity;

    for(
      let i=start;
      i<=Math.min(
        end,
        data.length-1
      );
      i++
    ){
      const d=data[i];

      if(!d)continue;

      if(
        Number.isFinite(
          Number(d.low)
        )&&
        Number.isFinite(
          Number(d.high)
        )
      ){
        lo=Math.min(
          lo,
          Number(d.low)
        );

        hi=Math.max(
          hi,
          Number(d.high)
        );
      }else{
        const v=
          this._seriesValue(
            s,
            d
          );

        if(Number.isFinite(v)){
          lo=Math.min(lo,v);
          hi=Math.max(hi,v);
        }
      }
    }

    if(
      !Number.isFinite(lo)||
      !Number.isFinite(hi)
    )return null;

    if(hi<=lo){
      const pad=
        Math.max(
          1e-6,
          Math.abs(lo)*.001
        );

      lo-=pad;
      hi+=pad;
    }

    return{
      min:lo,
      max:hi
    };
  }

  /*
   * Natural/raw range from actual visible series data.
   *
   * For the main pane this is the trusted real-price fallback.
   */
  _naturalPaneRange(paneIndex){
    const paneOpt=
      this.paneOptions.get(
        paneIndex
      )||{};

    if(
      paneIndex>0 &&
      paneOpt.range &&
      Number.isFinite(
        paneOpt.range.min
      )&&
      Number.isFinite(
        paneOpt.range.max
      )&&
      paneOpt.range.max>
      paneOpt.range.min
    ){
      return{
        min:paneOpt.range.min,
        max:paneOpt.range.max
      };
    }

    const {
      start,
      end
    }=
      this._visibleIndexRange();

    let lo=Infinity;
    let hi=-Infinity;

    for(
      const s
      of this.series.filter(
        x=>
          x.paneIndex===paneIndex &&
          x.optionsData.visible!==false
      )
    ){
      for(
        let i=start;
        i<=Math.min(
          end,
          s.data.length-1
        );
        i++
      ){
        const d=s.data[i];

        if(!d)continue;

        if(
          'low'in d &&
          'high'in d
        ){
          lo=Math.min(
            lo,
            Number(d.low)
          );

          hi=Math.max(
            hi,
            Number(d.high)
          );
        }else{
          const v=
            this._seriesValue(
              s,
              d
            );

          if(Number.isFinite(v)){
            lo=Math.min(lo,v);
            hi=Math.max(hi,v);
          }
        }
      }

      for(
        const pl
        of s.priceLines
      ){
        const v=Number(pl.price);

        if(Number.isFinite(v)){
          lo=Math.min(lo,v);
          hi=Math.max(hi,v);
        }
      }
    }

    for(
      const g
      of paneOpt.guides||[]
    ){
      if(Number.isFinite(g)){
        lo=Math.min(lo,g);
        hi=Math.max(hi,g);
      }
    }

    if(
      !Number.isFinite(lo)||
      !Number.isFinite(hi)
    ){
      return paneIndex===0
        ?(
          this.lastValidMainRange
            ?{...this.lastValidMainRange}
            :{min:0,max:1}
        )
        :{min:0,max:1};
    }

    if(hi<=lo){
      const d=
        Math.max(
          1e-6,
          Math.abs(lo)*.001
        );

      lo-=d;
      hi+=d;
    }

    const margins=
      paneIndex===0
        ?(
          this.priceScaleOptions
            .scaleMargins||
          {
            top:.08,
            bottom:.08
          }
        )
        :{
          top:.08,
          bottom:.08
        };

    const span=hi-lo;

    return{
      min:
        lo-
        span*
        finite(
          margins.bottom,
          .08
        ),
      max:
        hi+
        span*
        finite(
          margins.top,
          .08
        )
    };
  }

  /*
   * Protection against the disappearance bug.
   *
   * If XAUUSD/NAS100/etc. is really trading around 25,000, a raw
   * manual scale such as -120..+120 is impossible and must never
   * become the main-price range.
   */
  _constrainMainManualRange(candidate){
    const bounds=
      this._mainVisiblePriceBounds();

    if(!bounds){
      return(
        candidate &&
        Number.isFinite(candidate.min)&&
        Number.isFinite(candidate.max)&&
        candidate.max>candidate.min
      )
        ?candidate
        :this._naturalPaneRange(0);
    }

    const natural=
      this._naturalPaneRange(0);

    let min=
      Number(candidate?.min);

    let max=
      Number(candidate?.max);

    if(
      !Number.isFinite(min)||
      !Number.isFinite(max)||
      max<=min
    ){
      return{
        ...natural
      };
    }

    let span=max-min;

    const dataSpan=
      Math.max(
        1e-9,
        bounds.max-
        bounds.min
      );

    const naturalSpan=
      Math.max(
        dataSpan,
        natural.max-
        natural.min
      );

    const overlaps=
      max>=bounds.min &&
      min<=bounds.max;

    /*
     * This is the exact class of failure seen in the screenshot:
     * actual market price around 25,000 while the internal manual
     * Y-range has jumped close to zero.
     */
    if(!overlaps){
      const distance=
        min>bounds.max
          ?min-bounds.max
          :bounds.min-max;

      if(
        distance>
        Math.max(
          naturalSpan*3,
          Math.abs(
            (
              bounds.min+
              bounds.max
            )/2
          )*.25
        )
      ){
        return{
          ...natural
        };
      }
    }

    /*
     * Stop an extreme numerical range from flattening candles into
     * a tiny horizontal line.
     */
    const maxSpan=
      Math.max(
        naturalSpan*250,
        Math.abs(
          (
            bounds.min+
            bounds.max
          )/2
        )*4,
        dataSpan*250
      );

    if(span>maxSpan){
      const center=
        (min+max)/2;

      const half=
        maxSpan/2;

      min=center-half;
      max=center+half;
      span=max-min;
    }

    /*
     * Free movement remains possible, but never allow every
     * visible candle to leave the screen.
     */
    const guard=
      Math.max(
        dataSpan*.02,
        Math.min(
          span*.04,
          dataSpan*.12
        )
      );

    if(
      min>
      bounds.max-guard
    ){
      min=
        bounds.max-guard;

      max=
        min+span;
    }

    if(
      max<
      bounds.min+guard
    ){
      max=
        bounds.min+guard;

      min=
        max-span;
    }

    const safe={
      min,
      max
    };

    if(
      Number.isFinite(safe.min)&&
      Number.isFinite(safe.max)&&
      safe.max>safe.min
    ){
      this.lastValidMainRange={
        ...safe
      };
    }

    return safe;
  }

  _providerRange(paneIndex){
    for(
      const s
      of this.series.filter(
        x=>
          x.paneIndex===paneIndex &&
          x.optionsData.visible!==false
      )
    ){
      const provider=
        s.optionsData
          .autoscaleInfoProvider;

      if(
        typeof provider!==
        'function'
      )continue;

      try{
        const pr=
          provider()?.priceRange;

        if(
          Number.isFinite(
            pr?.minValue
          )&&
          Number.isFinite(
            pr?.maxValue
          )&&
          pr.maxValue>
          pr.minValue
        ){
          const candidate={
            min:Number(
              pr.minValue
            ),
            max:Number(
              pr.maxValue
            )
          };

          return paneIndex===0
            ?this._constrainMainManualRange(
              candidate
            )
            :candidate;
        }
      }catch{}
    }

    return null;
  }

  _rawPaneRange(paneIndex){
    if(
      this.manualPaneRanges
        .has(paneIndex)
    ){
      const stored={
        ...this.manualPaneRanges.get(
          paneIndex
        )
      };

      if(paneIndex===0){
        const safe=
          this._constrainMainManualRange(
            stored
          );

        this.manualPaneRanges.set(
          0,
          safe
        );

        return safe;
      }

      return stored;
    }

    const paneOpt=
      this.paneOptions.get(
        paneIndex
      )||{};

    if(
      paneIndex>0 &&
      paneOpt.range &&
      Number.isFinite(
        paneOpt.range.min
      )&&
      Number.isFinite(
        paneOpt.range.max
      )&&
      paneOpt.range.max>
      paneOpt.range.min
    ){
      return{
        min:paneOpt.range.min,
        max:paneOpt.range.max
      };
    }

    const provider=
      this._providerRange(
        paneIndex
      );

    if(provider){
      return provider;
    }

    const natural=
      this._naturalPaneRange(
        paneIndex
      );

    if(
      paneIndex===0 &&
      Number.isFinite(
        natural.min
      )&&
      Number.isFinite(
        natural.max
      )&&
      natural.max>
      natural.min
    ){
      this.lastValidMainRange={
        ...natural
      };
    }

    return natural;
  }

  _baseForMode(paneIndex){
    const {start}=
      this._visibleIndexRange();

    const s=
      this.series.find(
        x=>
          x.paneIndex===paneIndex &&
          x.data.length
      );

    const d=
      s?.data?.[
        clamp(
          start,
          0,
          Math.max(
            0,
            (
              s?.data.length||1
            )-1
          )
        )
      ];

    return(
      this._seriesValue(
        s,
        d
      )||1
    );
  }

  _transform(v,paneIndex){
    const mode=
      paneIndex===0
        ?finite(
          this.priceScaleOptions.mode,
          0
        )
        :0;

    const base=
      this._baseForMode(
        paneIndex
      );

    if(mode===1){
      return Math.log(
        Math.max(
          1e-12,
          v
        )
      );
    }

    if(mode===2){
      return(
        v/base-1
      )*100;
    }

    if(mode===3){
      return v/base*100;
    }

    return v;
  }

  _untransform(v,paneIndex){
    const mode=
      paneIndex===0
        ?finite(
          this.priceScaleOptions.mode,
          0
        )
        :0;

    const base=
      this._baseForMode(
        paneIndex
      );

    if(mode===1){
      return Math.exp(v);
    }

    if(mode===2){
      return base*(
        1+v/100
      );
    }

    if(mode===3){
      return base*v/100;
    }

    return v;
  }

  _paneRange(paneIndex){
    const r=
      this._rawPaneRange(
        paneIndex
      );

    return{
      min:this._transform(
        r.min,
        paneIndex
      ),
      max:this._transform(
        r.max,
        paneIndex
      )
    };
  }

  _priceToY(
    price,
    paneIndex=0
  ){
    const rect=
      this._paneRects()[
        paneIndex
      ];

    if(!rect)return null;

    const r=
      this._paneRange(
        paneIndex
      );

    return yForPrice(
      this._transform(
        Number(price),
        paneIndex
      ),
      r,
      rect.top,
      rect.height
    );
  }

  _yToPrice(
    y,
    paneIndex=0
  ){
    const rect=
      this._paneRects()[
        paneIndex
      ];

    if(!rect)return null;

    const r=
      this._paneRange(
        paneIndex
      );

    return this._untransform(
      priceForY(
        Number(y),
        r,
        rect.top,
        rect.height
      ),
      paneIndex
    );
  }

  _axisTicks(
    paneIndex,
    target=8
  ){
    const mode=
      paneIndex===0
        ?finite(
          this.priceScaleOptions.mode,
          0
        )
        :0;

    const raw=
      this._rawPaneRange(
        paneIndex
      );

    const trans=
      this._paneRange(
        paneIndex
      );

    if(
      mode===2 ||
      mode===3
    ){
      return priceTicks(
        trans,
        target
      ).map(
        v=>({
          t:v,
          raw:this._untransform(
            v,
            paneIndex
          ),
          label:
            mode===2
              ?`${fmtNumber(v,2)}%`
              :fmtNumber(v,2),
          major:true
        })
      );
    }

    const rawTicks=
      priceTicks(
        raw,
        target
      );

    return rawTicks.map(
      v=>({
        t:this._transform(
          v,
          paneIndex
        ),
        raw:v,
        label:fmtNumber(
          v,
          this._precisionForPane(
            paneIndex
          )
        ),
        major:true
      })
    );
  }

  _precisionForPane(paneIndex){
    if(paneIndex>0){
      return finite(
        this.paneOptions
          .get(paneIndex)
          ?.precision,
        2
      );
    }

    return finite(
      this._mainSeries()
        ?.optionsData
        ?.priceFormat
        ?.precision,
      2
    );
  }

  _emitRange(){
    const r=
      this.visibleRange
        ?{...this.visibleRange}
        :null;

    for(
      const fn
      of this.rangeListeners
    ){
      try{
        fn(r);
      }catch(e){
        console.error(e);
      }
    }
  }

  _seriesDataAt(index){
    const map=new Map();

    for(
      const s
      of this.series
    ){
      if(
        index>=0 &&
        index<s.data.length
      ){
        map.set(
          s,
          s.data[index]
        );
      }
    }

    return map;
  }

  _paneAtY(y){
    const rects=
      this._paneRects();

    return(
      rects.find(
        r=>
          y>=r.top &&
          y<=r.bottom
      )?.index??0
    );
  }

  _crosshairParam(x,y){
    const logical=
      this.timeScaleApi
        .coordinateToLogical(
          x
        );

    const idx=
      Math.round(logical);

    const data=
      this._mainData();

    const safe=
      clamp(
        idx,
        0,
        Math.max(
          0,
          data.length-1
        )
      );

    const d=data[safe];

    return{
      point:{x,y},
      logical,
      time:d?.time??null,
      seriesData:
        this._seriesDataAt(
          safe
        )
    };
  }

  _emitCrosshair(x,y){
    const p=
      this._crosshairParam(
        x,
        y
      );

    for(
      const fn
      of this.crosshairListeners
    ){
      try{
        fn(p);
      }catch(e){
        console.error(e);
      }
    }
  }

  _snapCrosshair(x,y){
    const opt=
      this.optionsData.crosshair||
      {};

    if(
      opt.mode!==
      NativeSeries
        .CrosshairMode
        .MagnetOHLC
    ){
      return{x,y};
    }

    const idx=
      Math.round(
        this.timeScaleApi
          .coordinateToLogical(x)
      );

    const d=
      this._mainData()[
        idx
      ];

    if(
      !d ||
      !('open'in d)
    ){
      return{x,y};
    }

    const ys=[
      d.open,
      d.high,
      d.low,
      d.close
    ]
      .map(
        p=>
          this._priceToY(
            p,
            0
          )
      )
      .filter(
        Number.isFinite
      );

    if(!ys.length){
      return{x,y};
    }

    let best=ys[0];

    for(
      const yy
      of ys
    ){
      if(
        Math.abs(yy-y)<
        Math.abs(best-y)
      ){
        best=yy;
      }
    }

    return{
      x:
        this.timeScaleApi
          .logicalToCoordinate(
            idx
          ),
      y:best
    };
  }

  /*
   * Use client coordinates instead of depending on rounded/synthetic
   * offset positions. Fractional pointer movement stays available.
   */
  _eventPoint(e){
    const r=
      this.canvas
        .getBoundingClientRect();

    return{
      x:e.clientX-r.left,
      y:e.clientY-r.top
    };
  }

  _bind(){
    const c=this.canvas;

    c.addEventListener(
      'pointerdown',
      e=>{
        const pt=
          this._eventPoint(e);

        c.setPointerCapture?.(
          e.pointerId
        );

        this.pointerMap.set(
          e.pointerId,
          pt
        );

        const p=this._plotRect();

        if(
          this.pointerMap.size===2
        ){
          const pts=[
            ...this.pointerMap.values()
          ];

          this.drag={
            kind:'pinch',
            dist:
              Math.abs(
                pts[1].x-
                pts[0].x
              ),
            range:{
              ...this.visibleRange
            }
          };

          return;
        }

        const rects=
          this._paneRects();

        for(
          let i=1;
          i<rects.length;
          i++
        ){
          if(
            Math.abs(
              pt.y-
              rects[i].top
            )<=5 &&
            pt.x<=p.right
          ){
            this.drag={
              kind:'separator',
              paneIndex:i,
              y:pt.y,
              height:
                rects[i].height
            };

            this.canvas.style.cursor=
              'ns-resize';

            return;
          }
        }

        /*
         * RIGHT PRICE SCALE
         *
         * Always begin from a valid REAL price range.
         */
        if(pt.x>p.right){
          const paneIndex=
            this._paneAtY(
              pt.y
            );

          const base=
            paneIndex===0
              ?this._constrainMainManualRange(
                this._rawPaneRange(0)
              )
              :this._rawPaneRange(
                paneIndex
              );

          this.drag={
            kind:'price',
            paneIndex,
            x:pt.x,
            y:pt.y,
            range:{
              ...base
            }
          };

          return;
        }

        if(pt.y>p.bottom){
          this.drag={
            kind:'timezoom',
            x:pt.x,
            y:pt.y,
            range:{
              ...this.visibleRange
            }
          };

          return;
        }

        this.drag={
          kind:'pan',
          x:pt.x,
          y:pt.y,
          range:{
            ...this.visibleRange
          },
          moved:false
        };
      }
    );

    c.addEventListener(
      'pointermove',
      e=>{
        const pt=
          this._eventPoint(e);

        if(
          this.pointerMap.has(
            e.pointerId
          )
        ){
          this.pointerMap.set(
            e.pointerId,
            pt
          );
        }

        if(
          this.pointerMap.size===2 &&
          this.drag?.kind==='pinch'
        ){
          const pts=[
            ...this.pointerMap.values()
          ];

          const dist=
            Math.max(
              10,
              Math.abs(
                pts[1].x-
                pts[0].x
              )
            );

          const factor=
            this.drag.dist/
            dist;

          const r=
            this.drag.range;

          const c0=
            (
              r.from+
              r.to
            )/2;

          const span=
            this._boundedSpan(
              (
                r.to-r.from
              )*
              factor
            );

          this._setRange({
            from:c0-span/2,
            to:c0+span/2
          },{
            emit:true,
            user:true
          });

          e.preventDefault();

          return;
        }

        if(this.drag){
          /*
           * SMOOTH DIRECT PAN
           *
           * The viewport keeps fractional logical positions.
           * We do not round to candle indexes.
           */
          if(
            this.drag.kind==='pan'
          ){
            const dx=
              pt.x-
              this.drag.x;

            const dy=
              pt.y-
              this.drag.y;

            if(Math.abs(dx)>3){
              this.drag.moved=true;
            }

            if(
              Math.abs(dx)>=
              Math.abs(dy)*.65
            ){
              const p=
                this._plotRect();

              const span=
                this.drag.range.to-
                this.drag.range.from;

              const delta=
                -dx/
                Math.max(
                  1,
                  p.width
                )*
                span;

              this._setRange({
                from:
                  this.drag.range.from+
                  delta,
                to:
                  this.drag.range.to+
                  delta
              },{
                emit:true,
                user:true
              });
            }
          }

          /*
           * PRICE SCALE
           *
           * Scale the raw REAL price range and immediately validate
           * it before it can become the active main range.
           */
          else if(
            this.drag.kind==='price'
          ){
            const dy=
              pt.y-
              this.drag.y;

            const f=
              Math.exp(
                dy/220
              );

            const raw=
              scaleRange(
                this.drag.range,
                f
              );

            const r=
              this.drag.paneIndex===0
                ?this._constrainMainManualRange(
                  raw
                )
                :raw;

            this.manualPaneRanges.set(
              this.drag.paneIndex,
              r
            );

            if(
              this.drag.paneIndex===0
            ){
              this.priceScaleOptions.autoScale=false;

              this.lastValidMainRange={
                ...r
              };
            }

            this.requestRender();
          }

          else if(
            this.drag.kind==='timezoom'
          ){
            const dx=
              pt.x-
              this.drag.x;

            const f=
              Math.exp(
                dx/280
              );

            const r=
              this.drag.range;

            const c0=
              (
                r.from+
                r.to
              )/2;

            const span=
              this._boundedSpan(
                (
                  r.to-r.from
                )*
                f
              );

            this._setRange({
              from:c0-span/2,
              to:c0+span/2
            },{
              emit:true,
              user:true
            });
          }

          else if(
            this.drag.kind==='separator'
          ){
            const dy=
              pt.y-
              this.drag.y;

            this.paneHeights.set(
              this.drag.paneIndex,
              Math.max(
                42,
                this.drag.height-
                dy
              )
            );

            this.requestRender();
          }

          e.preventDefault();
        }

        const snap=
          this._snapCrosshair(
            pt.x,
            pt.y
          );

        this.crosshair={
          ...snap,
          paneIndex:
            this._paneAtY(
              snap.y
            )
        };

        this.externalCrosshair=null;

        this._emitCrosshair(
          snap.x,
          snap.y
        );

        this.requestRender();
      }
    );

    /*
     * NO KINETIC SCROLLING.
     *
     * Release means STOP at the exact place where the pointer stopped.
     */
    const up=e=>{
      this.pointerMap.delete(
        e.pointerId
      );

      if(
        this.pointerMap.size<2
      ){
        this.drag=null;
        this.canvas.style.cursor='';
      }
    };

    c.addEventListener(
      'pointerup',
      up
    );

    c.addEventListener(
      'pointercancel',
      up
    );

    c.addEventListener(
      'pointerleave',
      ()=>{
        if(!this.drag){
          this.crosshair=null;
          this.requestRender();
        }
      }
    );

    c.addEventListener(
      'wheel',
      e=>{
        e.preventDefault();

        if(
          !this.visibleRange
        )return;

        const pt=
          this._eventPoint(e);

        const p=
          this._plotRect();

        const anchor=
          clamp(
            (
              pt.x-
              p.left
            )/
            Math.max(
              1,
              p.width
            ),
            0,
            1
          );

        const r=
          this.visibleRange;

        const span=
          r.to-r.from;

        const f=
          e.deltaY>0
            ?1.12
            :.89;

        const newSpan=
          this._boundedSpan(
            span*f
          );

        const logical=
          r.from+
          span*
          anchor;

        this._setRange({
          from:
            logical-
            newSpan*
            anchor,
          to:
            logical+
            newSpan*
            (
              1-anchor
            )
        },{
          emit:true,
          user:true
        });
      },
      {passive:false}
    );

    c.addEventListener(
      'dblclick',
      e=>{
        const pt=
          this._eventPoint(e);

        const p=
          this._plotRect();

        if(pt.x>p.right){
          const paneIndex=
            this._paneAtY(
              pt.y
            );

          this.manualPaneRanges.delete(
            paneIndex
          );

          if(paneIndex===0){
            for(
              const s
              of this.series.filter(
                x=>x.paneIndex===0
              )
            ){
              s.optionsData
                .autoscaleInfoProvider=
                null;
            }

            this.priceScaleOptions.autoScale=true;
            this.lastValidMainRange=null;
          }

          this.requestRender();

          return;
        }

        if(pt.y>p.bottom){
          this.timeScaleApi
            .scrollToRealTime();
        }
      }
    );
  }

  _intervalSeconds(){
    const d=this._mainData();

    if(d.length<2){
      return 60;
    }

    const diffs=[];

    for(
      let i=
        Math.max(
          1,
          d.length-8
        );
      i<d.length;
      i++
    ){
      const x=
        Number(
          d[i].time
        )-
        Number(
          d[i-1].time
        );

      if(x>0){
        diffs.push(x);
      }
    }

    return(
      diffs
        .sort(
          (a,b)=>a-b
        )[
          Math.floor(
            diffs.length/2
          )
        ]||
      60
    );
  }

  _drawGrid(ctx,rect){
    const grid=
      this.optionsData.grid||
      {};

    const v=
      grid.vertLines||
      {};

    const h=
      grid.horzLines||
      {};

    const major=
      !!this.optionsData
        .majorRoundGrid;

    ctx.save();
    ctx.lineWidth=1;

    if(
      h.visible!==false ||
      major
    ){
      const ticks=
        this._axisTicks(
          rect.index,
          rect.index===0
            ?8
            :6
        );

      for(
        const tick
        of ticks
      ){
        const y=
          yForPrice(
            tick.t,
            this._paneRange(
              rect.index
            ),
            rect.top,
            rect.height
          );

        ctx.strokeStyle=
          major &&
          rect.index===0
            ?(
              this.optionsData
                .roundGridColor||
              'rgba(126,157,185,.22)'
            )
            :(
              h.color||
              'rgba(76,103,130,.16)'
            );

        ctx.lineWidth=
          major &&
          rect.index===0
            ?1.15
            :1;

        ctx.beginPath();

        ctx.moveTo(
          rect.left,
          snapPx(y)
        );

        ctx.lineTo(
          rect.right,
          snapPx(y)
        );

        ctx.stroke();
      }
    }

    if(
      v.visible!==false &&
      rect.index===0
    ){
      ctx.strokeStyle=
        v.color||
        'rgba(76,103,130,.16)';

      ctx.lineWidth=1;

      for(
        const i
        of timeTickIndices(
          {
            start:
              Math.max(
                0,
                Math.floor(
                  this.visibleRange
                    ?.from||
                  0
                )
              ),
            end:
              Math.max(
                0,
                Math.ceil(
                  this.visibleRange
                    ?.to||
                  0
                )
              )
          },
          8
        )
      ){
        const x=
          snapPx(
            this.timeScaleApi
              .logicalToCoordinate(i)
          );

        ctx.beginPath();
        ctx.moveTo(
          x,
          rect.top
        );
        ctx.lineTo(
          x,
          rect.bottom
        );
        ctx.stroke();
      }
    }

    if(
      this.optionsData
        .sessionSeparators &&
      rect.index===0
    ){
      const data=
        this._mainData();

      const {
        start,
        end
      }=
        this._visibleIndexRange();

      const interval=
        this._intervalSeconds();

      ctx.strokeStyle=
        this.optionsData
          .sessionSeparatorColor||
        'rgba(140,160,180,.28)';

      ctx.setLineDash(
        [3,5]
      );

      let prev=null;

      for(
        let i=
          Math.max(
            1,
            start
          );
        i<=
          Math.min(
            end,
            data.length-1
          );
        i++
      ){
        const key=
          separatorKey(
            data[i]?.time,
            interval
          );

        const pk=
          separatorKey(
            data[i-1]?.time,
            interval
          );

        if(
          key!==pk &&
          key!==prev
        ){
          const x=
            this.timeScaleApi
              .logicalToCoordinate(i);

          ctx.beginPath();

          ctx.moveTo(
            x,
            rect.top
          );

          ctx.lineTo(
            x,
            rect.bottom
          );

          ctx.stroke();

          prev=key;
        }
      }

      ctx.setLineDash([]);
    }

    const paneOpt=
      this.paneOptions.get(
        rect.index
      )||{};

    for(
      const g
      of paneOpt.guides||[]
    ){
      if(
        !Number.isFinite(g)
      )continue;

      const y=
        this._priceToY(
          g,
          rect.index
        );

      if(
        !Number.isFinite(y)
      )continue;

      ctx.strokeStyle=
        paneOpt.guideColor||
        'rgba(148,163,184,.46)';

      ctx.setLineDash(
        [5,5]
      );

      ctx.beginPath();

      ctx.moveTo(
        rect.left,
        y
      );

      ctx.lineTo(
        rect.right,
        y
      );

      ctx.stroke();

      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  /*
   * Smooth candle renderer.
   *
   * Positions are no longer snapped to whole CSS pixels.
   * They are aligned to the nearest PHYSICAL device pixel instead.
   * This keeps the approved crisp look while allowing fractional
   * viewport movement.
   */
  _drawCandles(
    ctx,
    s,
    rect,
    start,
    end
  ){
    const o=s.optionsData;

    const renko=[
      'renko-pips',
      'renko-time'
    ].includes(
      o.constructionMode
    );

    const r=this.visibleRange;

    if(!r)return;

    const spacing=
      rect.width/
      Math.max(
        1,
        r.to-r.from
      );

    const bodyW=
      renko
        ?clamp(
          spacing*.96,
          1.5,
          36
        )
        :clamp(
          spacing*.70,
          1,
          24
        );

    for(
      let i=start;
      i<=
        Math.min(
          end,
          s.data.length-1
        );
      i++
    ){
      const b=s.data[i];

      if(!b)continue;

      const rawX=
        this.timeScaleApi
          .logicalToCoordinate(i);

      if(
        rawX<-40 ||
        rawX>rect.right+40
      )continue;

      const x=
        snapPx(rawX);

      const yo=
        this._priceToY(
          b.open,
          s.paneIndex
        );

      const yc=
        this._priceToY(
          b.close,
          s.paneIndex
        );

      const yh=
        this._priceToY(
          b.high,
          s.paneIndex
        );

      const yl=
        this._priceToY(
          b.low,
          s.paneIndex
        );

      if(
        ![
          yo,
          yc,
          yh,
          yl
        ].every(
          Number.isFinite
        )
      )continue;

      const up=
        Number(b.close)>=
        Number(b.open);

      const fill=
        up
          ?(
            o.upColor||
            '#00c7b1'
          )
          :(
            o.downColor||
            '#ff4d57'
          );

      const border=
        up
          ?(
            o.borderUpColor||
            fill
          )
          :(
            o.borderDownColor||
            fill
          );

      const wick=
        up
          ?(
            o.wickUpColor||
            fill
          )
          :(
            o.wickDownColor||
            fill
          );

      if(
        !renko &&
        o.wickVisible!==false &&
        !rgbaTransparent(wick)
      ){
        ctx.strokeStyle=wick;
        ctx.lineWidth=1;

        ctx.beginPath();

        ctx.moveTo(
          x,
          snapPx(yh)
        );

        ctx.lineTo(
          x,
          snapPx(yl)
        );

        ctx.stroke();
      }

      const top=
        snapPx(
          Math.min(
            yo,
            yc
          )
        );

      const bottom=
        snapPx(
          Math.max(
            yo,
            yc
          )
        );

      const height=
        Math.max(
          1/DPR(),
          bottom-top
        );

      const width=
        snapSize(
          bodyW
        );

      const left=
        snapPx(
          rawX-
          width/2
        );

      if(
        !rgbaTransparent(
          fill
        )
      ){
        ctx.fillStyle=fill;

        ctx.fillRect(
          left,
          top,
          width,
          height
        );
      }

      if(
        o.borderVisible!==false &&
        !rgbaTransparent(
          border
        )&&
        width>=2/DPR()
      ){
        ctx.strokeStyle=border;
        ctx.lineWidth=1;

        ctx.strokeRect(
          left,
          top,
          width,
          height
        );
      }
    }
  }

  _drawBars(
    ctx,
    s,
    rect,
    start,
    end
  ){
    const o=s.optionsData;
    const r=this.visibleRange;

    const spacing=
      rect.width/
      Math.max(
        1,
        r.to-r.from
      );

    const tick=
      Math.max(
        2,
        Math.min(
          7,
          spacing*.35
        )
      );

    for(
      let i=start;
      i<=
        Math.min(
          end,
          s.data.length-1
        );
      i++
    ){
      const b=s.data[i];

      const x=
        this.timeScaleApi
          .logicalToCoordinate(i);

      const yo=
        this._priceToY(
          b.open,
          s.paneIndex
        );

      const yc=
        this._priceToY(
          b.close,
          s.paneIndex
        );

      const yh=
        this._priceToY(
          b.high,
          s.paneIndex
        );

      const yl=
        this._priceToY(
          b.low,
          s.paneIndex
        );

      const up=
        b.close>=b.open;

      ctx.strokeStyle=
        up
          ?(
            o.upColor||
            '#00c7b1'
          )
          :(
            o.downColor||
            '#ff4d57'
          );

      ctx.beginPath();

      ctx.moveTo(x,yh);
      ctx.lineTo(x,yl);

      ctx.moveTo(
        x-tick,
        yo
      );

      ctx.lineTo(x,yo);

      ctx.moveTo(x,yc);

      ctx.lineTo(
        x+tick,
        yc
      );

      ctx.stroke();
    }
  }

  _drawLine(
    ctx,
    s,
    rect,
    start,
    end,
    area=false
  ){
    const o=s.optionsData;

    const color=
      o.color||
      o.lineColor||
      '#168cff';

    if(
      o.visible===false ||
      rgbaTransparent(
        color
      )
    )return;

    ctx.save();

    ctx.globalAlpha=
      clamp(
        finite(
          o.opacity,
          1
        ),
        .02,
        1
      );

    ctx.strokeStyle=color;

    ctx.lineWidth=
      Math.max(
        .75,
        finite(
          o.lineWidth,
          1.5
        )
      );

    ctx.setLineDash(
      lineDash(
        o.lineStyle
      )
    );

    ctx.lineJoin='round';
    ctx.lineCap='round';

    let open=false;
    const pts=[];

    ctx.beginPath();

    for(
      let i=start;
      i<=
        Math.min(
          end,
          s.data.length-1
        );
      i++
    ){
      const d=s.data[i];

      const v=
        this._seriesValue(
          s,
          d
        );

      if(
        !Number.isFinite(v)
      )continue;

      const x=
        this.timeScaleApi
          .logicalToCoordinate(i);

      const y=
        this._priceToY(
          v,
          s.paneIndex
        );

      if(
        !Number.isFinite(x)||
        !Number.isFinite(y)
      )continue;

      pts.push([x,y]);

      if(!open){
        ctx.moveTo(x,y);
        open=true;
      }else{
        ctx.lineTo(x,y);
      }
    }

    ctx.stroke();

    if(
      area &&
      pts.length>1
    ){
      ctx.lineTo(
        pts.at(-1)[0],
        rect.bottom
      );

      ctx.lineTo(
        pts[0][0],
        rect.bottom
      );

      ctx.closePath();

      if(
        typeof ctx.createLinearGradient===
        'function'
      ){
        const g=
          ctx.createLinearGradient(
            0,
            rect.top,
            0,
            rect.bottom
          );

        g.addColorStop(
          0,
          o.topColor||
          'rgba(22,140,255,.28)'
        );

        g.addColorStop(
          1,
          o.bottomColor||
          'rgba(22,140,255,.02)'
        );

        ctx.fillStyle=g;
      }else{
        ctx.fillStyle=
          o.topColor||
          'rgba(22,140,255,.18)';
      }

      ctx.fill();
    }

    ctx.restore();
  }

  _drawHistogram(
    ctx,
    s,
    rect,
    start,
    end
  ){
    const o=s.optionsData;

    const color=
      o.color||
      '#168cff';

    if(
      o.visible===false ||
      rgbaTransparent(color)
    )return;

    const zero=
      this._priceToY(
        0,
        s.paneIndex
      );

    const spacing=
      rect.width/
      Math.max(
        1,
        this.visibleRange.to-
        this.visibleRange.from
      );

    const w=
      Math.max(
        1,
        Math.min(
          12,
          spacing*.7
        )
      );

    ctx.save();

    ctx.globalAlpha=
      clamp(
        finite(
          o.opacity,
          1
        ),
        .02,
        1
      );

    ctx.fillStyle=color;

    for(
      let i=start;
      i<=
        Math.min(
          end,
          s.data.length-1
        );
      i++
    ){
      const d=s.data[i];

      const v=
        this._seriesValue(
          s,
          d
        );

      if(
        !Number.isFinite(v)
      )continue;

      const x=
        this.timeScaleApi
          .logicalToCoordinate(i);

      const y=
        this._priceToY(
          v,
          s.paneIndex
        );

      ctx.fillRect(
        x-w/2,
        Math.min(
          y,
          zero
        ),
        w,
        Math.max(
          1,
          Math.abs(
            zero-y
          )
        )
      );
    }

    ctx.restore();
  }

  _drawSeriesPriceLine(
    ctx,
    s,
    rect
  ){
    const o=s.optionsData;

    if(
      o.priceLineVisible===false ||
      s.paneIndex!==0 ||
      !s.data.length
    )return;

    const d=s.data.at(-1);

    const v=
      this._seriesValue(
        s,
        d
      );

    if(
      !Number.isFinite(v)
    )return;

    const y=
      this._priceToY(
        v,
        0
      );

    ctx.save();

    ctx.strokeStyle=
      o.priceLineColor||
      o.color||
      o.lineColor||
      (
        Number(d?.close)>=
        Number(d?.open)
          ?o.upColor
          :o.downColor
      )||
      '#00c7b1';

    ctx.lineWidth=
      Math.max(
        .5,
        finite(
          o.priceLineWidth,
          1
        )
      );

    ctx.setLineDash(
      lineDash(
        o.priceLineStyle
      )
    );

    ctx.beginPath();

    ctx.moveTo(
      rect.left,
      y
    );

    ctx.lineTo(
      rect.right,
      y
    );

    ctx.stroke();
    ctx.restore();
  }

  _drawPriceLines(
    ctx,
    s,
    rect
  ){
    for(
      const pl
      of s.priceLines
    ){
      const y=
        this._priceToY(
          Number(pl.price),
          s.paneIndex
        );

      if(
        !Number.isFinite(y)
      )continue;

      ctx.save();

      ctx.strokeStyle=
        pl.color||
        'rgba(148,163,184,.48)';

      ctx.lineWidth=
        Math.max(
          .5,
          finite(
            pl.lineWidth,
            1
          )
        );

      ctx.setLineDash(
        lineDash(
          pl.lineStyle
        )
      );

      ctx.beginPath();

      ctx.moveTo(
        rect.left,
        y
      );

      ctx.lineTo(
        rect.right,
        y
      );

      ctx.stroke();
      ctx.restore();
    }
  }

  _axisLabelCandidates(){
    const out=[];
    const main=
      this._mainSeries();

    const p=
      this._plotRect();

    if(
      main &&
      main.data.length
    ){
      const d=
        main.data.at(-1);

      const price=
        this._seriesValue(
          main,
          d
        );

      const y=
        this._priceToY(
          price,
          0
        );

      const o=
        main.optionsData;

      const color=
        o.priceLineColor||
        o.color||
        o.lineColor||
        (
          Number(d?.close)>=
          Number(d?.open)
            ?o.upColor
            :o.downColor
        )||
        '#00c7b1';

      if(
        o.lastValueVisible!==false &&
        Number.isFinite(y)
      ){
        out.push({
          kind:'last',
          pane:0,
          y,
          text:
            fmtNumber(
              price,
              o.priceFormat
                ?.precision??
              2
            ),
          color,
          title:
            o.lastValueTitle||
            '',
          countdown:
            o.showCountdown
              ?(
                o.countdownText||
                ''
              )
              :''
        });
      }
    }

    for(
      const s
      of this.series
    ){
      for(
        const pl
        of s.priceLines
      ){
        if(
          pl.axisLabelVisible===false
        )continue;

        const y=
          this._priceToY(
            Number(pl.price),
            s.paneIndex
          );

        if(
          !Number.isFinite(y)
        )continue;

        const precision=
          s.optionsData
            ?.priceFormat
            ?.precision??
          this._precisionForPane(
            s.paneIndex
          );

        let text=
          fmtNumber(
            pl.price,
            precision
          );

        let title=
          pl.title||'';

        if(
          title!=='' &&
          Number.isFinite(
            Number(title)
          )&&
          Math.abs(
            Number(title)-
            Number(pl.price)
          )<1e-9
        ){
          text=String(title);
          title='';
        }

        out.push({
          kind:'line',
          pane:s.paneIndex,
          y,
          text,
          color:
            pl.color||
            '#64748b',
          title
        });
      }
    }

    return out.filter(
      x=>
        x.y>=0 &&
        x.y<=p.bottom
    );
  }

  _layoutAxisLabels(items){
    const byPane=
      new Map();

    for(
      const it
      of items
    ){
      if(
        !byPane.has(
          it.pane
        )
      ){
        byPane.set(
          it.pane,
          []
        );
      }

      byPane
        .get(it.pane)
        .push({
          ...it,
          drawY:it.y,
          labelHeight:
            it.countdown
              ?30
              :18
        });
    }

    const out=[];

    for(
      const arr
      of byPane.values()
    ){
      arr.sort(
        (a,b)=>a.y-b.y
      );

      for(
        let i=1;
        i<arr.length;
        i++
      ){
        const minGap=
          (
            arr[i-1]
              .labelHeight+
            arr[i]
              .labelHeight
          )/2+
          2;

        if(
          arr[i].drawY-
          arr[i-1].drawY<
          minGap
        ){
          arr[i].drawY=
            arr[i-1].drawY+
            minGap;
        }
      }

      const rect=
        this._paneRects()[
          arr[0]?.pane||0
        ];

      if(
        rect &&
        arr.length
      ){
        const last=
          arr.at(-1);

        const overflow=
          (
            last.drawY+
            last.labelHeight/2
          )-
          (
            rect.bottom-1
          );

        if(overflow>0){
          for(
            const a
            of arr
          ){
            a.drawY-=overflow;
          }
        }

        const first=
          arr[0];

        const under=
          (
            rect.top+1
          )-
          (
            first.drawY-
            first.labelHeight/2
          );

        if(under>0){
          for(
            const a
            of arr
          ){
            a.drawY+=under;
          }
        }
      }

      out.push(...arr);
    }

    return out;
  }

  _drawTag(
    ctx,
    x,
    y,
    w,
    h,
    color,
    text,
    title='',
    textColor='#fff'
  ){
    ctx.save();

    ctx.fillStyle=color;
    ctx.globalAlpha=.96;

    ctx.fillRect(
      x,
      y-h/2,
      w,
      h
    );

    ctx.globalAlpha=1;

    ctx.strokeStyle=
      rgbaWithAlpha(
        textColor,
        .42
      );

    ctx.strokeRect(
      x+.5,
      y-h/2+.5,
      w-1,
      h-1
    );

    ctx.fillStyle=textColor;
    ctx.textAlign='left';
    ctx.textBaseline='middle';

    const label=
      title
        ?`${title} ${text}`
        :String(text??'');

    let fs=
      w<48
        ?8
        :10;

    const measured=()=>
      typeof ctx.measureText===
      'function'
        ?ctx.measureText(
          label
        ).width
        :label.length*
          fs*
          .58;

    ctx.font=
      `600 ${fs}px Inter,system-ui,sans-serif`;

    while(
      fs>7 &&
      measured()>w-8
    ){
      fs-=1;

      ctx.font=
        `600 ${fs}px Inter,system-ui,sans-serif`;
    }

    ctx.fillText(
      label,
      x+4,
      y,
      Math.max(
        1,
        w-7
      )
    );

    ctx.restore();
  }

  _drawAxes(
    ctx,
    paneRects
  ){
    const p=
      this._plotRect();

    const layout=
      this.optionsData.layout||
      {};

    const text=
      layout.textColor||
      '#9db4cc';

    const bg=
      layout.background?.color||
      '#111820';

    ctx.save();

    ctx.fillStyle=bg;

    ctx.fillRect(
      p.right,
      0,
      p.axisW,
      this.height
    );

    ctx.fillRect(
      0,
      p.bottom,
      p.right,
      p.timeH
    );

    ctx.strokeStyle=
      'rgba(90,120,145,.35)';

    ctx.beginPath();

    ctx.moveTo(
      p.right+.5,
      0
    );

    ctx.lineTo(
      p.right+.5,
      p.bottom
    );

    ctx.moveTo(
      0,
      p.bottom+.5
    );

    ctx.lineTo(
      p.right,
      p.bottom+.5
    );

    ctx.stroke();

    ctx.font=
      `${window.innerWidth<=780?9:10}px Inter,system-ui,sans-serif`;

    ctx.fillStyle=text;
    ctx.textBaseline='middle';
    ctx.textAlign='left';

    for(
      const rect
      of paneRects
    ){
      const tickTarget=
        Math.max(
          rect.index===0
            ?6
            :4,
          Math.floor(
            rect.height/
            (
              rect.index===0
                ?48
                :44
            )
          )
        );

      for(
        const tick
        of this._axisTicks(
          rect.index,
          tickTarget
        )
      ){
        const y=
          yForPrice(
            tick.t,
            this._paneRange(
              rect.index
            ),
            rect.top,
            rect.height
          );

        if(
          y<rect.top+7 ||
          y>rect.bottom-7
        )continue;

        ctx.fillStyle=
          tick.major &&
          rect.index===0 &&
          this.optionsData
            .majorRoundGrid
            ?(
              this.optionsData
                .roundNumberColor||
              text
            )
            :text;

        ctx.font=
          tick.major &&
          rect.index===0 &&
          this.optionsData
            .majorRoundGrid
            ?`600 ${window.innerWidth<=780?9:10}px Inter,system-ui,sans-serif`
            :`${window.innerWidth<=780?9:10}px Inter,system-ui,sans-serif`;

        ctx.fillText(
          tick.label,
          p.right+5,
          y
        );
      }

      const po=
        this.paneOptions.get(
          rect.index
        )||{};

      if(
        rect.index>0 &&
        po.title
      ){
        ctx.fillStyle=text;

        ctx.font=
          '600 10px Inter,system-ui,sans-serif';

        ctx.fillText(
          po.title,
          6,
          rect.top+11
        );
      }
    }

    const data=
      this._mainData();

    const tz=
      this.optionsData.timezone||
      'Local';

    ctx.textAlign='center';
    ctx.textBaseline='top';

    ctx.font=
      `${window.innerWidth<=780?9:10}px Inter,system-ui,sans-serif`;

    for(
      const i
      of timeTickIndices(
        {
          start:
            Math.max(
              0,
              Math.floor(
                this.visibleRange
                  ?.from||
                0
              )
            ),
          end:
            Math.min(
              data.length-1,
              Math.ceil(
                this.visibleRange
                  ?.to||
                0
              )
            )
        },
        7
      )
    ){
      const x=
        this.timeScaleApi
          .logicalToCoordinate(i);

      if(
        x<24 ||
        x>p.right-24
      )continue;

      const t=data[i]?.time;

      const label=
        this._intervalSeconds()<86400
          ?fmtTime(
            t,
            tz,
            false
          )
          :fmtDate(
            t,
            tz
          );

      ctx.fillStyle=text;

      ctx.fillText(
        label,
        x,
        p.bottom+6
      );
    }

    for(
      const it
      of this._layoutAxisLabels(
        this._axisLabelCandidates()
      )
    ){
      const w=
        Math.min(
          p.axisW-2,
          Math.max(
            54,
            6+
            (
              it.title
                ?it.title.length*
                  5.5+
                  4
                :0
            )+
            it.text.length*
            6
          )
        );

      this._drawTag(
        ctx,
        p.right+1,
        it.drawY,
        w,
        18,
        it.color,
        it.text,
        it.title
      );

      if(
        it.kind==='last' &&
        it.countdown
      ){
        ctx.fillStyle=text;
        ctx.textAlign='left';
        ctx.textBaseline='top';

        ctx.font=
          '600 9px Inter,system-ui,sans-serif';

        ctx.fillText(
          it.countdown,
          p.right+5,
          it.drawY+10
        );
      }
    }

    ctx.restore();
  }

  _drawCrosshair(ctx){
    const c=
      this.externalCrosshair||
      this.crosshair;

    if(!c)return;

    const p=
      this._plotRect();

    if(
      c.x<0 ||
      c.x>p.right ||
      c.y<0 ||
      c.y>p.bottom
    )return;

    const opt=
      this.optionsData.crosshair||
      {};

    const v=
      opt.vertLine||
      {};

    const h=
      opt.horzLine||
      {};

    ctx.save();
    ctx.lineWidth=1;

    ctx.setLineDash(
      lineDash(
        v.style??2
      )
    );

    if(
      v.visible!==false
    ){
      ctx.strokeStyle=
        v.color||
        '#7f93a8';

      ctx.beginPath();

      ctx.moveTo(
        c.x,
        0
      );

      ctx.lineTo(
        c.x,
        p.bottom
      );

      ctx.stroke();
    }

    ctx.setLineDash(
      lineDash(
        h.style??2
      )
    );

    if(
      h.visible!==false
    ){
      ctx.strokeStyle=
        h.color||
        '#7f93a8';

      ctx.beginPath();

      ctx.moveTo(
        0,
        c.y
      );

      ctx.lineTo(
        p.right,
        c.y
      );

      ctx.stroke();
    }

    ctx.setLineDash([]);

    if(
      this.optionsData
        .showCrosshairLabels!==
      false
    ){
      const paneIndex=
        c.paneIndex??
        this._paneAtY(
          c.y
        );

      const price=
        this._yToPrice(
          c.y,
          paneIndex
        );

      const prec=
        this._precisionForPane(
          paneIndex
        );

      const bgc=
        h.labelBackgroundColor||
        '#173042';

      this._drawTag(
        ctx,
        p.right+1,
        c.y,
        Math.max(
          1,
          p.axisW-2
        ),
        18,
        bgc,
        fmtNumber(
          price,
          prec
        )
      );

      const logical=
        this.timeScaleApi
          .coordinateToLogical(
            c.x
          );

      const idx=
        clamp(
          Math.round(logical),
          0,
          Math.max(
            0,
            this._mainData()
              .length-1
          )
        );

      const t=
        this._mainData()[
          idx
        ]?.time;

      if(t!=null){
        const label=
          fmtTime(
            t,
            this.optionsData
              .timezone||
            'Local',
            this._intervalSeconds()<60
          );

        const w=
          Math.max(
            58,
            label.length*
            6+
            10
          );

        const x=
          clamp(
            c.x-w/2,
            0,
            p.right-w
          );

        ctx.fillStyle=
          v.labelBackgroundColor||
          '#173042';

        ctx.fillRect(
          x,
          p.bottom+1,
          w,
          19
        );

        ctx.fillStyle='#fff';
        ctx.textAlign='center';
        ctx.textBaseline='middle';

        ctx.font=
          '600 9px Inter,system-ui,sans-serif';

        ctx.fillText(
          label,
          x+w/2,
          p.bottom+10
        );
      }
    }

    ctx.restore();
  }

  render(){
    if(this.destroyed)return;

    this._ensureInitialRange();

    const ctx=this.ctx;
    const p=this._plotRect();

    const layout=
      this.optionsData.layout||
      {};

    const bg=
      layout.background?.color||
      '#111820';

    ctx.save();

    ctx.setTransform(
      DPR(),
      0,
      0,
      DPR(),
      0,
      0
    );

    ctx.fillStyle=bg;

    ctx.fillRect(
      0,
      0,
      this.width,
      this.height
    );

    const rects=
      this._paneRects();

    const {
      start,
      end
    }=
      this._visibleIndexRange();

    for(
      const rect
      of rects
    ){
      ctx.save();

      ctx.beginPath();

      ctx.rect(
        rect.left,
        rect.top,
        rect.width,
        rect.height
      );

      ctx.clip();

      this._drawGrid(
        ctx,
        rect
      );

      for(
        const s
        of this.series.filter(
          x=>
            x.paneIndex===
            rect.index &&
            x.optionsData.visible!==
            false
        )
      ){
        if(
          s.type==='candlestick'
        ){
          this._drawCandles(
            ctx,
            s,
            rect,
            start,
            end
          );
        }

        else if(
          s.type==='bar'
        ){
          this._drawBars(
            ctx,
            s,
            rect,
            start,
            end
          );
        }

        else if(
          s.type==='line'
        ){
          this._drawLine(
            ctx,
            s,
            rect,
            start,
            end,
            false
          );
        }

        else if(
          s.type==='area'
        ){
          this._drawLine(
            ctx,
            s,
            rect,
            start,
            end,
            true
          );
        }

        else if(
          s.type==='histogram'
        ){
          this._drawHistogram(
            ctx,
            s,
            rect,
            start,
            end
          );
        }

        this._drawPriceLines(
          ctx,
          s,
          rect
        );

        if(
          s===this._mainSeries()
        ){
          this._drawSeriesPriceLine(
            ctx,
            s,
            rect
          );
        }
      }

      ctx.restore();

      if(rect.index>0){
        ctx.strokeStyle=
          'rgba(75,105,130,.35)';

        ctx.beginPath();

        ctx.moveTo(
          0,
          rect.top-.5
        );

        ctx.lineTo(
          p.right,
          rect.top-.5
        );

        ctx.stroke();
      }
    }

    this._drawAxes(
      ctx,
      rects
    );

    this._drawCrosshair(
      ctx
    );

    ctx.restore();
  }
}

export function createNativeChart(
  host,
  options
){
  return new TradeAvataNativeChart(
    host,
    options
  );
}
