import { uid, clamp, el } from './utils.js';
import { SYMBOLS, formatPrice, periodKey } from './data.js';

const TWO_POINT=new Set(['trend','ray','rectangle','fibonacci','arrow','channel','measure']);
const ONE_POINT=new Set(['horizontal','vertical','text','crossline']);
const POSITION=new Set(['long','short']);
const FREEHAND=new Set(['brush','highlighter']);

const DEFAULT_FIB_LEVELS=[
  {value:0,visible:true,color:'#16b8ce'},
  {value:.236,visible:false,color:'#b23842'},
  {value:.382,visible:true,color:'#263447'},
  {value:.5,visible:true,color:'#111111'},
  {value:.618,visible:true,color:'#ff3347'},
  {value:.786,visible:true,color:'#111111'},
  {value:1,visible:true,color:'#4ac7d7'},
  {value:1.618,visible:false,color:'#3156a8'},
  {value:-.27,visible:true,color:'#ff9800'},
  {value:-.618,visible:true,color:'#9c27b0'}
];

export class DrawingLayer{
  constructor(pane,canvas,getState,onChange){
    this.pane=pane;this.canvas=canvas;this.ctx=canvas.getContext('2d');this.getState=getState;this.onChange=onChange;
    this.dpr=Math.max(1,window.devicePixelRatio||1);this.draft=null;this.drag=null;this.freehand=null;this.hoveredDrawingId=null;
    this.toolbar=this.createFloatingToolbar();
    this.boundEscape=e=>{if(e.key==='Escape'){this.cancelDraft();this.pane.app?.setTool('cursor');this.clearSelection();}};
    this.resize();
    canvas.addEventListener('pointerdown',e=>this.pointerDown(e));
    canvas.addEventListener('pointermove',e=>this.pointerMove(e));
    canvas.addEventListener('pointerup',e=>this.pointerUp(e));
    canvas.addEventListener('pointercancel',e=>this.pointerUp(e));
    pane.root.addEventListener('pointerdown',e=>this.rootPointerDown(e),true);
    pane.root.addEventListener('pointermove',e=>this.rootPointerMove(e),true);
    pane.root.addEventListener('pointerleave',()=>this.rootPointerLeave(),true);
    pane.root.addEventListener('pointerup',e=>this.rootPointerUp(e),true);
    pane.root.addEventListener('dblclick',e=>this.rootDoubleClick(e),true);
    window.addEventListener('keydown',this.boundEscape);
  }

  destroy(){window.removeEventListener('keydown',this.boundEscape);this.toolbar?.remove();}

  createFloatingToolbar(){
    const bar=el('div',{class:'object-floating-toolbar'});
    const add=(label,title,action,cls='')=>bar.append(el('button',{class:cls,title,onclick:e=>{e.stopPropagation();action();}},label));
    add('◫','Duplicate drawing',()=>this.pane.app?.duplicateSelectedDrawing?.());
    add('●','Drawing color',()=>this.pane.app?.openQuickDrawingColor?.());
    add('⚙','Drawing settings',()=>this.openSelectedSettings());
    add('↗','Share selected drawing / trade',()=>this.pane.app?.shareSelectedDrawing?.());
    add('⌑','Lock / unlock',()=>this.pane.app?.toggleSelectedDrawingLock?.());
    add('⌫','Delete selected drawing',()=>this.pane.app?.deleteSelectedDrawings?.(),'dangerish');
    add('•••','More drawing actions',()=>this.pane.app?.openSelectedDrawingMore?.(bar));
    this.pane.root.append(bar);return bar;
  }

  openSelectedSettings(){const id=this.getState().selectedDrawingId;if(id)this.pane.app?.openDrawingSettings?.(id);}
  clearSelection(){const s=this.getState();s.selectedDrawingId=null;s.selectedDrawingIds=[];this.hideToolbar();this.render();}

  resize(){
    const r=this.canvas.getBoundingClientRect();this.dpr=Math.max(1,window.devicePixelRatio||1);
    this.canvas.width=Math.max(1,Math.floor(r.width*this.dpr));this.canvas.height=Math.max(1,Math.floor(r.height*this.dpr));
    this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.render();
  }

  syncPointerMode(){
    const s=this.getState();const drawing=s.activeTool&&!['cursor','crosshair','magnet','lock','hide','more-draw'].includes(s.activeTool);
    this.canvas.style.pointerEvents=drawing?'auto':'none';this.canvas.style.cursor=drawing?'crosshair':'default';
    if(drawing)this.hideToolbar();
  }

  stateDrawings(){return this.getState().drawings||[];}
  localDrawings(){return this.stateDrawings().filter(d=>(d.paneId===this.pane.id||d.syncAll)&&this.isVisibleOnCurrentPeriod(d));}
  isVisibleOnCurrentPeriod(d){
    const v=d.visibility;if(!v||v.all!==false)return true;
    const key=periodKey(this.pane.period);if(Array.isArray(v.periods)&&v.periods.includes(key))return true;
    if(this.pane.period.mode==='time'&&Array.isArray(v.timeframes)&&v.timeframes.includes(this.pane.period.value))return true;
    return false;
  }

  pointFromEvent(e){const r=this.canvas.getBoundingClientRect();return this.pane.pointAtCoordinate(e.clientX-r.left,e.clientY-r.top);}
  pointFromRootEvent(e){const r=this.pane.root.getBoundingClientRect();return this.pane.pointAtCoordinate(e.clientX-r.left,e.clientY-r.top);}
  screenPoint(p){const x=this.pane.xForPoint(p),y=this.pane.yForPrice(p.price);if(x==null||y==null)return null;return{x,y};}

  rootPointerDown(e){
    if(e.target.closest?.('.object-floating-toolbar'))return;
    const s=this.getState();if(!['cursor','crosshair'].includes(s.activeTool)||this.pane.replaySelecting)return;
    const p=this.pointFromRootEvent(e);if(!p)return;const hit=this.findHit(p.x,p.y);
    if(!hit){this.clearSelection();return;}
    const d=this.stateDrawings().find(x=>x.id===hit.id);if(!d)return;
    if(e.shiftKey){const ids=new Set(s.selectedDrawingIds||[]);ids.has(d.id)?ids.delete(d.id):ids.add(d.id);s.selectedDrawingIds=[...ids];s.selectedDrawingId=d.id;}else{s.selectedDrawingId=d.id;s.selectedDrawingIds=[d.id];}
    this.render();this.updateFloatingToolbar();this.pane.app?.renderRightPanel?.();
    if(d.locked)return;
    e.preventDefault();e.stopPropagation();
    this.drag={id:d.id,handle:hit.hit.handle,start:p,original:JSON.parse(JSON.stringify(d.points)),fromRoot:true,changed:false};
  }

  rootPointerMove(e){
    if(e.target.closest?.('.object-floating-toolbar'))return;
    if(this.drag?.fromRoot){const p=this.pointFromRootEvent(e);if(!p)return;e.preventDefault();e.stopPropagation();this.updateDrag(p);return;}
    const s=this.getState();if(!['cursor','crosshair'].includes(s.activeTool))return;
    const p=this.pointFromRootEvent(e);if(!p)return;const hit=this.findHit(p.x,p.y),next=hit?.id||null;if(next!==this.hoveredDrawingId){this.hoveredDrawingId=next;this.render();this.updateFloatingToolbar();}
  }
  rootPointerLeave(){if(this.drag)return;if(this.hoveredDrawingId){this.hoveredDrawingId=null;this.render();this.updateFloatingToolbar();}}
  rootPointerUp(e){if(!this.drag?.fromRoot)return;e.preventDefault();e.stopPropagation();if(this.drag.changed)this.onChange({type:'commit-drag',id:this.drag.id,before:this.drag.original});this.drag=null;this.updateFloatingToolbar();}
  rootDoubleClick(e){
    if(e.target.closest?.('.object-floating-toolbar'))return;const s=this.getState();if(!['cursor','crosshair'].includes(s.activeTool))return;
    const p=this.pointFromRootEvent(e);if(!p)return;const hit=this.findHit(p.x,p.y);if(!hit)return;
    e.preventDefault();e.stopPropagation();s.selectedDrawingId=hit.id;s.selectedDrawingIds=[hit.id];this.render();this.updateFloatingToolbar();this.pane.app?.openDrawingSettings?.(hit.id);
  }

  pointerDown(e){
    const s=this.getState(),p=this.pointFromEvent(e);if(!p)return;const tool=s.activeTool;
    if(!tool||['cursor','crosshair'].includes(tool))return;
    // There is deliberately no click-to-delete drawing mode. Deletion requires
    // a selected object + explicit Delete/Backspace/trash action.
    if(FREEHAND.has(tool)){this.freehand=this.makeDrawing(tool,[p]);this.canvas.setPointerCapture?.(e.pointerId);this.render();return;}
    if(ONE_POINT.has(tool)){const d=this.makeDrawing(tool,[this.snapPoint(p)]);this.onChange({type:'add',drawing:d});this.afterComplete();return;}
    if(TWO_POINT.has(tool)||POSITION.has(tool)){
      if(!this.draft){const q=this.snapPoint(p);this.draft=this.makeDrawing(tool,[q,q]);this.canvas.setPointerCapture?.(e.pointerId);}
      else{this.draft.points[1]=this.snapPoint(p);if(POSITION.has(tool))this.expandPosition(this.draft);this.onChange({type:'add',drawing:this.draft});this.draft=null;this.afterComplete();}
      this.render();
    }
  }
  pointerMove(e){
    const p=this.pointFromEvent(e);if(!p)return;
    if(this.drag){this.updateDrag(p);return;}
    if(this.freehand){const q=this.snapPoint(p),last=this.freehand.points.at(-1),sp=this.screenPoint(last);if(!sp||Math.hypot(sp.x-p.x,sp.y-p.y)>3)this.freehand.points.push(q);this.render();return;}
    if(this.draft){this.draft.points[1]=this.snapPoint(p);if(POSITION.has(this.draft.type))this.expandPosition(this.draft);this.render();}
  }
  pointerUp(){if(this.drag){if(this.drag.changed)this.onChange({type:'commit-drag',id:this.drag.id,before:this.drag.original});this.drag=null;}if(this.freehand){if(this.freehand.points.length>1)this.onChange({type:'add',drawing:this.freehand});this.freehand=null;this.afterComplete();this.render();}}

  updateDrag(p){
    const s=this.getState(),d=s.drawings.find(x=>x.id===this.drag.id);if(!d||d.locked)return;
    if(this.drag.handle>=0){d.points[this.drag.handle]=this.snapPoint(p);if(POSITION.has(d.type)&&this.drag.handle===0){/* entry is independently movable */}}
    else{
      const dyPrice=p.price-this.drag.start.price,dxBars=(p.logical??0)-(this.drag.start.logical??0);
      d.points=this.drag.original.map(op=>{const q=this.pane.shiftPoint(op,dxBars);q.price=op.price+dyPrice;return q;});
    }
    this.drag.changed=true;this.render();this.updateFloatingToolbar();
  }

  snapPoint(p){
    const s=this.getState(),mode=s.magnetMode||(s.magnet?'strong':'off');const plain={time:p.time,logical:p.logical,price:p.price};if(mode==='off')return plain;
    const idx=clamp(Math.round(p.logical),0,this.pane.displayBars.length-1),nearest=this.pane.nearestBarByLogical(idx);if(!nearest)return plain;
    const candidates=[nearest.open,nearest.high,nearest.low,nearest.close];let best=candidates[0],dist=Math.abs(best-p.price);for(const v of candidates){const d=Math.abs(v-p.price);if(d<dist){best=v;dist=d;}}
    if(mode==='weak'){
      const y0=this.pane.yForPrice(p.price),y1=this.pane.yForPrice(best);if(y0==null||y1==null||Math.abs(y0-y1)>12)return plain;
    }
    return{time:nearest.time,logical:idx,price:best};
  }

  normalizePoint(p){return{time:p.time,logical:Number.isFinite(p.logical)?p.logical:this.pane.logicalForTime(p.time),price:p.price};}
  makeDrawing(type,pts){
    const base={color:'#7cc8ff',width:1.5,dash:0,fill:'rgba(40,150,255,.12)',opacity:1,lineStyle:'solid'};
    if(type==='highlighter')Object.assign(base,{color:'#facc15',width:10,opacity:.28});
    if(type==='brush')Object.assign(base,{width:2});
    if(POSITION.has(type))Object.assign(base,{profitColor:'#00a8b8',lossColor:'#b92ebd',entryColor:'#00b6c8',opacity:.25,showStats:true,labelSize:11});
    const drawing={id:uid('draw'),paneId:this.pane.id,type,points:pts.map(p=>this.normalizePoint(p)),text:type==='text'?'Text':null,style:base,riskPercent:this.getState().riskPercent||1,locked:false,hidden:false,visibility:{all:true,periods:[],timeframes:[]},createdAt:Date.now()};
    if(type==='fibonacci')Object.assign(drawing,{levels:structuredClone(DEFAULT_FIB_LEVELS),extend:'right',background:false,useOneColor:false});
    return drawing;
  }
  expandPosition(d){
    if(d.points.length<2)return;const entry=d.points[0],target=d.points[1],distance=Math.abs(target.price-entry.price)||Math.abs(entry.price)*.002,stopPrice=d.type==='long'?entry.price-distance:entry.price+distance;
    const stop={...target,price:stopPrice};if(d.points.length<3)d.points.push(stop);else d.points[2]=stop;
  }
  afterComplete(){const s=this.getState();if(!s.keepDrawing)this.pane.app?.setTool('cursor',{preserveSelection:true});}
  cancelDraft(){this.draft=null;this.freehand=null;this.render();}

  findHit(x,y){for(const d of [...this.localDrawings()].reverse()){const hit=this.hitDrawing(d,x,y);if(hit)return{id:d.id,hit};}return null;}
  hitDrawing(d,x,y){
    if(d.hidden)return null;const pts=d.points.map(p=>this.screenPoint(p));if(!pts[0])return null;
    for(let i=0;i<pts.length;i++)if(pts[i]&&Math.hypot(pts[i].x-x,pts[i].y-y)<10)return{handle:i};
    if(['horizontal','crossline'].includes(d.type)&&Math.abs(pts[0].y-y)<7)return{handle:-1};
    if(['vertical','crossline'].includes(d.type)&&Math.abs(pts[0].x-x)<7)return{handle:-1};
    if(['brush','highlighter'].includes(d.type)){for(let i=1;i<pts.length;i++)if(pts[i-1]&&pts[i]&&distanceToSegment(x,y,pts[i-1].x,pts[i-1].y,pts[i].x,pts[i].y)<Math.max(7,(d.style?.width||2)/2+4))return{handle:-1};}
    if(POSITION.has(d.type)&&pts.length>=3&&pts.every(Boolean)){const x1=Math.min(pts[0].x,pts[1].x,pts[2].x),x2=Math.max(pts[0].x,pts[1].x,pts[2].x)+75,y1=Math.min(pts[0].y,pts[1].y,pts[2].y),y2=Math.max(pts[0].y,pts[1].y,pts[2].y);if(x>=x1&&x<=x2&&y>=y1&&y<=y2)return{handle:-1};}
    if(pts[1]&&distanceToSegment(x,y,pts[0].x,pts[0].y,pts[1].x,pts[1].y)<7)return{handle:-1};
    if(d.type==='rectangle'&&pts[1]&&inRect(x,y,pts[0],pts[1]))return{handle:-1};return null;
  }

  render(){
    const ctx=this.ctx,w=this.canvas.clientWidth,h=this.canvas.clientHeight;ctx.clearRect(0,0,w,h);
    const s=this.getState(),all=[...this.localDrawings()];if(this.draft)all.push(this.draft);if(this.freehand)all.push(this.freehand);
    const selected=new Set(s.selectedDrawingIds?.length?s.selectedDrawingIds:(s.selectedDrawingId?[s.selectedDrawingId]:[]));
    for(const d of all){if(d.hidden)continue;this.draw(ctx,d,selected.has(d.id),this.hoveredDrawingId===d.id);}
    this.updateFloatingToolbar();
  }

  draw(ctx,d,selected,hovered){
    const pts=d.points.map(p=>this.screenPoint(p));if(!pts[0])return;const st=d.style||{};ctx.save();ctx.globalAlpha=st.opacity??1;ctx.strokeStyle=st.color||'#7cc8ff';ctx.fillStyle=st.fill||'rgba(40,150,255,.12)';ctx.lineWidth=st.width||1.5;ctx.lineCap='round';ctx.lineJoin='round';ctx.setLineDash(st.lineStyle==='dashed'||st.dash?[6,5]:st.lineStyle==='dotted'?[2,4]:[]);const w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(d.type==='horizontal')line(ctx,0,pts[0].y,w,pts[0].y);
    else if(d.type==='vertical')line(ctx,pts[0].x,0,pts[0].x,h);
    else if(d.type==='crossline'){line(ctx,0,pts[0].y,w,pts[0].y);line(ctx,pts[0].x,0,pts[0].x,h);}
    else if(['trend','measure','arrow'].includes(d.type)&&pts[1]){line(ctx,pts[0].x,pts[0].y,pts[1].x,pts[1].y);if(d.type==='arrow')arrowHead(ctx,pts[0],pts[1]);if(d.type==='measure')this.measureLabel(ctx,d,pts);}
    else if(d.type==='ray'&&pts[1]){const ex=extendRay(pts[0],pts[1],w,h);line(ctx,pts[0].x,pts[0].y,ex.x,ex.y);}
    else if(d.type==='rectangle'&&pts[1]){const x=Math.min(pts[0].x,pts[1].x),y=Math.min(pts[0].y,pts[1].y),rw=Math.abs(pts[1].x-pts[0].x),rh=Math.abs(pts[1].y-pts[0].y);ctx.fillRect(x,y,rw,rh);ctx.strokeRect(x,y,rw,rh);}
    else if(d.type==='fibonacci'&&pts[1])this.drawFib(ctx,d,pts);
    else if(d.type==='channel'&&pts[1])this.drawChannel(ctx,pts);
    else if(d.type==='text'){ctx.fillStyle=st.color||'#d7e5f2';ctx.font='12px Inter,system-ui';ctx.fillText(d.text||'Text',pts[0].x+6,pts[0].y-6);}
    else if(['brush','highlighter'].includes(d.type)&&pts.filter(Boolean).length>1){const valid=pts.filter(Boolean);ctx.beginPath();ctx.moveTo(valid[0].x,valid[0].y);for(let i=1;i<valid.length;i++)ctx.lineTo(valid[i].x,valid[i].y);ctx.stroke();}
    else if(POSITION.has(d.type)&&pts.length>=3&&pts.every(Boolean))this.drawPosition(ctx,d,pts,selected||hovered);
    ctx.globalAlpha=1;
    if(selected){ctx.fillStyle='#fff';for(const p of pts.slice(0,POSITION.has(d.type)?3:8)){if(!p)continue;ctx.beginPath();ctx.arc(p.x,p.y,4.5,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#168cff';ctx.lineWidth=1.5;ctx.stroke();}}
    ctx.restore();
  }

  drawFib(ctx,d,pts){
    const [a,b]=pts,levels=(d.levels?.length?d.levels:DEFAULT_FIB_LEVELS).filter(x=>x.visible!==false);ctx.font='10px Inter,system-ui';const left=Math.min(a.x,b.x),right=d.extend==='right'?this.canvas.clientWidth:Math.max(a.x,b.x);
    if(d.showTrendLine!==false){ctx.globalAlpha=.9;ctx.strokeStyle=d.style?.color||'#7cc8ff';line(ctx,a.x,a.y,b.x,b.y);ctx.globalAlpha=1;}
    for(const lv of levels){const y=a.y+(b.y-a.y)*Number(lv.value);ctx.globalAlpha=.85;ctx.strokeStyle=d.useOneColor?(d.style.color||'#7cc8ff'):(lv.color||d.style.color||'#7cc8ff');line(ctx,left,y,right,y);ctx.fillStyle=ctx.strokeStyle;ctx.fillText(String(lv.value),Math.min(right-34,Math.max(a.x,b.x)+5),y-3);}ctx.globalAlpha=1;
    if(d.background){ctx.globalAlpha=.08;ctx.fillStyle=d.style.fill||d.style.color||'#7cc8ff';ctx.fillRect(left,Math.min(a.y,b.y),Math.max(0,right-left),Math.abs(a.y-b.y));ctx.globalAlpha=1;}
  }
  drawChannel(ctx,pts){const [a,b]=pts;line(ctx,a.x,a.y,b.x,b.y);const off=40;line(ctx,a.x,a.y+off,b.x,b.y+off);ctx.globalAlpha=.18;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(b.x,b.y+off);ctx.lineTo(a.x,a.y+off);ctx.closePath();ctx.fill();ctx.globalAlpha=1;}

  drawPosition(ctx,d,pts,showDetails){
    const [entry,target,stop]=pts,st=d.style||{};const x1=Math.min(entry.x,target.x,stop.x),x2=Math.max(entry.x,target.x,stop.x)+72,width=Math.max(70,x2-x1),rewardTop=Math.min(entry.y,target.y),rewardH=Math.abs(entry.y-target.y),lossTop=Math.min(entry.y,stop.y),lossH=Math.abs(entry.y-stop.y);
    ctx.globalAlpha=st.opacity??.22;ctx.fillStyle=st.profitColor||'#00a8b8';ctx.fillRect(x1,rewardTop,width,rewardH);ctx.fillStyle=st.lossColor||'#b92ebd';ctx.fillRect(x1,lossTop,width,lossH);ctx.globalAlpha=1;
    ctx.strokeStyle=st.entryColor||'#00b6c8';line(ctx,x1,entry.y,x1+width,entry.y);ctx.strokeStyle=st.profitColor||'#00a8b8';line(ctx,x1,target.y,x1+width,target.y);ctx.strokeStyle=st.lossColor||'#b92ebd';line(ctx,x1,stop.y,x1+width,stop.y);
    if(showDetails&&st.showStats!==false)this.drawPositionDetails(ctx,d,pts,{x1,width});
  }
  drawPositionDetails(ctx,d,pts,{x1,width}){
    const [entry,target,stop]=d.points,sp=pts,cfg=SYMBOLS[this.pane.symbol]||SYMBOLS.XAUUSD,risk=Math.abs(entry.price-stop.price),reward=Math.abs(target.price-entry.price),rr=risk?reward/risk:0,riskPct=Number(d.riskPercent??this.getState().riskPercent??1),account=Number(this.getState().accountSize||10000),riskAmount=account*riskPct/100,targetAmount=riskAmount*rr,pips=risk/Math.max(cfg.pipSize,cfg.minMove),targetPips=reward/Math.max(cfg.pipSize,cfg.minMove),qty=this.getState().tradeSizeMode==='lots'?Number(this.getState().fixedLots||.1):Math.max(.01,risk?riskAmount/(risk*100):.01);
    const pct=risk/Math.max(entry.price,1e-12)*100,targetPct=reward/Math.max(entry.price,1e-12)*100;
    label(ctx,x1,sp[2].y-30,`${d.type==='long'?'Stop':'Stop'}: ${formatPrice(this.pane.symbol,risk)} (${pct.toFixed(3)}%) ${Math.round(pips)}, Amount: ${riskAmount.toFixed(0)}`,d.style.lossColor||'#b92ebd');
    label(ctx,x1+Math.min(42,width*.15),sp[0].y+8,`Open PnL: 0.00, Qty: ${qty.toFixed(2)}\nRisk/reward ratio: ${rr.toFixed(2)}`,d.style.entryColor||'#00a8b8',true);
    label(ctx,x1,sp[1].y+14,`Target: ${formatPrice(this.pane.symbol,reward)} (${targetPct.toFixed(3)}%) ${Math.round(targetPips)}, Amount: ${targetAmount.toFixed(0)}`,d.style.profitColor||'#00a8b8');
  }

  measureLabel(ctx,d,pts){const [a,b]=d.points,delta=b.price-a.price,pct=a.price?delta/a.price*100:0;ctx.fillStyle='#0b131d';ctx.fillRect(pts[1].x+8,pts[1].y-24,165,22);ctx.fillStyle='#e9f3fb';ctx.font='11px Inter,system-ui';ctx.fillText(`${delta.toFixed(2)}  (${pct.toFixed(2)}%)`,pts[1].x+14,pts[1].y-9);}

  updateFloatingToolbar(){
    const s=this.getState(),id=s.selectedDrawingId,d=id?this.stateDrawings().find(x=>x.id===id):null;if(!d||d.hidden||!['cursor','crosshair'].includes(s.activeTool)){this.hideToolbar();return;}
    const pts=d.points.map(p=>this.screenPoint(p)).filter(Boolean);if(!pts.length){this.hideToolbar();return;}const minX=Math.min(...pts.map(p=>p.x)),maxX=Math.max(...pts.map(p=>p.x)),minY=Math.min(...pts.map(p=>p.y));this.toolbar.classList.add('show');
    const w=this.toolbar.offsetWidth||230,left=clamp((minX+maxX)/2-w/2,6,Math.max(6,this.pane.root.clientWidth-w-6)),top=clamp(minY-46,6,Math.max(6,this.pane.root.clientHeight-40));this.toolbar.style.transform=`translate(${Math.round(left)}px,${Math.round(top)}px)`;
    const lock=this.toolbar.querySelector('button[title="Lock / unlock"]');if(lock)lock.classList.toggle('active',!!d.locked);
  }
  hideToolbar(){this.toolbar?.classList.remove('show');}
}

function line(ctx,x1,y1,x2,y2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();}
function distanceToSegment(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1;if(dx===0&&dy===0)return Math.hypot(px-x1,py-y1);const t=clamp(((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy),0,1);return Math.hypot(px-(x1+t*dx),py-(y1+t*dy));}
function inRect(x,y,a,b){return x>=Math.min(a.x,b.x)&&x<=Math.max(a.x,b.x)&&y>=Math.min(a.y,b.y)&&y<=Math.max(a.y,b.y);}
function arrowHead(ctx,a,b){const ang=Math.atan2(b.y-a.y,b.x-a.x),len=10;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(ang-.5),b.y-len*Math.sin(ang-.5));ctx.moveTo(b.x,b.y);ctx.lineTo(b.x-len*Math.cos(ang+.5),b.y-len*Math.sin(ang+.5));ctx.stroke();}
function extendRay(a,b,w,h){const dx=b.x-a.x,dy=b.y-a.y;if(Math.abs(dx)<.001)return{x:a.x,y:dy>=0?h:0};const candidates=[];for(const x of [0,w]){const t=(x-a.x)/dx;if(t>0)candidates.push({x,y:a.y+t*dy,t});}if(Math.abs(dy)>.001)for(const y of [0,h]){const t=(y-a.y)/dy;if(t>0)candidates.push({x:a.x+t*dx,y,t});}return candidates.filter(p=>p.x>=0&&p.x<=w&&p.y>=0&&p.y<=h).sort((p,q)=>q.t-p.t)[0]||b;}
function label(ctx,x,y,text,color,multiline=false){const lines=multiline?String(text).split('\n'):[String(text)];ctx.font='11px Inter,system-ui';const width=Math.max(...lines.map(l=>ctx.measureText(l).width))+14,height=lines.length*14+8;ctx.fillStyle=color;ctx.globalAlpha=.96;ctx.fillRect(x,y-height,width,height);ctx.globalAlpha=1;ctx.fillStyle='#fff';lines.forEach((l,i)=>ctx.fillText(l,x+7,y-height+14+i*14));}
