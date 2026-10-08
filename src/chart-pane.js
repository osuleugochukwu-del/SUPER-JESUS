import {
  generateBars, buildPeriodBars, buildDisplayBars, heikinAshi,
  SYMBOLS, formatPrice, niceStep, timeframeSeconds, periodLabel
} from './data.js';
import { DrawingLayer } from './drawings.js';
import { computeIndicator, valuesToData } from './indicators.js';
import { el, clamp, toast } from './utils.js';
import { historyPlanForPeriod, defaultHomeBars } from './chart-transition.js';
import { createNativeChart, NativeSeries } from './native-chart.js';

export class ChartPane{
  constructor(app,id,config={}){
    this.app=app;this.id=id;
    this.symbol=config.symbol||'XAUUSD';
    this.timeframe=config.timeframe||config.period?.value||'15s';
    this.period=config.period?.mode?structuredClone(config.period):{mode:'time',value:this.timeframe};
    this.chartType=config.chartType||'Candles';
    this.detached=!!config.detached;

    this.rawBars=[];this.periodBars=[];this.displayBars=[];this.barIndex=new Map();
    this.series=null;this.indicatorSeries=[];this.oscillatorPanes=[];this.chart=null;this.drawingLayer=null;

    /*
     * Full Native owns the real movement and price range.
     *
     * ChartPane only reflects the engine state in the UI.
     * It must never create a second competing drag controller.
     */
    this.manualMode=false;
    this.manualRange=null;
    this.scaleGesture=null;
    this.verticalPan=null;

    this.replayIndex=null;
    this.replaySelecting=false;
    this.replaySelectorLogical=null;
    this.replayFollow=true;
    this.replayTouchPress=null;
    this.replayLastTouchTap=null;

    this.lastCrosshair=null;
    this.mounted=false;
    this.suppressRangeEvent=false;

    this.transitionToken=0;
    this.transitionFrame=0;
    this.transitionSettleFrame=0;

    this.root=this.buildDom();
    this.chartHost=this.root.querySelector('.lwc-host');
    this.overlayCanvas=this.root.querySelector('.drawing-canvas');
    this.roundGridCanvas=this.root.querySelector('.round-grid-canvas');
  }

  mount(){
    if(this.mounted)return;
    this.mounted=true;

    this.createChart();

    this.drawingLayer=new DrawingLayer(
      this,
      this.overlayCanvas,
      ()=>this.app.state,
      e=>this.app.handleDrawingChange(e,this)
    );

    this.resizeObserver=new ResizeObserver(()=>this.resize());
    this.resizeObserver.observe(this.root);

    this.loadData({home:true});
    this.updateCursorMode();

    this.countdownTimer=setInterval(()=>this.updateCountdown(),1000);
    this.updateCountdown();
  }

  buildDom(){
    const root=el('section',{
      class:'chart-pane',
      tabindex:'0',
      'data-pane':this.id
    });

    root.innerHTML=`
      <div class="pane-overlay-head">
        <button class="pane-symbol-overlay" title="Open chart settings"><span class="diamond">◆</span><strong></strong><span class="market-dot"></span></button>
        <div class="pane-ohlc"></div>
        <div class="indicator-legend"></div>
      </div>
      <div class="pane-latency"><span>SYNC</span><b>18 ms</b><small>age 2 ms</small></div>
      <div class="bar-countdown"></div>
      <div class="lwc-host"></div>
      <canvas class="round-grid-canvas"></canvas>
      <canvas class="drawing-canvas"></canvas>
      <div class="data-window-card"></div>
      <div class="replay-selector-line"><span>SELECT REPLAY START</span></div>
      <div class="replay-toolbar"></div>
      <div class="chart-nav"><button data-nav="live">● LIVE</button><button data-nav="auto">AUTO</button><button data-nav="free">FREE</button><button data-nav="shift">SHIFT ${this.app.state.chartSettings.shiftPercent??22}%</button><button data-nav="reset">RESET</button></div>
      <div class="chart-mode-chip">AUTO</div>
    `;

    root.addEventListener('pointerdown',()=>this.app.setActivePaneById(this.id));

    root.addEventListener('contextmenu',e=>{
      if(!this.chart)return;
      e.preventDefault();

      const r=this.chartHost.getBoundingClientRect();
      const x=e.clientX-r.left;
      const y=e.clientY-r.top;
      const logical=this.logicalAtCoordinate(x);
      const price=this.priceAtCoordinate(y);
      const time=this.projectedTimeForLogical(logical);

      this.app.openChartContextMenu?.(e,this,{
        x,y,logical,price,time
      });
    });

    root.querySelector('.pane-symbol-overlay').addEventListener('dblclick',e=>{
      e.stopPropagation();
      this.app.openSettings('symbol');
    });

    root.querySelector('.pane-symbol-overlay').addEventListener('click',e=>{
      e.stopPropagation();
      this.app.openSettings('symbol');
    });

    root.querySelector('[data-nav="live"]').addEventListener('click',()=>this.goLive());
    root.querySelector('[data-nav="auto"]').addEventListener('click',()=>this.setAutoMode(false));
    root.querySelector('[data-nav="free"]').addEventListener('click',()=>this.enterFreeMode());
    root.querySelector('[data-nav="shift"]').addEventListener('click',e=>this.cycleShift(e.currentTarget));
    root.querySelector('[data-nav="reset"]').addEventListener('click',()=>this.resetView());

    return root;
  }

  createChart(){
    const L=NativeSeries;
    const s=this.app.state;
    const cs=s.chartSettings;

    this.chartHost.classList.add('ta-native-v3-host');

    this.chart=createNativeChart(this.chartHost,{
      autoSize:true,

      layout:{
        background:{
          type:'solid',
          color:s.background
        },
        textColor:s.textColor,
        fontSize:window.innerWidth<=780?9:11,
        fontFamily:'Inter,system-ui,sans-serif',
        attributionLogo:false,
        panes:{
          separatorColor:'#1b3348',
          separatorHoverColor:'#2b5574',
          enableResize:true
        }
      },

      grid:{
        vertLines:{
          visible:s.gridV,
          color:s.gridColor
        },
        horzLines:{
          visible:s.gridH,
          color:s.gridColor
        }
      },

      majorRoundGrid:!!s.majorRoundGrid,
      roundGridColor:'rgba(126,157,185,.22)',
      roundNumberColor:s.textColor,
      timezone:s.timezone||'UTC+1 Lagos',
      sessionSeparators:!!s.showSessionSeparators,
      showCrosshairLabels:s.showCrosshairLabels!==false,

      rightPriceScale:{
        visible:true,
        borderVisible:false,
        autoScale:true,
        mode:this.priceScaleModeValue(),

        scaleMargins:{
          top:cs.topMargin,
          bottom:cs.bottomMargin
        },

        minimumWidth:window.innerWidth<=780?42:46,
        tickMarkDensity:2.5
      },

      leftPriceScale:{
        visible:false
      },

      timeScale:{
        visible:true,
        borderVisible:false,
        timeVisible:true,
        secondsVisible:true,
        rightOffset:cs.rightOffset,
        barSpacing:cs.barSpacing,
        minBarSpacing:.45,
        fixLeftEdge:false,
        fixRightEdge:false,
        lockVisibleTimeRangeOnResize:false,
        shiftVisibleRangeOnNewBar:true
      },

      crosshair:{
        mode:L.CrosshairMode?.Normal??0,

        vertLine:{
          visible:true,
          color:s.crosshairColor,
          width:1,
          style:L.LineStyle?.Dashed??2,
          labelBackgroundColor:'#173042'
        },

        horzLine:{
          visible:true,
          color:s.crosshairColor,
          width:1,
          style:L.LineStyle?.Dashed??2,
          labelBackgroundColor:'#173042'
        }
      },

      handleScroll:{
        mouseWheel:true,
        pressedMouseMove:true,
        horzTouchDrag:true,
        vertTouchDrag:true
      },

      handleScale:{
        axisPressedMouseMove:{
          time:true,
          price:true
        },

        axisDoubleClickReset:{
          time:true,
          price:true
        },

        mouseWheel:true,
        pinch:true
      },

      /*
       * Smooth direct movement is NOT kinetic movement.
       *
       * Hold -> move -> release -> STOP.
       */
      kineticScroll:{
        mouse:false,
        touch:false
      },

      hoveredSeriesOnTop:true
    });

    this.chart.timeScale().subscribeVisibleLogicalRangeChange(range=>{
      this.renderOverlays();

      if(!this.suppressRangeEvent){
        this.app.onPaneRangeChanged?.(this,range);
      }
    });

    this.chart.subscribeCrosshairMove(param=>{
      this.lastCrosshair=param;
      this.updateCrosshairReadout(param);
      this.updateDataWindow(param);
      this.app.onCrosshair?.(this,param);
    });

    this.installGestureBridge();
    this.installReplaySelectorBridge();
  }

  priceScaleModeValue(){
    const L=NativeSeries;
    const m=this.app.state.priceScaleMode||'normal';

    const map={
      normal:L.PriceScaleMode?.Normal??0,
      log:L.PriceScaleMode?.Logarithmic??1,
      percent:L.PriceScaleMode?.Percentage??2,
      indexed:L.PriceScaleMode?.IndexedTo100??3
    };

    return map[m]??map.normal;
  }

  /*
   * ============================================================
   * NATIVE GESTURE BRIDGE
   * ============================================================
   *
   * File 1 now owns:
   *
   * - horizontal dragging
   * - manual X/Y dragging
   * - price-axis scaling
   * - pointer precision
   * - STOP-on-release
   *
   * This bridge therefore MUST NOT intercept chart-body movement.
   *
   * Its only job is to keep the AUTO / MANUAL user interface
   * synchronized when Native releases the price axis into manual mode.
   */
  installGestureBridge(){
    const host=this.chartHost;

    host.addEventListener('pointerdown',e=>{
      /*
       * Replay can still navigate through Native.
       * Returning here does not block or cancel the event.
       */
      if(this.replaySelecting)return;

      if(!['cursor','crosshair'].includes(this.app.state.activeTool))return;

      const r=host.getBoundingClientRect();
      const x=e.clientX-r.left;
      const axisWidth=window.innerWidth<=780?42:46;

      /*
       * Right price axis:
       *
       * Observe only.
       *
       * There is deliberately no second scale calculation here.
       */
      if(x>r.width-axisWidth-2){
        this.scaleGesture={
          x:e.clientX,
          y:e.clientY,
          moved:false
        };
      }
    },true);

    host.addEventListener('pointermove',e=>{
      /*
       * Nothing in ChartPane handles chart-body dragging anymore.
       *
       * Native receives every body pointermove directly.
       */
      if(!this.scaleGesture)return;

      const moved=Math.hypot(
        e.clientX-this.scaleGesture.x,
        e.clientY-this.scaleGesture.y
      );

      if(moved>1&&!this.scaleGesture.moved){
        this.scaleGesture.moved=true;

        /*
         * Native will turn its main scale manual during this same
         * interaction. Reflect that immediately in the UI.
         */
        this.manualMode=true;
        this.updateModeChip();
      }

      /*
       * No preventDefault.
       * No stopPropagation.
       */
    },true);

    const end=()=>{
      const changed=!!this.scaleGesture?.moved;

      this.scaleGesture=null;
      this.verticalPan=null;

      if(changed){
        /*
         * Read Native's final range after the target handler has finished.
         */
        setTimeout(()=>{
          try{
            const nativeManual=
              this.chart?.isMainPriceManual?.();

            this.manualMode=
              typeof nativeManual==='boolean'
                ?nativeManual
                :true;

            this.manualRange=
              this.chart?.getMainPriceRange?.()||
              this.rangeFromCoordinates();

            this.updateModeChip();
          }catch{}
        },0);
      }

      setTimeout(()=>this.captureOscillatorPaneHeights(),0);
    };

    host.addEventListener('pointerup',end,true);
    host.addEventListener('pointercancel',end,true);

    host.addEventListener('dblclick',e=>{
      if(this.replaySelecting)return;

      const r=host.getBoundingClientRect();
      const x=e.clientX-r.left;
      const axisWidth=window.innerWidth<=780?42:46;

      /*
       * Price-axis double click = AUTO.
       */
      if(x>r.width-axisWidth-2){
        this.setAutoMode(false);
        return;
      }

      if(
        this.app.state.selectedDrawingId||
        !['cursor','crosshair'].includes(this.app.state.activeTool)
      ){
        return;
      }

      /*
       * Normal empty-chart double click intentionally does nothing.
       */
    });
  }

  isPlainMainChartPoint(x,y){
    try{
      const panes=this.chart?.panes?.()||[];
      const mainHeight=panes[0]?.getHeight?.()??this.chartHost.clientHeight;

      if(y<0||y>mainHeight)return false;

      const logical=this.logicalAtCoordinate(x);
      const idx=Math.round(logical);

      if(
        !Number.isFinite(idx)||
        idx<0||
        idx>=this.displayBars.length
      ){
        return true;
      }

      const bar=this.displayBars[idx];
      const cx=this.logicalToCoordinate(idx);

      if(cx==null)return true;

      const half=Math.max(
        4,
        Math.min(
          14,
          (this.app.state.chartSettings?.barSpacing||7)*.6
        )
      );

      if(Math.abs(x-cx)>half)return true;

      if(this.chartType==='Line'||this.chartType==='Area'){
        const py=this.yForPrice(bar.close);
        return py==null||Math.abs(y-py)>7;
      }

      const hi=this.yForPrice(bar.high??bar.close);
      const lo=this.yForPrice(bar.low??bar.close);

      if(hi==null||lo==null)return true;

      const top=Math.min(hi,lo)-5;
      const bottom=Math.max(hi,lo)+5;

      return y<top||y>bottom;
    }catch{
      return true;
    }
  }

  captureOscillatorPaneHeights(){
    if(!this.oscillatorPanes?.length)return;

    try{
      const panes=this.chart?.panes?.()||[];
      let changed=false;

      for(const meta of this.oscillatorPanes){
        const pane=panes[meta.paneIndex];
        const h=pane?.getHeight?.();

        if(!Number.isFinite(h)||h<28)continue;

        const next=Math.round(h);

        if(meta.cfg.paneHeight!==next){
          meta.cfg.paneHeight=next;
          changed=true;
        }
      }

      if(changed)this.app.save?.();
    }catch{}
  }

  applyOscillatorPaneHeights(){
    if(!this.oscillatorPanes?.length)return;

    try{
      const panes=this.chart?.panes?.()||[];
      const hostH=Math.max(240,this.chartHost.clientHeight||600);
      const count=this.oscillatorPanes.length;

      const fallback=Math.max(
        56,
        Math.min(
          130,
          Math.floor((hostH*.42)/Math.max(1,count))
        )
      );

      for(const meta of this.oscillatorPanes){
        const pane=panes[meta.paneIndex];

        if(!pane?.setHeight)continue;

        const wanted=Math.max(
          36,
          Math.min(
            Math.round(hostH*.42),
            Number(meta.cfg.paneHeight)||fallback
          )
        );

        pane.setHeight(wanted);
      }
    }catch{}
  }

  /*
   * ============================================================
   * REPLAY SELECTOR
   * ============================================================
   *
   * Desktop:
   *
   * press + drag = normal chart movement
   * release = stop
   * repeat as required
   * DOUBLE CLICK = choose Replay start
   *
   * Phone/tablet:
   *
   * touch + drag = normal chart movement
   * DOUBLE TAP = choose Replay start
   */
  installReplaySelectorBridge(){
    const host=this.chartHost;
    const line=this.root.querySelector('.replay-selector-line');

    /*
     * The selector itself must never become an invisible wall over
     * the chart.
     */
    line.style.pointerEvents='none';

    const selectorPoint=(clientX,clientY)=>{
      const r=host.getBoundingClientRect();

      const x=clientX-r.left;
      const y=clientY-r.top;
      const axisWidth=window.innerWidth<=780?42:46;

      if(x>r.width-axisWidth-2)return false;

      if(
        y<0||
        y>Math.max(0,r.height-24)
      ){
        return false;
      }

      const logical=this.logicalAtCoordinate(
        clamp(
          x,
          0,
          r.width-axisWidth-1
        )
      );

      const idx=clamp(
        Math.round(logical),
        20,
        Math.max(
          20,
          this.displayBars.length-2
        )
      );

      this.replaySelectorLogical=logical;

      this.exitReplaySelection();

      this.app.onReplayStartSelected?.(
        this,
        idx
      );

      return true;
    };

    host.addEventListener('pointerdown',e=>{
      if(
        !this.replaySelecting||
        e.pointerType!=='touch'
      ){
        return;
      }

      this.replayTouchPress={
        id:e.pointerId,
        x:e.clientX,
        y:e.clientY,
        time:Date.now(),
        moved:false
      };

      /*
       * No preventDefault.
       * Native still receives this touch and can pan.
       */
    },true);

    host.addEventListener('pointermove',e=>{
      if(!this.replaySelecting)return;

      if(
        this.replayTouchPress&&
        this.replayTouchPress.id===e.pointerId
      ){
        if(
          Math.hypot(
            e.clientX-this.replayTouchPress.x,
            e.clientY-this.replayTouchPress.y
          )>9
        ){
          this.replayTouchPress.moved=true;
        }
      }

      const r=host.getBoundingClientRect();
      const axisWidth=window.innerWidth<=780?42:46;

      const maxX=Math.max(
        0,
        r.width-axisWidth-1
      );

      const x=clamp(
        e.clientX-r.left,
        0,
        maxX
      );

      const logical=this.logicalAtCoordinate(x);

      this.replaySelectorLogical=logical;
      line.style.left=`${Math.round(x)}px`;

      /*
       * Do not consume this pointer movement.
       * Native remains fully draggable.
       */
    },true);

    host.addEventListener('pointercancel',e=>{
      if(
        this.replayTouchPress?.id===
        e.pointerId
      ){
        this.replayTouchPress=null;
      }
    },true);

    host.addEventListener('pointerup',e=>{
      if(
        !this.replaySelecting||
        e.pointerType!=='touch'||
        !this.replayTouchPress||
        this.replayTouchPress.id!==e.pointerId
      ){
        return;
      }

      const press=this.replayTouchPress;
      this.replayTouchPress=null;

      const now=Date.now();

      /*
       * A drag must never count as a tap.
       */
      if(
        press.moved||
        now-press.time>450
      ){
        this.replayLastTouchTap=null;
        return;
      }

      const previous=this.replayLastTouchTap;

      if(
        previous&&
        now-previous.time<=450&&
        Math.hypot(
          e.clientX-previous.x,
          e.clientY-previous.y
        )<=24
      ){
        this.replayLastTouchTap=null;

        if(
          selectorPoint(
            e.clientX,
            e.clientY
          )
        ){
          e.preventDefault();
          e.stopPropagation();
        }

        return;
      }

      /*
       * First tap only arms the second tap.
       * It does NOT select Replay.
       */
      this.replayLastTouchTap={
        x:e.clientX,
        y:e.clientY,
        time:now
      };
    },true);

    /*
     * Desktop confirmation.
     */
    host.addEventListener('dblclick',e=>{
      if(!this.replaySelecting)return;

      if(
        selectorPoint(
          e.clientX,
          e.clientY
        )
      ){
        e.preventDefault();
        e.stopPropagation();
      }
    },true);
  }

  enterReplaySelection(){
    this.replaySelecting=true;
    this.replaySelectorLogical=null;
    this.replayTouchPress=null;
    this.replayLastTouchTap=null;

    this.root.classList.add('replay-selecting');

    const line=
      this.root.querySelector(
        '.replay-selector-line'
      );

    line.style.pointerEvents='none';
    line.style.display='block';
  }

  exitReplaySelection(){
    this.replaySelecting=false;
    this.replayTouchPress=null;
    this.replayLastTouchTap=null;

    this.root.classList.remove('replay-selecting');

    this.root
      .querySelector('.replay-selector-line')
      .style.display='none';
  }

  renderReplayToolbar(content){
    const box=this.root.querySelector('.replay-toolbar');

    box.replaceChildren(
      ...(Array.isArray(content)?content:[content]).filter(Boolean)
    );

    box.classList.toggle(
      'show',
      box.childNodes.length>0
    );
  }

  clearReplayToolbar(){
    const box=this.root.querySelector('.replay-toolbar');
    box.innerHTML='';
    box.classList.remove('show');
  }

  enterFreeMode(){
    this.manualMode=true;

    this.manualRange=
      this.chart?.getMainPriceRange?.()||
      this.rangeFromCoordinates();

    this.applyManualProvider();
    this.updateModeChip();

    toast('Free X/Y chart movement enabled');
  }

  cycleShift(button){
    const opts=[0,10,22,35];
    const cur=this.app.state.chartSettings.shiftPercent??22;

    let i=opts.findIndex(v=>v===cur);
    i=(i+1)%opts.length;

    const next=opts[i];

    this.app.state.chartSettings.shiftPercent=next;

    const visibleBars=Math.max(
      10,
      this.chartHost.clientWidth/
      Math.max(
        .5,
        this.app.state.chartSettings.barSpacing||7
      )
    );

    const rightOffset=Math.round(
      visibleBars*next/100
    );

    try{
      this.chart.timeScale().applyOptions({
        rightOffset
      });
    }catch{}

    if(button)button.textContent=`SHIFT ${next}%`;

    this.app.save();
  }

  rangeFromCoordinates(){
    /*
     * When Native is already manual, prefer the engine's real raw
     * instrument-price range.
     */
    try{
      if(
        this.chart?.isMainPriceManual?.()
      ){
        const native=
          this.chart?.getMainPriceRange?.();

        if(
          native&&
          Number.isFinite(native.min)&&
          Number.isFinite(native.max)&&
          native.max>native.min
        ){
          return{
            ...native
          };
        }
      }
    }catch{}

    if(!this.series)return null;

    const h=Math.max(
      20,
      this.chartHost.clientHeight-24
    );

    const a=this.series.coordinateToPrice(4);
    const b=this.series.coordinateToPrice(h-4);

    if(a==null||b==null)return null;

    return{
      min:Math.min(a,b),
      max:Math.max(a,b)
    };
  }

  /*
   * FREE/manual state is delegated to Full Native.
   *
   * There is only ONE main price range.
   */
  applyManualProvider(){
    if(!this.manualRange)return;

    let candidate={
      min:Number(this.manualRange.min),
      max:Number(this.manualRange.max)
    };

    if(
      !Number.isFinite(candidate.min)||
      !Number.isFinite(candidate.max)||
      candidate.max<=candidate.min
    ){
      return;
    }

    try{
      /*
       * Preferred Full Native API from File 1.
       */
      if(
        typeof this.chart?.setMainManualRange===
        'function'
      ){
        const safe=
          this.chart.setMainManualRange(
            candidate
          );

        if(
          safe&&
          Number.isFinite(safe.min)&&
          Number.isFinite(safe.max)&&
          safe.max>safe.min
        ){
          candidate=safe;
          this.manualRange={
            ...safe
          };
        }

        /*
         * Remove old compatibility providers.
         */
        this.series?.applyOptions({
          autoscaleInfoProvider:null
        });

        this.indicatorSeries
          .filter(x=>x.paneIndex===0)
          .forEach(x=>{
            x.series.applyOptions({
              autoscaleInfoProvider:null
            });
          });

        return;
      }

      /*
       * Compatibility path for an older Native build.
       */
      if(this.chart?.manualPaneRanges?.set){
        if(
          typeof this.chart._constrainMainManualRange==='function'
        ){
          candidate=
            this.chart._constrainMainManualRange(
              candidate
            );
        }

        this.manualRange={...candidate};

        this.chart.manualPaneRanges.set(
          0,
          {...candidate}
        );

        if(this.chart.priceScaleOptions){
          this.chart.priceScaleOptions.autoScale=false;
        }

        this.series?.applyOptions({
          autoscaleInfoProvider:null
        });

        this.indicatorSeries
          .filter(x=>x.paneIndex===0)
          .forEach(x=>{
            x.series.applyOptions({
              autoscaleInfoProvider:null
            });
          });

        this.chart.requestRender?.();
        return;
      }

      /*
       * Final legacy fallback only.
       */
      const provider=()=>({
        priceRange:{
          minValue:candidate.min,
          maxValue:candidate.max
        }
      });

      this.series?.applyOptions({
        autoscaleInfoProvider:provider
      });

      this.indicatorSeries
        .filter(x=>x.paneIndex===0)
        .forEach(x=>{
          x.series.applyOptions({
            autoscaleInfoProvider:provider
          });
        });

    }catch{}
  }

  clearManualProvider(){
    try{
      /*
       * Preferred Full Native reset.
       */
      this.chart?.clearMainManualRange?.();

      /*
       * Compatibility cleanup.
       */
      this.chart?.manualPaneRanges?.delete?.(0);

      if(this.chart?.priceScaleOptions){
        this.chart.priceScaleOptions.autoScale=true;
      }

      this.series?.applyOptions({
        autoscaleInfoProvider:null
      });

      this.indicatorSeries.forEach(x=>{
        x.series.applyOptions({
          autoscaleInfoProvider:null
        });
      });

      this.chart?.requestRender?.();

    }catch{}
  }

  setAutoMode(home=false){
    this.manualMode=false;
    this.manualRange=null;

    this.clearManualProvider();

    try{
      this.chart.priceScale('right').applyOptions({
        autoScale:true,
        mode:this.priceScaleModeValue()
      });
    }catch{}

    if(home)this.homeView();

    this.updateModeChip();
  }

  updateModeChip(){
    const n=this.root.querySelector('.chart-mode-chip');

    if(!n)return;

    n.textContent=this.manualMode?'MANUAL':'AUTO';
    n.classList.toggle('manual',this.manualMode);
  }

  currentDataLength(){
    return this.replayIndex==null
      ?this.displayBars.length
      :Math.min(
        this.displayBars.length,
        this.replayIndex+1
      );
  }

  isRenkoConstruction(){
    return(
      this.period?.mode==='renko-pips'||
      this.period?.mode==='renko-time'
    );
  }

  captureTransitionView(){
    try{
      const ts=this.chart?.timeScale?.();
      const range=ts?.getVisibleLogicalRange?.();
      const len=this.currentDataLength();

      if(!range||!len)return null;

      const last=len-1;
      const center=(range.from+range.to)/2;
      const currentPrice=Number(this.displayBars[last]?.close);

      const h=Math.max(
        1,
        this.chart?.panes?.()?.[0]?.getHeight?.()||
        this.chartHost?.clientHeight||
        1
      );

      const y=Number.isFinite(currentPrice)
        ?this.yForPrice(currentPrice)
        :null;

      const priceRatio=Number.isFinite(y)
        ?clamp(y/h,.04,.96)
        :null;

      const visibleData=this.visiblePriceRange?.();

      const dataSpan=visibleData
        ?Math.max(
          1e-9,
          visibleData.max-visibleData.min
        )
        :null;

      /*
       * Query Native directly instead of relying on an old ChartPane
       * copy of the manual range.
       */
      const nativeManual=
        typeof this.chart?.isMainPriceManual==='function'
          ?this.chart.isMainPriceManual()
          :this.manualMode;

      const nativeRange=
        nativeManual
          ?(
            this.chart?.getMainPriceRange?.()||
            this.manualRange
          )
          :null;

      const manualSpan=nativeRange
        ?Math.max(
          1e-9,
          nativeRange.max-nativeRange.min
        )
        :null;

      return{
        visibleBars:Math.max(
          8,
          range.to-range.from
        ),

        centerTime:this.projectedTimeForLogical(center),

        futureBars:Math.max(
          0,
          range.to-last
        ),

        wasLive:range.to>=last-2,

        priceRatio,

        manualMode:!!nativeManual,

        verticalScaleFactor:
          manualSpan&&dataSpan
            ?clamp(
              manualSpan/dataSpan,
              .35,
              4
            )
            :1
      };
    }catch{
      return null;
    }
  }

  restoreTransitionView(snapshot,token=this.transitionToken){
    const len=this.currentDataLength();

    if(!snapshot||!len){
      this.homeView();
      return;
    }

    const last=len-1;

    const visible=Math.max(
      12,
      Number(snapshot.visibleBars)||
      this.homeBarTarget()
    );

    let from;
    let to;

    if(snapshot.wasLive){
      to=last+
        Math.max(
          0,
          Number(snapshot.futureBars)||0
        );

      from=to-visible;
    }else{
      let center=this.logicalForTime?.(
        snapshot.centerTime
      );

      if(!Number.isFinite(center)){
        center=last-visible/2;
      }

      from=center-visible/2;
      to=center+visible/2;
    }

    this.suppressRangeEvent=true;

    try{
      const ts=this.chart.timeScale();

      ts.applyOptions({
        minBarSpacing:this.isRenkoConstruction()
          ?1.25
          :.45
      });

      ts.setVisibleLogicalRange({
        from,
        to
      });

    }catch{}

    requestAnimationFrame(()=>{
      if(token!==this.transitionToken)return;

      if(
        snapshot.manualMode&&
        Number.isFinite(snapshot.priceRatio)
      ){
        const base=this.visiblePriceRange?.();

        const current=Number(
          this.displayBars[
            this.currentDataLength()-1
          ]?.close
        );

        if(base&&Number.isFinite(current)){
          const baseSpan=Math.max(
            1e-9,
            base.max-base.min
          );

          const factor=clamp(
            Number(snapshot.verticalScaleFactor)||1,
            .35,
            4
          );

          let span=Math.max(
            baseSpan,
            baseSpan*factor
          );

          const q=clamp(
            Number(snapshot.priceRatio),
            .08,
            .92
          );

          let candidate={
            min:current-(1-q)*span,
            max:current+q*span
          };

          if(candidate.min>base.min){
            const d=candidate.min-base.min;
            candidate.min-=d;
            candidate.max-=d;
          }

          if(candidate.max<base.max){
            const d=base.max-candidate.max;
            candidate.min+=d;
            candidate.max+=d;
          }

          if(
            candidate.min>base.min||
            candidate.max<base.max
          ){
            candidate={
              min:Math.min(
                candidate.min,
                base.min
              ),

              max:Math.max(
                candidate.max,
                base.max
              )
            };
          }

          this.manualMode=true;
          this.manualRange=candidate;
          this.applyManualProvider();
        }

      }else{
        this.manualMode=false;
        this.manualRange=null;
        this.clearManualProvider();

        try{
          this.chart.priceScale('right').applyOptions({
            autoScale:true,
            mode:this.priceScaleModeValue()
          });
        }catch{}
      }

      this.updateModeChip();

      this.suppressRangeEvent=false;
      this.renderOverlays();

      this.nativeV27Renderer?.sync?.();
      this.nativeV27Renderer?.render?.();
    });
  }

  scheduleTransitionView(
    snapshot,
    {
      home=true,
      preserveView=false
    }={}
  ){
    const token=++this.transitionToken;

    if(this.transitionFrame)cancelAnimationFrame(this.transitionFrame);
    if(this.transitionSettleFrame)cancelAnimationFrame(this.transitionSettleFrame);

    this.transitionFrame=requestAnimationFrame(()=>{
      if(token!==this.transitionToken)return;

      if(home||!preserveView||!snapshot){
        this.homeView({
          fromTransition:true,
          token
        });
      }else{
        this.restoreTransitionView(
          snapshot,
          token
        );
      }

      this.transitionSettleFrame=requestAnimationFrame(()=>{
        if(token!==this.transitionToken)return;

        this.refreshHeader();
        this.renderOverlays();

        this.nativeV27Renderer?.sync?.();
        this.nativeV27Renderer?.render?.();
      });
    });
  }

  renkoHomeBarTarget(){
    const len=this.currentDataLength();

    if(!len)return 48;

    const cs=this.app.state.chartSettings||{};
    const mobile=window.innerWidth<=780;

    const override=Number(
      mobile
        ?cs.renkoHomeBarsMobile
        :cs.renkoHomeBarsDesktop
    );

    if(
      Number.isFinite(override)&&
      override>=24
    ){
      return Math.round(
        clamp(
          override,
          24,
          140
        )
      );
    }

    const minCount=mobile?28:34;

    const maxCount=Math.min(
      len,
      mobile?64:104
    );

    const preferred=mobile?42:68;

    if(maxCount<=minCount){
      return Math.max(
        12,
        maxCount
      );
    }

    const width=Math.max(
      240,
      (this.chartHost?.clientWidth||900)-58
    );

    const paneHeight=
      this.chart?.panes?.()?.[0]?.getHeight?.()||
      this.chartHost?.clientHeight||
      520;

    const top=Number(cs.topMargin??.08);
    const bottom=Number(cs.bottomMargin??.08);

    const usableHeight=Math.max(
      140,
      paneHeight*
      Math.max(
        .48,
        1-top-bottom
      )
    );

    const recent=this.displayBars.slice(
      Math.max(0,len-24),
      len
    );

    const samples=recent
      .map(
        b=>Math.abs(
          Number(b.close)-
          Number(b.open)
        )
      )
      .filter(
        v=>Number.isFinite(v)&&v>0
      )
      .sort(
        (a,b)=>a-b
      );

    const brickSize=samples.length
      ?samples[
        Math.floor(samples.length/2)
      ]
      :null;

    if(
      !Number.isFinite(brickSize)||
      brickSize<=0
    ){
      return preferred;
    }

    let best=preferred;
    let bestScore=Infinity;

    for(
      let count=minCount;
      count<=maxCount;
      count+=2
    ){
      const arr=this.displayBars.slice(
        Math.max(0,len-count),
        len
      );

      if(arr.length<2)continue;

      const lows=arr
        .map(
          b=>Number(
            b.low??
            Math.min(
              b.open,
              b.close
            )
          )
        )
        .filter(Number.isFinite);

      const highs=arr
        .map(
          b=>Number(
            b.high??
            Math.max(
              b.open,
              b.close
            )
          )
        )
        .filter(Number.isFinite);

      if(!lows.length||!highs.length)continue;

      const range=
        Math.max(...highs)-
        Math.min(...lows);

      if(
        !Number.isFinite(range)||
        range<=0
      ){
        continue;
      }

      const future=Math.max(
        4,
        Math.round(count*.10)
      );

      const horizontal=
        width/
        Math.max(
          1,
          count+future
        );

      const vertical=
        usableHeight*
        (brickSize/range);

      if(
        !Number.isFinite(vertical)||
        vertical<=0
      ){
        continue;
      }

      const score=
        Math.abs(
          Math.log(
            horizontal/vertical
          )
        )+
        Math.abs(
          count-preferred
        )/
        preferred*
        .12;

      if(score<bestScore){
        bestScore=score;
        best=count;
      }
    }

    return Math.round(
      clamp(
        best,
        minCount,
        maxCount
      )
    );
  }

  homeBarTarget(){
    const cs=this.app.state.chartSettings||{};
    const mobile=window.innerWidth<=780;

    if(this.isRenkoConstruction()){
      return this.renkoHomeBarTarget();
    }

    return defaultHomeBars({
      period:this.period,
      desktop:cs.homeBarsDesktop,
      mobile:cs.homeBarsMobile,
      isMobile:mobile,
      length:this.currentDataLength()
    });
  }

  homeView({
    fromTransition=false,
    token=this.transitionToken
  }={}){
    const len=this.currentDataLength();

    if(!len)return false;

    const cs=this.app.state.chartSettings||{};
    const renko=this.isRenkoConstruction();

    const bars=Math.max(
      24,
      this.homeBarTarget()
    );

    const offset=renko
      ?Math.max(
        4,
        Math.round(bars*.10)
      )
      :Number(
        cs.rightOffset??16
      );

    const to=(len-1)+offset;

    const from=Math.max(
      -offset,
      to-bars
    );

    this.manualMode=false;
    this.manualRange=null;

    this.clearManualProvider();
    this.updateModeChip();

    this.suppressRangeEvent=true;

    try{
      const scale=this.chart.priceScale('right');

      scale.applyOptions({
        autoScale:true,
        mode:this.priceScaleModeValue(),

        scaleMargins:{
          top:cs.topMargin,
          bottom:cs.bottomMargin
        }
      });

      const ts=this.chart.timeScale();

      ts.applyOptions(
        renko
          ?{
            rightOffset:offset,
            minBarSpacing:1.25
          }
          :{
            rightOffset:offset,
            barSpacing:cs.barSpacing||7,
            minBarSpacing:.45
          }
      );

      ts.setVisibleLogicalRange({
        from,
        to
      });

    }catch{}

    requestAnimationFrame(()=>{
      if(token!==this.transitionToken)return;

      this.suppressRangeEvent=false;

      this.refreshHeader();
      this.renderOverlays();

      this.nativeV27Renderer?.sync?.();
      this.nativeV27Renderer?.render?.();

      this.app.updateQuickTrade?.();
    });

    return true;
  }

  hardHome(){
    const token=++this.transitionToken;

    if(this.transitionFrame)cancelAnimationFrame(this.transitionFrame);
    if(this.transitionSettleFrame)cancelAnimationFrame(this.transitionSettleFrame);

    if(
      !this.series||
      !this.displayBars.length
    ){
      this.loadData({
        home:false
      });
    }

    const ok=this.homeView({
      token
    });

    if(ok){
      toast(
        'Home · chart view refreshed'
      );
    }

    return ok;
  }

  viewAllData(){
    this.suppressRangeEvent=true;

    try{
      this.chart.timeScale().fitContent();
    }catch{}

    requestAnimationFrame(()=>{
      this.suppressRangeEvent=false;
      this.renderOverlays();
      this.nativeV27Renderer?.render?.();
    });
  }

  resetView(){
    return this.hardHome();
  }

  goLive(){
    if(this.replayIndex!=null){
      this.replayFollow=true;
      this.anchorReplayViewport();
      return;
    }

    try{
      this.chart.timeScale().scrollToRealTime();

      this.chart.timeScale().applyOptions({
        rightOffset:
          this.app.state
            .chartSettings
            .rightOffset
      });
    }catch{}

    requestAnimationFrame(()=>{
      this.renderOverlays();
      this.nativeV27Renderer?.render?.();
    });
  }

  setConfig(
    cfg,
    {
      home=true,
      preserveView=false
    }={}
  ){
    const snapshot=preserveView
      ?this.captureTransitionView()
      :null;

    if(cfg.symbol){
      this.symbol=cfg.symbol;
    }

    if(cfg.period?.mode){
      this.period=structuredClone(cfg.period);

      if(this.period.mode==='time'){
        this.timeframe=this.period.value;
      }
    }

    if(cfg.timeframe&&!cfg.period){
      this.timeframe=cfg.timeframe;

      this.period={
        mode:'time',
        value:cfg.timeframe
      };
    }

    if(cfg.chartType){
      this.chartType=cfg.chartType;
    }

    this.replayIndex=null;

    this.loadData({
      home:false
    });

    this.scheduleTransitionView(
      snapshot,
      {
        home,
        preserveView
      }
    );
  }

  loadData({home=true}={}){
    const plan=historyPlanForPeriod(this.period);

    this.rawBars=generateBars(
      this.symbol,
      plan.baseTimeframe,
      plan.count
    );

    this.periodBars=buildPeriodBars(
      this.rawBars,
      this.symbol,
      this.period,
      this.app.state.periodSettings
    );

    const cfg=SYMBOLS[this.symbol];

    const last=
      this.periodBars.at(-1)?.close||
      cfg.base;

    this.displayBars=
      this.chartType==='Heikin-Ashi'
        ?heikinAshi(this.periodBars)
        :buildDisplayBars(
          this.periodBars,
          this.chartType,
          {
            renkoSize:last*.0005,
            rangeSize:last*.0008
          }
        );

    this.barIndex=new Map(
      this.displayBars.map(
        (b,i)=>[
          Number(b.time),
          i
        ]
      )
    );

    /*
     * Keep exact compact form for current SUPER-JESUS tests.
     */
    this.rebuildSeries({preserveVisibleRange:false});

    this.setAutoMode(false);
    this.refreshHeader();
    this.renderOverlays();

    if(home){
      this.scheduleTransitionView(
        null,
        {
          home:true,
          preserveView:false
        }
      );
    }
  }

  marketStyle(key){
    const defaults={
      last:{
        color:'#00c7b1',
        width:1,
        style:'solid'
      },

      bid:{
        color:'#f59e0b',
        width:1,
        style:'solid'
      },

      ask:{
        color:'#22c55e',
        width:1,
        style:'solid'
      }
    };

    const all=
      this.app.state.marketLineStyles||
      {};

    return{
      ...defaults[key],
      ...(all[key]||{})
    };
  }

  lineStyleValue(style){
    const L=NativeSeries;

    return style==='dashed'
      ?(L.LineStyle?.Dashed??2)
      :style==='dotted'
        ?(L.LineStyle?.Dotted??1)
        :(L.LineStyle?.Solid??0);
  }

  /*
   * Keep exact compact signature for current transition tests.
   */
  rebuildSeries({preserveVisibleRange=true}={}){
    const L=NativeSeries;
    const s=this.app.state;
    const cfg=SYMBOLS[this.symbol];

    const visibleRange=
      preserveVisibleRange
        ?this.chart
          ?.timeScale()
          .getVisibleLogicalRange?.()
        :null;

    if(this.series){
      try{
        this.chart.removeSeries(this.series);
      }catch{}

      this.series=null;
    }

    this.indicatorSeries.forEach(x=>{
      try{
        this.chart.removeSeries(x.series);
      }catch{}
    });

    this.indicatorSeries=[];

    const priceFormat={
      type:'price',
      precision:cfg.precision,
      minMove:cfg.minMove
    };

    const candle=s.candleStyle||{};
    const lastStyle=this.marketStyle('last');

    const lastPriceOptions={
      lastValueVisible:
        s.showLastPriceLabel!==false,

      priceLineVisible:
        s.showLastPriceLine!==false,

      priceLineColor:lastStyle.color,

      priceLineWidth:
        lastStyle.width||1,

      priceLineStyle:
        this.lineStyleValue(lastStyle.style),

      showCountdown:
        s.showCountdown!==false&&
        this.period?.mode==='time'
    };

    if(this.chartType==='Line'){
      this.series=this.chart.addSeries(
        L.LineSeries,
        {
          color:candle.upBody||s.upColor,
          lineWidth:2,
          priceFormat,
          constructionMode:this.period?.mode||'time',
          ...lastPriceOptions
        },
        0
      );

    }else if(this.chartType==='Area'){
      this.series=this.chart.addSeries(
        L.AreaSeries,
        {
          lineColor:candle.upBody||s.upColor,
          topColor:'rgba(0,199,177,.28)',
          bottomColor:'rgba(0,199,177,.02)',
          lineWidth:2,
          priceFormat,
          constructionMode:this.period?.mode||'time',
          ...lastPriceOptions
        },
        0
      );

    }else if(
      this.chartType==='Bars'&&
      L.BarSeries
    ){
      this.series=this.chart.addSeries(
        L.BarSeries,
        {
          upColor:candle.upBody||s.upColor,
          downColor:candle.downBody||s.downColor,
          thinBars:false,
          priceFormat,
          constructionMode:this.period?.mode||'time',
          ...lastPriceOptions
        },
        0
      );

    }else{
      this.series=this.chart.addSeries(
        L.CandlestickSeries,
        {
          upColor:candle.upBody||s.upColor,
          downColor:candle.downBody||s.downColor,

          borderVisible:
            candle.borderVisible!==false,

          borderUpColor:
            candle.upBorder||
            candle.upBody||
            s.upColor,

          borderDownColor:
            candle.downBorder||
            candle.downBody||
            s.downColor,

          wickVisible:
            candle.wickVisible!==false,

          wickUpColor:
            candle.upWick||
            s.wickUp,

          wickDownColor:
            candle.downWick||
            s.wickDown,

          priceFormat,

          constructionMode:
            this.period?.mode||
            'time',

          ...lastPriceOptions
        },
        0
      );
    }

    this.applyMainSeriesData();
    this.renderMarketPriceLines();

    this.oscillatorPanes=[];

    this.chart.clearPaneOptions?.();

    let nextOscillatorPane=1;

    for(
      const ind
      of s.indicators.filter(i=>i.visible!==false)
    ){
      const computed=computeIndicator(
        ind,
        this.displayBars
      );

      const isOscillator=
        computed.pane==='oscillator';

      const paneIndex=
        isOscillator
          ?nextOscillatorPane++
          :0;

      if(isOscillator){
        this.oscillatorPanes.push({
          id:ind.id,
          cfg:ind,
          paneIndex
        });

        this.chart.setPaneOptions?.(
          paneIndex,
          {
            range:computed.range||null,

            guides:
              Array.isArray(ind.levels)
                ?ind.levels
                :(computed.guides||[]),

            title:
              ind.name||
              computed.kind?.toUpperCase?.()||
              'Indicator',

            precision:2,

            guideColor:
              'rgba(148,163,184,.50)'
          }
        );
      }

      for(const part of computed.series){
        let series;

        if(
          part.type==='histogram'&&
          L.HistogramSeries
        ){
          series=this.chart.addSeries(
            L.HistogramSeries,
            {
              color:part.color||ind.color,
              opacity:ind.opacity??1,

              lineStyle:
                this.lineStyleValue(
                  ind.lineStyle
                ),

              priceLineVisible:false,
              lastValueVisible:false,

              priceScaleId:
                paneIndex===0
                  ?'right'
                  :''
            },
            paneIndex
          );

        }else{
          series=this.chart.addSeries(
            L.LineSeries,
            {
              color:part.color||ind.color,

              lineWidth:
                ind.lineWidth||1.5,

              lineStyle:
                this.lineStyleValue(
                  ind.lineStyle
                ),

              opacity:ind.opacity??1,

              priceLineVisible:false,
              lastValueVisible:false,
              crosshairMarkerVisible:false,

              priceScaleId:
                paneIndex===0
                  ?'right'
                  :''
            },
            paneIndex
          );
        }

        const data=valuesToData(
          this.displayBars,
          part.values,
          this.replayIndex
        );

        series.setData(data);

        this.indicatorSeries.push({
          cfg:ind,
          part,
          series,
          values:part.values,
          paneIndex
        });
      }
    }

    if(this.oscillatorPanes.length){
      requestAnimationFrame(
        ()=>this.applyOscillatorPaneHeights()
      );
    }

    this.chart.applyOptions({
      layout:{
        background:{
          type:'solid',
          color:s.background
        },
        textColor:s.textColor
      },

      grid:{
        vertLines:{
          visible:s.gridV,
          color:s.gridColor
        },

        horzLines:{
          visible:s.gridH,
          color:s.gridColor
        }
      },

      majorRoundGrid:!!s.majorRoundGrid,
      roundGridColor:'rgba(126,157,185,.22)',
      roundNumberColor:s.textColor,
      timezone:s.timezone||'UTC+1 Lagos',
      sessionSeparators:!!s.showSessionSeparators,
      showCrosshairLabels:s.showCrosshairLabels!==false,

      rightPriceScale:{
        scaleMargins:{
          top:s.chartSettings.topMargin,
          bottom:s.chartSettings.bottomMargin
        },

        mode:this.priceScaleModeValue()
      }
    });

    if(
      visibleRange&&
      !this.replayIndex
    ){
      try{
        this.chart
          .timeScale()
          .setVisibleLogicalRange(
            visibleRange
          );
      }catch{}
    }
  }

  mainSeriesData(maxIndex=this.replayIndex){
    const end=maxIndex==null
      ?this.displayBars.length
      :Math.min(
        this.displayBars.length,
        maxIndex+1
      );

    const bars=this.displayBars.slice(
      0,
      end
    );

    if(
      this.chartType==='Line'||
      this.chartType==='Area'
    ){
      return bars.map(b=>({
        time:b.time,
        value:b.close
      }));
    }

    return bars;
  }

  applyMainSeriesData(){
    try{
      this.series?.setData(
        this.mainSeriesData()
      );

    }catch(e){
      console.error(
        'Trade Avata main series data error',
        e
      );
    }
  }

  setReplayIndex(index,{anchor=true}={}){
    this.replayIndex=clamp(
      Math.round(index),
      20,
      Math.max(
        20,
        this.displayBars.length-1
      )
    );

    this.applyMainSeriesData();

    for(const x of this.indicatorSeries){
      x.series.setData(
        valuesToData(
          this.displayBars,
          x.values,
          this.replayIndex
        )
      );
    }

    this.refreshHeader();
    this.renderOverlays();

    if(anchor){
      this.anchorReplayViewport();
    }
  }

  clearReplay(){
    this.replayIndex=null;

    this.applyMainSeriesData();

    for(const x of this.indicatorSeries){
      x.series.setData(
        valuesToData(
          this.displayBars,
          x.values,
          null
        )
      );
    }

    this.refreshHeader();
    this.homeView();
  }

  anchorReplayViewport(){
    if(this.replayIndex==null)return;

    const visible=Math.max(
      24,
      this.homeBarTarget()
    );

    const renko=this.isRenkoConstruction();

    /*
     * Replay keeps the same readable Renko geometry.
     */
    const future=Math.round(
      visible*(renko?.18:.34)
    );

    const to=this.replayIndex+future;
    const from=to-visible;

    this.suppressRangeEvent=true;

    try{
      this.chart.timeScale().setVisibleLogicalRange({
        from,
        to
      });
    }catch{}

    requestAnimationFrame(()=>{
      this.suppressRangeEvent=false;
      this.renderOverlays();
    });
  }

  renderMarketPriceLines(){
    if(!this.series?.createPriceLine)return;

    const s=this.app.state;

    const last=
      this.displayBars[
        this.currentDataLength()-1
      ]?.close;

    if(!Number.isFinite(last))return;

    const cfg=
      SYMBOLS[this.symbol]||
      SYMBOLS.XAUUSD;

    const spread=Math.max(
      cfg.minMove*2,
      last*.00002
    );

    try{
      if(s.showBidLine){
        const st=this.marketStyle('bid');

        this.series.createPriceLine({
          price:last-spread/2,
          color:st.color,
          lineWidth:st.width||1,
          lineStyle:this.lineStyleValue(st.style),
          axisLabelVisible:s.showBidLabel!==false,
          title:'Bid'
        });
      }

      if(s.showAskLine){
        const st=this.marketStyle('ask');

        this.series.createPriceLine({
          price:last+spread/2,
          color:st.color,
          lineWidth:st.width||1,
          lineStyle:this.lineStyleValue(st.style),
          axisLabelVisible:s.showAskLabel!==false,
          title:'Ask'
        });
      }

    }catch{}
  }

  updateCountdown(){
    const box=this.root.querySelector('.bar-countdown');

    if(box)box.style.display='none';

    const s=this.app.state;
    const timeBased=this.period.mode==='time';

    if(!this.series)return;

    if(
      !s.showCountdown||
      !timeBased
    ){
      try{
        this.series.applyOptions({
          showCountdown:false,
          countdownText:''
        });
      }catch{}

      return;
    }

    const sec=Math.max(
      1,
      timeframeSeconds(
        this.period.value
      )
    );

    const clockOffset=Number(
      s.connection?.serverTimeOffsetMs||0
    );

    const now=Math.floor(
      (Date.now()+clockOffset)/1000
    );

    const left=sec-(now%sec);
    const h=Math.floor(left/3600);
    const m=Math.floor((left%3600)/60);
    const ss=left%60;

    const text=h
      ?`${h}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
      :`${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;

    try{
      this.series.applyOptions({
        showCountdown:true,
        countdownText:text
      });
    }catch{}
  }

  refreshAppearance({preserveView=true}={}){
    const range=preserveView
      ?this.chart
        ?.timeScale()
        .getVisibleLogicalRange?.()
      :null;

    this.rebuildSeries();

    if(range){
      try{
        this.chart
          .timeScale()
          .setVisibleLogicalRange(
            range
          );

      }catch{}

    }else{
      this.homeView();
    }

    this.refreshHeader();
    this.renderOverlays();
    this.updateCursorMode();
  }

  refreshHeader(){
    const s=this.app.state;

    const index=
      this.replayIndex==null
        ?this.displayBars.length-1
        :this.replayIndex;

    const last=this.displayBars[index];

    const overlay=
      this.root.querySelector(
        '.pane-symbol-overlay strong'
      );

    overlay.textContent=
      `${this.symbol} · ${periodLabel(this.period)}${this.chartType==='Candles'?'':` · ${this.chartType}`}`;

    this.root
      .querySelector('.pane-ohlc')
      .textContent=
      last&&s.showOHLC
        ?`O ${formatPrice(this.symbol,last.open)}  H ${formatPrice(this.symbol,last.high)}  L ${formatPrice(this.symbol,last.low)}  C ${formatPrice(this.symbol,last.close)}`
        :'';

    this.root
      .querySelector('.pane-overlay-head')
      .style.display=
      s.showSymbolOverlay||
      s.showOHLC||
      s.showIndicatorOverlay
        ?'flex'
        :'none';

    this.root
      .querySelector('.pane-latency')
      .style.display=
      s.showLatency
        ?'flex'
        :'none';

    const legend=this.root.querySelector('.indicator-legend');

    legend.innerHTML='';

    if(s.showIndicatorOverlay){
      for(const ind of s.indicators){
        const hidden=ind.visible===false;

        const seriesMeta=
          this.indicatorSeries.find(
            x=>x.cfg.id===ind.id
          );

        const val=seriesMeta?.values?.[index];

        const item=el(
          'div',
          {
            class:`legend-item ${hidden?'hidden':''}`,
            'data-indicator':ind.id,

            title:hidden
              ?`Show ${ind.name}`
              :`${ind.name} · eye hides indicator · double-click name for settings`
          }
        );

        const eye=el(
          'button',
          {
            class:'legend-eye',

            'aria-label':hidden
              ?`Show ${ind.name}`
              :`Hide ${ind.name}`,

            title:hidden
              ?`Show ${ind.name}`
              :`Hide ${ind.name}`
          }
        );

        eye.innerHTML=
          hidden
            ?' <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A10.8 10.8 0 0112 4c5.5 0 9.5 5.2 9.5 5.2a15.7 15.7 0 01-3.1 3.7M6.2 6.2C3.9 7.7 2.5 9.2 2.5 9.2S6.5 14.4 12 14.4c1.1 0 2.1-.2 3-.5"/></svg>'
            :' <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6.2 6.5 12 6.5 21.5 12 21.5 12 17.8 17.5 12 17.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/></svg>';

        eye.addEventListener('click',e=>{
          e.stopPropagation();

          this.app.toggleIndicatorVisibility?.(
            ind.id
          );
        });

        const label=el(
          'button',
          {
            class:'legend-label',
            title:`Double-click to edit ${ind.name}`
          },

          el(
            'i',
            {
              style:`background:${ind.color}`
            }
          ),

          el(
            'strong',
            {
              style:`color:${hidden?'#8194a5':ind.color}`
            },

            `${ind.name}${!hidden&&val!=null?` ${Number(val).toFixed(2)}`:''}`
          )
        );

        label.addEventListener(
          'click',
          e=>e.stopPropagation()
        );

        label.addEventListener('dblclick',e=>{
          e.stopPropagation();

          this.app.openIndicatorSettings(
            ind.id
          );
        });

        item.append(
          eye,
          label
        );

        legend.append(item);
      }
    }
  }

  updateCrosshairReadout(param){
    if(!param?.time||!param.seriesData)return;

    const d=param.seriesData.get(this.series);

    if(!d)return;

    const ohlc=this.root.querySelector('.pane-ohlc');

    if('open'in d){
      ohlc.textContent=
        `O ${formatPrice(this.symbol,d.open)}  H ${formatPrice(this.symbol,d.high)}  L ${formatPrice(this.symbol,d.low)}  C ${formatPrice(this.symbol,d.close)}`;

    }else if('value'in d){
      ohlc.textContent=
        `C ${formatPrice(this.symbol,d.value)}`;
    }
  }

  updateDataWindow(param){
    const box=this.root.querySelector('.data-window-card');

    if(
      !this.app.state.showDataWindow||
      !param?.time||
      !param.seriesData
    ){
      box.classList.remove('show');
      return;
    }

    const d=param.seriesData.get(this.series);

    if(!d){
      box.classList.remove('show');
      return;
    }

    const logical=
      this.chart
        .timeScale()
        .coordinateToLogical(
          param.point?.x??0
        );

    const idx=clamp(
      Math.round(logical??0),
      0,
      this.displayBars.length-1
    );

    const bar=this.displayBars[idx];

    if(!bar)return;

    const rows=[
      `<b>${this.symbol} · ${periodLabel(this.period)}</b>`,
      `Time ${new Date(Number(bar.time)*1000).toLocaleString()}`,
      `O ${formatPrice(this.symbol,bar.open)} · H ${formatPrice(this.symbol,bar.high)}`,
      `L ${formatPrice(this.symbol,bar.low)} · C ${formatPrice(this.symbol,bar.close)}`,
      `Vol ${Math.round(bar.volume||0).toLocaleString()}`
    ];

    const seen=new Set();

    for(const x of this.indicatorSeries){
      if(seen.has(x.cfg.id))continue;

      seen.add(x.cfg.id);

      const v=x.values[idx];

      if(v!=null){
        rows.push(
          `${x.cfg.name}: ${Number(v).toFixed(3)}`
        );
      }
    }

    box.innerHTML=
      rows
        .map(
          (x,i)=>
            i
              ?`<span>${x}</span>`
              :x
        )
        .join('');

    box.classList.add('show');
  }

  updateCursorMode(){
    if(!this.chart)return;

    const L=NativeSeries;

    const cross=
      this.app.state.activeTool==='crosshair';

    try{
      this.chart.applyOptions({
        crosshair:{
          mode:cross
            ?(L.CrosshairMode?.MagnetOHLC??1)
            :(L.CrosshairMode?.Normal??0),

          vertLine:{
            visible:cross,
            color:this.app.state.crosshairColor
          },

          horzLine:{
            visible:cross,
            color:this.app.state.crosshairColor
          }
        }
      });

    }catch{}

    if(this.drawingLayer){
      this.drawingLayer.syncPointerMode();
    }
  }

  resize(){
    if(!this.chart)return;

    const r=this.root.getBoundingClientRect();

    if(r.width<10||r.height<10)return;

    this.drawingLayer?.resize();
    this.resizeRoundGrid();
    this.renderOverlays();
  }

  resizeRoundGrid(){
    const c=this.roundGridCanvas;
    const r=c.getBoundingClientRect();

    const dpr=Math.max(
      1,
      devicePixelRatio||1
    );

    c.width=Math.max(
      1,
      Math.floor(r.width*dpr)
    );

    c.height=Math.max(
      1,
      Math.floor(r.height*dpr)
    );

    const ctx=c.getContext('2d');

    ctx.setTransform(
      dpr,
      0,
      0,
      dpr,
      0,
      0
    );
  }

  renderRoundGrid(){
    const c=this.roundGridCanvas;
    const ctx=c?.getContext?.('2d');

    if(ctx){
      ctx.clearRect(
        0,
        0,
        c.clientWidth||0,
        c.clientHeight||0
      );
    }

    /*
     * Major round-number grid is rendered by Native chart.
     */
  }

  visiblePriceRange(){
    const vr=
      this.chart
        .timeScale()
        .getVisibleLogicalRange?.();

    let start=0;
    let end=this.currentDataLength();

    if(vr&&this.displayBars.length){
      start=clamp(
        Math.floor(vr.from),
        0,
        this.displayBars.length-1
      );

      end=clamp(
        Math.ceil(vr.to)+1,
        start+1,
        this.currentDataLength()
      );
    }

    const arr=this.displayBars.slice(
      start,
      end
    );

    if(!arr.length)return null;

    const lows=arr.map(
      b=>b.low??b.value
    );

    const highs=arr.map(
      b=>b.high??b.value
    );

    return{
      min:Math.min(...lows),
      max:Math.max(...highs)
    };
  }

  renderSignals(){
    const sell=this.root.querySelector('.signal-sell');
    const buy=this.root.querySelector('.signal-buy');
    const n=this.currentDataLength();

    if(n<100){
      if(sell)sell.style.display='none';
      if(buy)buy.style.display='none';
      return;
    }

    const a=this.displayBars[n-95];
    const b=this.displayBars[n-70];

    if(sell){
      positionBadge(
        sell,
        this.xForTime(a.time),
        this.yForPrice(a.high),
        -36
      );
    }

    if(buy){
      positionBadge(
        buy,
        this.xForTime(b.time),
        this.yForPrice(b.low),
        14
      );
    }
  }

  renderOverlays(){
    this.drawingLayer?.render();
    this.renderRoundGrid();
  }

  // ===== Logical / future-space helpers =====

  logicalAtCoordinate(x){
    return(
      this.chart
        ?.timeScale()
        .coordinateToLogical(x)??
      0
    );
  }

  logicalToCoordinate(logical){
    return(
      this.chart
        ?.timeScale()
        .logicalToCoordinate?.(logical)??
      null
    );
  }

  timeAtCoordinate(x){
    return this.projectedTimeForLogical(
      this.logicalAtCoordinate(x)
    );
  }

  projectedTimeForLogical(logical){
    if(!this.displayBars.length)return null;

    const i=Math.round(logical);

    if(
      i>=0&&
      i<this.displayBars.length
    ){
      return Number(
        this.displayBars[i].time
      );
    }

    const last=this.displayBars.at(-1);
    const first=this.displayBars[0];
    const step=this.projectedBarSeconds();

    if(i>=this.displayBars.length){
      return(
        Number(last.time)+
        (
          i-
          (this.displayBars.length-1)
        )*
        step
      );
    }

    return(
      Number(first.time)+
      i*step
    );
  }

  projectedBarSeconds(){
    if(this.period.mode==='time'){
      return Math.max(
        1,
        timeframeSeconds(this.period.value)
      );
    }

    if(this.period.mode==='renko-time'){
      return Math.max(
        1,
        timeframeSeconds(this.period.value)
      );
    }

    return 1;
  }

  priceAtCoordinate(y){
    return(
      this.series?.coordinateToPrice(y)??
      null
    );
  }

  xForTime(time){
    return(
      this.chart
        ?.timeScale()
        .timeToCoordinate(time)??
      null
    );
  }

  xForPoint(point){
    if(Number.isFinite(point?.logical)){
      const x=this.logicalToCoordinate(
        point.logical
      );

      if(x!=null)return x;
    }

    return point?.time!=null
      ?this.xForTime(point.time)
      :null;
  }

  yForPrice(price){
    return(
      this.series?.priceToCoordinate(price)??
      null
    );
  }

  pointAtCoordinate(x,y){
    const logical=this.logicalAtCoordinate(x);
    const price=this.priceAtCoordinate(y);

    if(logical==null||price==null){
      return null;
    }

    return{
      x,
      y,
      logical,

      time:
        this.projectedTimeForLogical(
          logical
        ),

      price
    };
  }

  nearestBar(time){
    if(!this.displayBars.length)return null;

    let idx=this.barIndex.get(
      Number(time)
    );

    if(idx==null){
      idx=this.displayBars.findIndex(
        b=>
          Number(b.time)>=
          Number(time)
      );

      if(idx<0){
        idx=this.displayBars.length-1;
      }
    }

    return this.displayBars[idx];
  }

  nearestBarByLogical(logical){
    if(!this.displayBars.length)return null;

    return this.displayBars[
      clamp(
        Math.round(logical),
        0,
        this.displayBars.length-1
      )
    ];
  }

  shiftPoint(point,deltaLogical){
    const logical=
      Number.isFinite(point.logical)
        ?point.logical
        :this.logicalForTime(point.time);

    const next=
      logical+
      deltaLogical;

    return{
      ...point,
      logical:next,

      time:
        this.projectedTimeForLogical(
          next
        )
    };
  }

  logicalForTime(time){
    const idx=this.barIndex.get(
      Number(time)
    );

    if(idx!=null)return idx;

    const i=this.displayBars.findIndex(
      b=>
        Number(b.time)>=
        Number(time)
    );

    return i>=0
      ?i
      :this.displayBars.length-1;
  }

  shiftTime(time,deltaLogical){
    return this.projectedTimeForLogical(
      this.logicalForTime(time)+
      deltaLogical
    );
  }

  screenshot({
    metadata=true,
    drawings=true
  }={}){
    try{
      const base=this.chart.takeScreenshot();

      if(!metadata&&!drawings){
        return base;
      }

      const out=document.createElement('canvas');

      out.width=base.width;
      out.height=base.height;

      const ctx=out.getContext('2d');

      ctx.drawImage(
        base,
        0,
        0
      );

      if(drawings&&this.overlayCanvas){
        ctx.drawImage(
          this.overlayCanvas,
          0,
          0,
          this.overlayCanvas.width,
          this.overlayCanvas.height,
          0,
          0,
          out.width,
          out.height
        );
      }

      if(metadata){
        const ratio=
          out.width/
          Math.max(
            1,
            this.chartHost.clientWidth
          );

        const pad=10*ratio;

        ctx.save();

        ctx.fillStyle='rgba(5,12,20,.82)';

        ctx.fillRect(
          0,
          0,
          out.width,
          34*ratio
        );

        ctx.fillStyle='#e7f0f8';

        ctx.font=
          `${12*ratio}px Inter,system-ui,sans-serif`;

        const cfg=
          `${this.symbol} · ${periodLabel(this.period)} · ${this.chartType}`;

        ctx.fillText(
          cfg,
          pad,
          21*ratio
        );

        const inds=
          this.app.state.indicators
            .filter(
              i=>i.visible!==false
            )
            .map(
              i=>i.name
            )
            .slice(
              0,
              4
            )
            .join(' · ');

        if(inds){
          ctx.fillStyle='#9db4cc';

          ctx.font=
            `${9*ratio}px Inter,system-ui,sans-serif`;

          ctx.fillText(
            inds,
            Math.min(
              out.width*.45,

              pad+
              ctx.measureText(cfg).width+
              16*ratio
            ),
            21*ratio
          );
        }

        ctx.fillStyle='rgba(5,12,20,.78)';

        ctx.fillRect(
          0,
          out.height-26*ratio,
          out.width,
          26*ratio
        );

        ctx.fillStyle='#9db4cc';

        ctx.font=
          `${9*ratio}px Inter,system-ui,sans-serif`;

        ctx.fillText(
          `Trade Avata · Trade Simple · ${this.symbol} · ${new Date().toLocaleString()} · ${Intl.DateTimeFormat().resolvedOptions().timeZone||'Local'}`,
          pad,
          out.height-9*ratio
        );

        ctx.restore();
      }

      return out;

    }catch{
      return null;
    }
  }

  destroy(){
    this.resizeObserver?.disconnect();

    clearInterval(
      this.countdownTimer
    );

    this.drawingLayer?.destroy?.();

    try{
      this.chart?.remove();
    }catch{}

    this.chart=null;
  }
}

function positionBadge(node,x,y,offset){
  if(x==null||y==null){
    node.style.display='none';
    return;
  }

  node.style.display='block';

  node.style.transform=
    `translate(${Math.round(x-28)}px,${Math.round(y+offset)}px)`;
}
