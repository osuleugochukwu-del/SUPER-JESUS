import {
  loadState, saveState, cloneSerializable, captureChartTemplate, applyChartTemplateToState,
  captureWorkspace, applyWorkspaceToState
} from './state.js';
import {
  SYMBOLS, TIMEFRAMES, TICK_PERIODS, RENKO_PIP_PERIODS, RANGE_PIP_PERIODS, RENKO_TIME_PERIODS,
  DEFAULT_PERIOD_FAVORITES, formatPrice, periodLabel, describePeriod, periodKey
} from './data.js';
import { ChartPane } from './chart-pane.js';
import { $, $$, el, icon, toast, clamp, downloadBlob } from './utils.js';
import { validateIndicatorSpec, safeIndicatorSummary } from './indicator-security.js';
import { requestBrowserNotifications, showBrowserNotification, playAlertTone } from './alert-client.js';
import { fetchOnlineReplay } from './replay-client.js';
import { BUILTIN_INDICATORS, indicatorDefinition, makeIndicator } from './indicators.js';
import { summarizeTrades, profitabilityBySymbol, performanceByBucket, behaviorInsights, makeDemoHistory, formatDuration } from './analytics.js';
import { WorkspaceBus, detachedParams, makeDetachedUrl } from './workspace-sync.js';
import { clonePeriod, resolveConstruction, constructionId, isSameConstruction } from './chart-transition.js';
import { analyzeMarketBars, buildHeatmap, buildScreener, marketSentiment, buildAIContext } from './market-intelligence.js';
import { startSpeechRecognition, speakText, stopSpeech, requestAI } from './ai-client.js';
import {
  createSharePayload, normalizeShareStatus, makeReferralId, buildShareSummary,
  createSocialCardCanvas, buildStatelessShareUrl, readStatelessShareUrl
} from './share.js';

class TradeAvataApp{
  constructor(){
    this.state=loadState();this.panes=[];this.menu=null;this.modal=null;this.bottomDrag=null;this.replayTimer=null;
    this.incomingShare=readStatelessShareUrl();
    this.ensureShareIdentity();
    this.detachedInfo=detachedParams();
    this.positions=[
      {id:'P-1001',symbol:'XAUUSD',side:'Buy',size:.24,entry:4127.20,current:4131.20,sl:4122.20,tp:4138.20,pnl:96.00,pnlPct:.96},
    ];
    this.orders=[];this.demoHistory=makeDemoHistory();
    this.bus=new WorkspaceBus(msg=>this.handleWorkspaceMessage(msg));
    this.applyPlatformTheme();
    this.buildShell();
    if(this.detachedInfo.detached){
      document.body.classList.add('detached-window');
      this.state.layout='1';
      const saved=this.state.paneConfigs[this.detachedInfo.slot]||this.state.paneConfigs[0];
      this.state.paneConfigs=[saved||{symbol:this.state.symbol,chartType:'Candles',period:{mode:'time',value:'15s'}}];
    }
    this.applyLayout(this.state.layout||'1',false);this.installGlobalKeys();this.installBottomResize();this.startMarketIntelligenceTimer();this.renderAdSlot();this.registerServiceWorker();
    if(this.incomingShare)setTimeout(()=>this.applyIncomingShare(this.incomingShare),60);
    window.__tradeAvata=this;
  }
  buildShell(){this.renderTopbar();this.renderLeftbar();this.renderRightRail();this.renderRightPanel();this.renderBottom();this.renderMobileDock();}
  startMarketIntelligenceTimer(){clearInterval(this.marketTimer);this.marketTimer=setInterval(()=>{const m=this.marketState();if(!m.autoRefresh)return;m.lastUpdated=new Date().toISOString();if(this.state.rightSidebarOpen&&['market','ai'].includes(this.state.rightPanel))this.renderRightPanel();},Math.max(15,Number(this.marketState().refreshSeconds)||60)*1000);}
  renderTopbar(){
    const bar=$('#topbar');bar.innerHTML='';
    const logo=this.state.brand?.logoDataUrl||'./public/brand/trade-avata-logo.svg';
    const brand=el('div',{class:'brand topbar-brand'},el('img',{src:logo,alt:'Trade Avata'}),el('span',{class:'name'},'Trade Avata ',el('b',{},'Chart')));bar.append(brand);
    const scroll=el('div',{class:'topbar-scroll'});bar.append(scroll);
    const conn=el('button',{class:'live-pill',title:'Connection status',onclick:()=>this.openLogin()},el('span',{class:'live-dot'}),this.state.connection.status==='live'?'LIVE':this.state.connection.status==='demo'?'DEMO':'OFFLINE');scroll.append(conn);
    const symbol=el('button',{class:'toolbar-select top-symbol',onclick:e=>this.openSymbolMenu(e.currentTarget)},'⌕ ',this.activeConfig().symbol,'⌄');scroll.append(symbol);

    const favs=Array.isArray(this.state.favoritePeriods)&&this.state.favoritePeriods.length?this.state.favoritePeriods:DEFAULT_PERIOD_FAVORITES;
    const tf=el('div',{class:'toolbar-group time-favs'});
    for(const per of favs.slice(0,10)){
      const p=typeof per==='string'?{mode:'time',value:per}:per;
      tf.append(el('button',{class:`tf-btn ${periodKey(this.activeConfig().period)===periodKey(p)?'active':''}`,title:describePeriod(p),onclick:()=>this.setPeriod(p)},periodLabel(p)));
    }
    tf.append(el('button',{class:'tf-btn tf-more',onclick:e=>this.openTimeframeMenu(e.currentTarget)},'⌄'));scroll.append(tf);
    scroll.append(el('div',{class:'toolbar-spacer'}));
    scroll.append(el('button',{class:'tb-btn',onclick:e=>this.openIndicatorMenu(e.currentTarget)},'ƒx Indicators ⌄'));
    scroll.append(el('button',{class:`icon-btn hide-md ${this.state.indicators.every(i=>i.visible===false)?'active':''}`,title:'Hide/show all indicators',onclick:()=>this.toggleAllIndicators()},'◉'));
    scroll.append(el('button',{class:`tb-btn ${this.state.quickTrade?'active':''}`,onclick:()=>this.toggleQuickTrade()},'↕ Trade'));
    scroll.append(el('button',{class:'tb-btn',onclick:()=>this.openBottom('alerts')},'◇ Alert'));
    scroll.append(el('button',{class:`tb-btn ${this.state.replay.active||this.state.replay.selecting?'active':''}`,onclick:()=>this.startReplaySelection()},'◀ Replay'));
    if(this.canUseAIChat())scroll.append(el('button',{class:'tb-btn owner-ai',onclick:()=>this.openAI()},'✦ AI'));
    scroll.append(el('button',{class:'tb-btn',onclick:e=>this.openSnapshotMenu(e.currentTarget)},'◉ Snapshot'));
    scroll.append(el('button',{class:'tb-btn',onclick:e=>this.openTemplateMenu(e.currentTarget)},'▤ Templates'));
    scroll.append(el('button',{class:'icon-btn hide-md',onclick:()=>this.undo(),title:'Undo drawing action'},'↶'));
    scroll.append(el('button',{class:'icon-btn hide-md',onclick:()=>this.redo(),title:'Redo drawing action'},'↷'));
    scroll.append(el('button',{class:'tb-btn',onclick:e=>this.openLayoutMenu(e.currentTarget)},'▣ Layout'));
    scroll.append(el('button',{class:'tb-btn',onclick:()=>this.openSettings('symbol')},'⚙ Settings'));
    scroll.append(el('button',{class:'icon-btn',onclick:()=>this.toggleFullscreen(),title:'Fullscreen'},'⛶'));
    const acc=this.state.connection.account;
    const accLabel=this.state.connection.status==='live'?(acc?.name||acc?.number||'Broker Account'):'Sign in / Broker';
    scroll.append(el('button',{class:'tb-btn account-btn',onclick:()=>this.openLogin()},el('span',{class:`account-dot ${this.state.connection.status==='live'?'live':''}`}),this.state.connection.status==='live'?`● ${accLabel} ▾`:accLabel));
  }
  renderLeftbar(){
    const left=$('#leftbar');left.innerHTML='';
    const tools=[['cursor','Mouse / Pointer'],['crosshair','Crosshair'],['crossline','Cross line'],['trend','Trend line'],['horizontal','Horizontal line'],['vertical','Vertical line'],['ray','Ray'],['fibonacci','Fibonacci retracement'],['rectangle','Rectangle / zone'],['long','Long position'],['short','Short position'],['measure','Measure'],['text','Text / label'],['brush','Brush'],['channel','Parallel channel']];
    tools.forEach(([id,label],i)=>{if([3,7,9,13].includes(i))left.append(el('div',{class:'left-sep'}));left.append(el('button',{class:`left-tool ${this.state.activeTool===id?'active':''}`,title:label,onclick:()=>this.setTool(id)},icon(id)));});
    left.append(el('div',{class:'left-sep'}));
    left.append(el('button',{class:`left-tool ${this.state.magnet?'active':''}`,title:'Magnet',onclick:()=>this.setTool('magnet')},icon('magnet')));
    left.append(el('button',{class:`left-tool ${this.state.keepDrawing?'active':''}`,title:'Keep drawing',onclick:()=>{this.state.keepDrawing=!this.state.keepDrawing;this.renderLeftbar();this.save();toast(`Keep drawing ${this.state.keepDrawing?'on':'off'}`);}},'∞'));
    left.append(el('button',{class:'left-tool',title:'More drawing tools',onclick:e=>this.openDrawingMenu(e.currentTarget)},'•••'));
  }
  renderRightRail(){
    const rail=$('#right-rail');rail.innerHTML='';const items=[['watchlist','Watchlist'],['market','Market'],['ai','AI Insights'],['calendar','Calendar'],['alerts','Alerts'],['news','News'],['objects','Object Tree'],['tools','Tools'],['settings','Settings'],['ops','Ops']];items.forEach(([id,label])=>rail.append(el('button',{class:`rail-btn ${this.state.rightPanel===id&&this.state.rightSidebarOpen?'active':''}`,onclick:()=>this.toggleRightPanel(id)},el('b',{},icon(id)),label)));rail.append(el('div',{class:'rail-spacer'}));rail.append(el('button',{class:'rail-btn',onclick:()=>this.openMore()},el('b',{},'•••'),'More'));
  }
  renderRightPanel(){
    const p=$('#right-panel');const wide=['market','ai'].includes(this.state.rightPanel);p.classList.toggle('wide',wide);p.classList.toggle('open',this.state.rightSidebarOpen);const ws=$('#workspace');const panelWidth=wide?380:292;if(ws)ws.style.marginRight=(this.state.rightSidebarOpen&&window.innerWidth>780)?`${panelWidth}px`:'0';p.innerHTML='';if(!this.state.rightSidebarOpen){setTimeout(()=>this.panes.forEach(x=>x.resize()),50);return;}
    const title={watchlist:'Watchlist',market:'Market Intelligence',ai:'AI Insights',calendar:'Calendar',alerts:'Alerts',news:'News',objects:'Object Tree',tools:'Tools',settings:'Quick Settings',ops:'Platform Ops'}[this.state.rightPanel]||'Panel';p.append(el('div',{class:'panel-head'},el('strong',{},title),el('button',{class:'panel-close',onclick:()=>{this.state.rightSidebarOpen=false;this.renderRightPanel();this.renderRightRail();this.save();}},'×')));const body=el('div',{class:'panel-body'});p.append(body);
    if(this.state.rightPanel==='watchlist')this.renderWatchlist(body);else if(this.state.rightPanel==='market')this.renderMarketCenter(body);else if(this.state.rightPanel==='ai')this.renderAIInsights(body);else if(this.state.rightPanel==='objects')this.renderObjectTree(body);else if(this.state.rightPanel==='alerts')this.renderAlertsSide(body);else if(this.state.rightPanel==='settings')this.renderQuickSettings(body);else if(this.state.rightPanel==='ops')this.renderOps(body);else if(this.state.rightPanel==='tools')this.renderToolsPanel(body);else if(this.state.rightPanel==='calendar')body.innerHTML='<div class="side-card"><h4>Economic calendar</h4><p>09:30 USD · High impact · Employment data</p><p>14:00 USD · Medium impact · Services PMI</p></div><div class="side-card"><p>Production calendar data will come from the backend feed. Demo events are clearly labelled.</p></div>';else if(this.state.rightPanel==='news')body.innerHTML='<div class="side-card"><h4>Market news</h4><p>Live news provider is not configured in this frontend package.</p><p>No fake headline is presented as live news.</p></div>';
  }
  renderWatchlist(body){for(const sym of this.state.watchlist){const cfg=SYMBOLS[sym],seed=(sym.charCodeAt(0)+sym.length)%7-3,price=cfg.base*(1+seed*.0003),change=seed*.11;body.append(el('div',{class:`watch-row ${this.activeConfig().symbol===sym?'active':''}`,ondblclick:()=>this.setSymbol(sym),onclick:()=>this.setSymbol(sym)},el('div',{},el('strong',{},sym),el('small',{},cfg.name)),el('span',{class:'watch-price'},formatPrice(sym,price)),el('span',{class:`watch-change ${change>=0?'pos':'neg'}`},`${change>=0?'+':''}${change.toFixed(2)}%`)));}}
  isLocalOwnerPreview(){return !!this.state.ownerMode&&['localhost','127.0.0.1',''].includes(location.hostname);}
  canUseAIChat(){
    const u=this.state.connection?.tradeAvataUser||{};
    const perms=Array.isArray(u.permissions)?u.permissions:[];
    const ent=u.entitlements||{};
    return this.isLocalOwnerPreview()||u.role==='owner'||perms.includes('ai_chat')||ent.aiChat===true||ent.ai_chat===true;
  }
  marketState(){
    this.state.marketIntelligence=this.state.marketIntelligence||{activeTab:'overview',symbol:this.activeConfig().symbol||'XAUUSD',timeframe:'15m',autoRefresh:true,refreshSeconds:60,lastUpdated:null};
    if(!SYMBOLS[this.state.marketIntelligence.symbol])this.state.marketIntelligence.symbol=this.activeConfig().symbol||'XAUUSD';
    return this.state.marketIntelligence;
  }
  currentMarketSnapshot(){
    const m=this.marketState(),pane=this.activePane();
    const bars=(pane&&pane.symbol===m.symbol&&pane.timeframe===m.timeframe&&pane.displayBars?.length)?pane.displayBars:null;
    return analyzeMarketBars(m.symbol,m.timeframe,bars||[]);
  }
  marketSourceBadge(){
    const live=this.state.connection.status==='live';
    return {text:live?'LIVE FEED READY · multi-symbol engine awaits gateway':'DEMO MARKET PREVIEW',cls:live?'status-badge':'status-badge market-demo'};
  }
  renderMarketCenter(body){
    const m=this.marketState(),symbols=[...new Set([m.symbol,...this.state.watchlist,Object.keys(SYMBOLS)[0]])].filter(x=>SYMBOLS[x]),frames=['5m','15m','30m','1h','4h','1D'];
    const head=el('div',{class:'market-controls'},select(symbols,m.symbol,v=>{m.symbol=v;this.save();this.renderRightPanel();}),select(frames,m.timeframe,v=>{m.timeframe=v;this.save();this.renderRightPanel();}),el('button',{class:'secondary market-refresh',title:'Refresh market preview',onclick:()=>{m.lastUpdated=new Date().toISOString();this.renderRightPanel();}},'↻'));
    body.append(head);
    const badge=this.marketSourceBadge();body.append(el('div',{class:'market-source'},el('span',{class:badge.cls},badge.text),el('small',{},m.lastUpdated?`Updated ${new Date(m.lastUpdated).toLocaleTimeString()}`:'Auto analysis')));
    const tabs=el('div',{class:'market-tabs'});for(const [id,label] of [['overview','Overview'],['heatmap','Heat Map'],['screener','Screener'],['sentiment','Sentiment'],['alerts','AI Alerts']])tabs.append(el('button',{class:m.activeTab===id?'active':'',onclick:()=>{m.activeTab=id;this.save();this.renderRightPanel();}},label));body.append(tabs);
    const area=el('div',{class:'market-tab-body'});body.append(area);
    const rows=buildScreener(symbols,m.timeframe),heat=buildHeatmap(symbols,m.timeframe),sent=marketSentiment(rows),snap=this.currentMarketSnapshot();
    if(m.activeTab==='overview'){
      const listen=el('button',{class:'mini-action',onclick:()=>this.speakAI(`${snap.summary} ${snap.scenario}`)},'▶ Listen');
      area.append(el('div',{class:'side-card ai-summary-card'},el('div',{class:'card-title-row'},el('h4',{},`${snap.symbol} · ${snap.timeframe}`),listen),el('p',{},snap.summary)));
      const g=el('div',{class:'market-metric-grid'});
      for(const [k,v,cls=''] of [['Bias',capitalize(snap.direction),snap.direction],['Trend strength',`${snap.trendStrength}/100`],['Momentum',`${snap.momentum>=0?'+':''}${snap.momentum.toFixed(2)}%`,snap.momentum>=0?'bullish':'bearish'],['Volatility',snap.volatilityLabel],['Support',formatPrice(snap.symbol,snap.support)],['Resistance',formatPrice(snap.symbol,snap.resistance)]])g.append(el('div',{class:`market-metric ${cls}`},el('small',{},k),el('strong',{},v)));area.append(g);
      area.append(el('div',{class:'side-card'},el('h4',{},'Next likely scenario'),el('p',{},snap.scenario),el('div',{class:'setup-quality'},'Setup quality ', '★'.repeat(snap.setupQuality), '☆'.repeat(5-snap.setupQuality))));
      area.append(el('button',{class:'primary full-btn',onclick:()=>this.toggleRightPanel('ai')},'Open AI Insights'));
    }else if(m.activeTab==='heatmap'){
      const grid=el('div',{class:'heatmap-grid'});for(const x of heat){const c=x.change>=.08?'hot-up':x.change<=-.08?'hot-down':'hot-flat';grid.append(el('button',{class:`heat-tile ${c}`,onclick:()=>{m.symbol=x.symbol;m.activeTab='overview';this.setSymbol(x.symbol);this.save();this.renderRightPanel();}},el('strong',{},x.symbol),el('b',{},`${x.change>=0?'+':''}${x.change.toFixed(2)}%`),el('small',{},formatPrice(x.symbol,x.price))));}area.append(grid,el('p',{class:'settings-note'},'Heat Map uses the same Market Intelligence layer. Production values will come from the normalized live feed; this package does not pretend demo values are live.'));
    }else if(m.activeTab==='screener'){
      const table=el('table',{class:'data-table compact-table'});table.innerHTML='<thead><tr><th>Symbol</th><th>Signal</th><th>Score</th><th>TF</th></tr></thead>';const tb=el('tbody');for(const x of rows){const tr=el('tr',{onclick:()=>{m.symbol=x.symbol;this.save();this.renderRightPanel();}});tr.append(el('td',{},x.symbol),el('td',{class:x.signal==='Buy'?'pos':x.signal==='Sell'?'neg':''},x.signal),el('td',{},`${x.score}/100`),el('td',{},m.timeframe));tb.append(tr);}table.append(tb);area.append(table,el('p',{class:'settings-note'},'The production screener can scan RSI, Stochastic, EMA structure, ADX, ATR, momentum, volatility, breakouts and your private indicators from one backend market stream.'));
    }else if(m.activeTab==='sentiment'){
      const ring=el('div',{class:'sentiment-ring',style:`--bull:${sent.bullish};--neutral:${sent.neutral}`},el('div',{},el('b',{},`${sent.bullish}%`),el('small',{},'Bullish')));
      area.append(el('div',{class:'sentiment-wrap'},ring,el('div',{class:'sentiment-legend'},el('span',{class:'bullish'},`● Bullish ${sent.bullish}%`),el('span',{},`● Neutral ${sent.neutral}%`),el('span',{class:'bearish'},`● Bearish ${sent.bearish}%`))),el('div',{class:'side-card'},el('h4',{},'Market breadth'),el('p',{},`Across ${rows.length} monitored symbols, ${sent.bullish}% currently score bullish, ${sent.neutral}% neutral and ${sent.bearish}% bearish in this preview model.`)));
    }else{
      const picks=rows.filter(x=>x.signal!=='Neutral').slice(0,6);
      if(!picks.length)area.append(el('div',{class:'empty-state'},'No technical alerts in the current preview sample.'));
      for(const x of picks){const text=`${x.symbol}: ${x.signal} watch · ${x.direction} structure · score ${x.score}/100 on ${m.timeframe}`;area.append(el('div',{class:'ai-alert-row'},el('span',{class:x.signal==='Buy'?'ai-alert-icon buy':'ai-alert-icon sell'},x.signal==='Buy'?'↗':'↘'),el('div',{},el('strong',{},x.symbol),el('small',{},text)),el('button',{class:'mini-action',title:'Listen',onclick:()=>this.speakAI(text)},'▶')));}
      area.append(el('p',{class:'settings-note'},'These are technical market-condition outputs, not a public AI chat. Server-side alert delivery will be connected to the live feed and alert backend.'));
    }
  }
  renderAIInsights(body){
    const m=this.marketState(),snap=this.currentMarketSnapshot(),badge=this.marketSourceBadge();
    body.append(el('div',{class:'market-controls'},select(Object.keys(SYMBOLS),m.symbol,v=>{m.symbol=v;this.save();this.renderRightPanel();}),select(['5m','15m','30m','1h','4h','1D'],m.timeframe,v=>{m.timeframe=v;this.save();this.renderRightPanel();})));
    body.append(el('div',{class:'market-source'},el('span',{class:badge.cls},badge.text),el('small',{},'Automated output · no public prompt box')));
    const allText=`${snap.summary} ${snap.scenario}`;
    body.append(el('div',{class:'side-card ai-summary-card'},el('div',{class:'card-title-row'},el('h4',{},'Market Summary'),el('button',{class:'mini-action',onclick:()=>this.speakAI(allText)},'▶ Listen')),el('p',{},snap.summary)));
    const g=el('div',{class:'market-metric-grid'});
    for(const [k,v,cls=''] of [['Market bias',capitalize(snap.direction),snap.direction],['Trend strength',snap.trendStrength>=65?'Strong':snap.trendStrength>=35?'Moderate':'Weak'],['Momentum',snap.momentum>=0?'Bullish':'Bearish',snap.momentum>=0?'bullish':'bearish'],['Volatility',snap.volatilityLabel],['Key support',formatPrice(snap.symbol,snap.support)],['Key resistance',formatPrice(snap.symbol,snap.resistance)],['Risk state',snap.volatilityLabel==='High'?'Elevated':'Normal'],['Setup quality',`${snap.setupQuality}/5`]])g.append(el('div',{class:`market-metric ${cls}`},el('small',{},k),el('strong',{},v)));body.append(g);
    body.append(el('div',{class:'side-card'},el('div',{class:'card-title-row'},el('h4',{},'Next Likely Scenario'),el('button',{class:'mini-action',onclick:()=>this.speakAI(snap.scenario)},'▶ Listen')),el('p',{},snap.scenario)));
    if(this.canUseAIChat())this.renderAIChatComposer(body,'market',buildAIContext(snap,this.state.indicators),{title:'Owner / permitted AI conversation'});
    else body.append(el('div',{class:'side-card ai-access-card'},el('h4',{},'AI conversation'),el('p',{},'Public users receive automated market outputs only. Conversational AI is reserved for the owner and accounts explicitly granted the AI-chat entitlement.')));
    body.append(el('p',{class:'ai-disclaimer'},'Trade Avata AI provides automated market analysis, not financial advice. AI chat permissions must also be enforced by the secure backend.'));
  }
  renderAIChatComposer(parent,channel,context,{title='AI conversation'}={}){
    const card=el('div',{class:'side-card ai-chat-card'},el('div',{class:'card-title-row'},el('h4',{},title),el('span',{class:'status-badge'},'OWNER / ENTITLED')));
    const history=el('div',{class:'ai-chat-history'});const messages=(this.state.aiConversations?.[channel]||[]).slice(-8);
    if(!messages.length)history.append(el('div',{class:'ai-chat-empty'},channel==='indicator'?'Ask about your indicator, signals, settings or why a condition did or did not trigger.':'Ask privately about the market scan, heat map, ranking, alert or current symbol.'));
    for(const msg of messages){const row=el('div',{class:`ai-msg ${msg.role}`},el('small',{},msg.role==='user'?'You':'Trade Avata AI'),el('p',{},msg.text));if(msg.role==='assistant')row.append(el('button',{class:'mini-action',onclick:()=>this.speakAI(msg.text)},'▶ Play'));history.append(row);}
    const input=el('textarea',{class:'field ai-chat-input',placeholder:'Type or use the microphone…',maxlength:'4000'}),status=el('small',{class:'ai-voice-status'},'');
    const mic=el('button',{class:'secondary ai-mic',title:'Speak instead of typing'},'🎙 Speak');
    mic.addEventListener('click',()=>this.startAIInputVoice(input,status,mic));
    const send=el('button',{class:'primary',onclick:()=>this.submitAIChat(channel,input,context,status)},'Send');
    const stop=el('button',{class:'secondary',onclick:()=>{stopSpeech();status.textContent='Playback stopped';}},'■ Stop audio');
    card.append(history,input,el('div',{class:'ai-chat-actions'},mic,send,stop),status,el('p',{class:'settings-note'},'Voice transcription and read-aloud use browser capabilities when available. Prompts are sent only after the secure AI backend confirms this account is allowed to chat.'));
    parent.append(card);
  }
  startAIInputVoice(input,status,mic){
    if(!this.canUseAIChat()){toast('AI chat is not enabled for this account.','error');return;}
    if(this.state.aiAccess?.voiceInput===false){toast('Voice input is disabled in Settings → AI.','error');return;}
    this.activeRecognition?.stop?.();let base=input.value.trim();
    const rec=startSpeechRecognition({
      onState:s=>{status.textContent=s==='listening'?'Listening… speak naturally.':'Voice ready';mic.classList.toggle('active',s==='listening');},
      onResult:({finalText,interim})=>{const extra=finalText||interim;input.value=[base,extra].filter(Boolean).join(base&&extra?' ':'');if(finalText)base=input.value.trim();},
      onError:e=>{status.textContent=e.message;toast(e.message,'error');}
    });this.activeRecognition=rec;
  }
  async submitAIChat(channel,input,context,status){
    const message=input.value.trim();if(!message)return;if(!this.canUseAIChat()){toast('This account is not permitted to use AI chat.','error');return;}
    this.state.aiConversations=this.state.aiConversations||{indicator:[],market:[]};this.state.aiConversations[channel]=this.state.aiConversations[channel]||[];
    this.state.aiConversations[channel].push({role:'user',text:message,time:new Date().toISOString()});input.value='';status.textContent='Sending securely…';this.save();
    try{
      const reply=await requestAI({channel,message,context});this.state.aiConversations[channel].push({role:'assistant',text:reply,time:new Date().toISOString()});this.state.aiConversations[channel]=this.state.aiConversations[channel].slice(-30);this.save();status.textContent='Reply received';
      if(this.state.aiAccess?.autoReadReplies)speakText(reply);
      if(channel==='market'&&this.state.rightPanel==='ai')this.renderRightPanel();else if(channel==='indicator')this.openAI();
    }catch(e){status.textContent=e.message;toast(e.message,'error');}
  }
  speakAI(text){if(!this.state.aiAccess?.readAloud){toast('Read-aloud is disabled in AI settings.');return;}if(!speakText(text))toast('Text-to-speech is not available in this browser.','error');}
  renderToolsPanel(body){
    const labels={cursor:'Cursor',crosshair:'Crosshair',crossline:'Cross line',trend:'Trend line',horizontal:'Horizontal line',vertical:'Vertical line',ray:'Ray',fibonacci:'Fibonacci',rectangle:'Rectangle / zone',long:'Long position',short:'Short position',measure:'Measure',text:'Text / label',brush:'Brush',channel:'Parallel channel'};
    body.append(el('div',{class:'side-card'},el('h4',{},'Favorite drawing tools'),el('p',{},'Your pinned drawing tools are ready here and stay synchronized with the main drawing toolbar.')));
    const wrap=el('div',{class:'template-actions'});for(const id of this.state.drawingFavorites||[]){if(!labels[id])continue;wrap.append(el('button',{class:`secondary ${this.state.activeTool===id?'active':''}`,title:labels[id],onclick:()=>{this.setTool(id);this.renderRightPanel();}},`${icon(id)} ${labels[id]}`));}body.append(wrap);
    body.append(el('button',{class:'secondary',onclick:e=>this.openDrawingMenu(e.currentTarget)},'More drawing tools…'));
  }
  renderObjectTree(body){
    const drawings=this.state.drawings.filter(d=>d.paneId===this.activePane()?.id||d.syncAll);
    if(!drawings.length){body.append(el('div',{class:'empty-state'},'No drawings on this chart.'));return;}
    for(const d of drawings){
      const title=d.name||capitalize(d.type);
      const card=el('div',{class:'side-card object-tree-card'},
        el('div',{style:'display:flex;gap:6px;align-items:center;flex-wrap:wrap'},
          el('button',{class:'secondary',onclick:()=>{this.state.selectedDrawingId=d.id;this.state.selectedDrawingIds=[d.id];this.syncDrawingLayers();}},this.state.selectedDrawingId===d.id?'Selected':'Select'),
          el('strong',{style:'flex:1'},title),
          el('button',{class:'secondary',title:'Jump to object',onclick:()=>this.focusDrawing(d)},'Jump'),
          el('button',{class:'secondary',onclick:()=>{d.hidden=!d.hidden;this.activePane().renderOverlays();this.save();}},d.hidden?'Show':'Hide'),
          el('button',{class:'secondary',onclick:()=>{d.locked=!d.locked;this.syncDrawingLayers();this.save();}},d.locked?'Unlock':'Lock'),
          el('button',{class:'secondary',onclick:()=>{const n=prompt('Object name:',title)?.trim();if(n){d.name=n;this.save();this.renderRightPanel();}}},'Rename'),
          el('button',{class:'danger',onclick:()=>this.deleteDrawing(d.id)},'Delete')
        )
      );body.append(card);
    }
  }
  focusDrawing(d){
    const pane=this.panes.find(p=>p.id===d.paneId)||this.activePane();if(!pane||!d?.points?.length)return;
    const logicals=d.points.map(pt=>Number.isFinite(pt.logical)?pt.logical:pane.logicalForTime(pt.time)).filter(Number.isFinite);if(!logicals.length)return;
    const center=(Math.min(...logicals)+Math.max(...logicals))/2,span=Math.max(70,Math.max(...logicals)-Math.min(...logicals)+40);
    try{pane.chart.timeScale().setVisibleLogicalRange({from:center-span/2,to:center+span/2});}catch{}this.setActivePaneById(pane.id);
  }
  renderAlertsSide(body){body.append(el('button',{class:'primary',onclick:()=>this.openAlertModal()},'+ New alert'));for(const a of this.state.alerts)body.append(el('div',{class:'side-card'},el('h4',{},`${a.symbol} · ${a.condition}`),el('p',{},`${a.source} ${a.operator} ${a.value}`),el('button',{class:'danger',onclick:()=>{this.state.alerts=this.state.alerts.filter(x=>x.id!==a.id);this.renderRightPanel();this.renderBottom();this.save();}},'Delete')));}
  renderQuickSettings(body){body.append(toggleCard('Grid lines',this.state.gridH||this.state.gridV,()=>{this.state.gridH=!this.state.gridH;this.state.gridV=this.state.gridH;this.refreshAllCharts();}));body.append(toggleCard('Round-price major grid',this.state.majorRoundGrid,()=>{this.state.majorRoundGrid=!this.state.majorRoundGrid;this.refreshAllCharts();}));body.append(toggleCard('Quick trade',this.state.quickTrade,()=>this.toggleQuickTrade()));body.append(el('button',{class:'secondary',onclick:()=>this.openSettings('canvas')},'Open full chart settings'));}
  renderOps(body){body.innerHTML=`<div class="side-card"><h4>Frontend health</h4><p>Renderer: Trade Avata Native v3.2</p><p>Status: Healthy</p><p>Mode: ${this.state.connection.status.toUpperCase()}</p></div><div class="side-card"><h4>Broker gateway</h4><p>${this.state.connection.broker?'Configured':'Not connected'}</p><p>Real trading remains locked unless a secure backend confirms fresh broker data.</p></div>`;}
  renderBottom(){
    const p=$('#bottom-panel');p.classList.toggle('collapsed',!this.state.bottomOpen);p.style.height=this.state.bottomOpen?`${this.state.bottomHeight}px`:'30px';$('#chart-grid').style.bottom=this.state.bottomOpen?`${this.state.bottomHeight}px`:'30px';p.innerHTML='';p.append(el('div',{class:'bottom-resize'}));const tabs=el('div',{class:'bottom-tabs'});for(const t of ['orders','positions','analytics','replay','alerts','history'])tabs.append(el('button',{class:`bottom-tab ${this.state.bottomTab===t?'active':''}`,onclick:()=>this.openBottom(t)},capitalize(t),t==='positions'?el('span',{class:'bottom-badge'},this.positions.length):null));tabs.append(el('button',{class:'bottom-toggle',onclick:()=>this.toggleBottom()},this.state.bottomOpen?'⌄':'⌃'));p.append(tabs);if(!this.state.bottomOpen)return;const content=el('div',{class:'bottom-content'});p.append(content);if(this.state.bottomTab==='positions')this.renderPositions(content);else if(this.state.bottomTab==='analytics')this.renderAnalytics(content);else if(this.state.bottomTab==='replay')this.renderReplay(content);else if(this.state.bottomTab==='alerts')this.renderBottomAlerts(content);else if(this.state.bottomTab==='history')this.renderHistory(content);else this.renderOrders(content);
  }
  renderPositions(c){if(!this.positions.length){c.append(el('div',{class:'empty-state'},'No open positions.'));return;}const table=el('table',{class:'data-table'});table.innerHTML='<thead><tr><th>Symbol</th><th>Side</th><th>Size</th><th>Entry</th><th>Current</th><th>SL</th><th>TP</th><th>P&L</th><th>Actions</th></tr></thead>';const tb=el('tbody');for(const x of this.positions){const tr=el('tr');[x.symbol,x.side,x.size.toFixed(2),formatPrice(x.symbol,x.entry),formatPrice(x.symbol,x.current),formatPrice(x.symbol,x.sl),formatPrice(x.symbol,x.tp)].forEach((v,i)=>tr.append(el('td',{class:i===1?(x.side==='Buy'?'pos':'neg'):''},v)));tr.append(el('td',{class:x.pnl>=0?'pos':'neg'},`$${x.pnl.toFixed(2)}`));tr.append(el('td',{},el('button',{class:'secondary',onclick:()=>this.openPositionModify(x)},'Modify'),' ',el('button',{class:'danger',onclick:()=>this.requestClosePosition(x)},'Close')));tb.append(tr);}table.append(tb);c.append(table);}
  renderAnalytics(c){
    const trades=this.demoHistory,s=summarizeTrades(trades,10000);
    c.append(el('div',{class:'alert-row'},el('button',{class:'secondary',onclick:()=>this.openShareCenter('analytics')},'Share analytics'),el('span',{},'Share only the selected performance summary; private account details stay out.')));
    const metrics=[['Net P&L',money(s.net)],['Trades',String(s.totalTrades)],['Win rate',`${s.winRate.toFixed(1)}%`],['Profit factor',Number.isFinite(s.profitFactor)?s.profitFactor.toFixed(2):'∞'],['Max DD',money(-s.maxDD)],['Expectancy',money(s.expectancy)],['Avg win',money(s.avgWin)],['Avg loss',money(-s.avgLoss)]];
    const g=el('div',{class:'metrics-grid analytics-metrics'});metrics.forEach(([a,b])=>g.append(el('div',{class:'metric'},el('small',{},a),el('b',{class:b.startsWith('+')?'pos':b.startsWith('-')?'neg':''},b))));c.append(g);
    const tabs=el('div',{class:'analytics-tabs'});const panel=el('div',{class:'analytics-panel'});c.append(tabs,panel);
    const sections=['Summary','Performance','Trades','Symbols','Behaviour'];let active='Summary';
    const render=()=>{
      panel.innerHTML='';
      if(active==='Summary'){
        panel.append(el('div',{class:'side-card'},el('h4',{},'Account / replay summary'),el('p',{},`Starting balance: $10,000 · Current balance: ${money(s.currentBalance)} · Gross profit: ${money(s.grossProfit)} · Gross loss: ${money(-s.grossLoss)}`)));
        panel.append(simpleBars('Equity curve',s.equity.map(x=>x.value)));
      }else if(active==='Performance'){
        const side=[{key:'Long',trades:s.long.count,winRate:s.long.winRate,net:s.long.net},{key:'Short',trades:s.short.count,winRate:s.short.winRate,net:s.short.net}],hours=performanceByBucket(trades,'hour').map(x=>({...x,winRate:x.trades?x.wins/x.trades*100:0})).sort((a,b)=>b.net-a.net);panel.append(perfTable('Long vs short',side.map(x=>[x.key,x.trades,`${x.winRate.toFixed(1)}%`,money(x.net)])));panel.append(perfTable('Performance by hour',hours.slice(0,12).map(x=>[x.key,x.trades,`${x.winRate.toFixed(1)}%`,money(x.net)])));
      }else if(active==='Trades'){
        panel.append(tradeTable(trades));
      }else if(active==='Symbols'){
        const syms=profitabilityBySymbol(trades);panel.append(perfTable('Profitability by symbol',syms.map(x=>[x.symbol,x.trades,`${x.trades?x.wins/x.trades*100:0}%`,money(x.net)])));
      }else{
        for(const msg of behaviorInsights(trades))panel.append(el('div',{class:'side-card insight-card'},el('h4',{},'Trader insight'),el('p',{},msg)));
      }
    };
    for(const name of sections)tabs.append(el('button',{class:name===active?'active':'',onclick:e=>{active=name;tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===e.currentTarget));render();}},name));render();
  }
  renderReplay(c){
    const r=this.state.replay;
    c.append(el('div',{class:'side-card'},el('h4',{},'Replay controls moved onto the chart'),el('p',{},'Use the Replay button in the top toolbar. A vertical selector appears on the chart; scroll to the historical point you want and click it. Playback controls then stay over the chart so the chart does not shrink.')));
    c.append(el('div',{class:'replay-row'},el('label',{},'Data source ',select([['online','Online'],['local','Local demo']],r.mode||'online',v=>{r.mode=v;this.save();})),el('button',{class:'primary',onclick:()=>this.startReplaySelection()},'Select replay start'),el('button',{class:'secondary',onclick:()=>this.downloadOfflineReplay()},'Download offline package')));
  }
  renderBottomAlerts(c){c.append(el('div',{class:'alert-row'},el('button',{class:'primary',onclick:()=>this.openAlertModal()},'+ New alert'),el('span',{},`${this.state.alerts.length} active alert rule(s)`)));if(this.state.alerts.length){const table=el('table',{class:'data-table'});table.innerHTML='<thead><tr><th>Symbol</th><th>Source</th><th>Condition</th><th>Value</th><th>Frequency</th></tr></thead>';const tb=el('tbody');this.state.alerts.forEach(a=>{const tr=el('tr');[a.symbol,a.source,`${a.condition} ${a.operator}`,a.value,a.frequency].forEach(v=>tr.append(el('td',{},v)));tb.append(tr)});table.append(tb);c.append(table);}}
  renderHistory(c){c.innerHTML='<div class="side-card"><h4>Trade & replay history</h4><p>History is empty in this standalone preview. When a broker gateway is connected, confirmed executions will populate here.</p></div>';}
  renderOrders(c){if(!this.orders.length){c.append(el('div',{class:'empty-state'},'No pending orders.'));return;}const table=el('table',{class:'data-table'});table.innerHTML='<thead><tr><th>Symbol</th><th>Side</th><th>Type</th><th>Size</th><th>Price</th><th>SL</th><th>TP</th><th>Status</th><th>Action</th></tr></thead>';const tb=el('tbody');for(const o of this.orders){const tr=el('tr');[o.symbol,o.side,o.type||'Market',Number(o.size||0).toFixed(2),o.price==null?'Market':formatPrice(o.symbol,o.price),o.sl==null?'—':formatPrice(o.symbol,o.sl),o.tp==null?'—':formatPrice(o.symbol,o.tp),o.status||'DEMO'].forEach((v,i)=>tr.append(el('td',{class:i===1?(o.side==='Buy'?'pos':'neg'):''},v)));tr.append(el('td',{},el('button',{class:'danger',onclick:()=>this.cancelOrder(o)},'Cancel')));tb.append(tr);}table.append(tb);c.append(table);}
  renderMobileDock(){const d=$('#mobile-dock');d.innerHTML='';[['tools','Draw','✎'],['ind','Indicators','ƒx'],['trade','Trade','↕'],['replay','Replay','◀'],['more','More','•••']].forEach(([id,label,ic])=>d.append(el('button',{onclick:e=>{if(id==='tools')this.toggleMobileTools(e.currentTarget);else if(id==='ind')this.openIndicatorMenu(e.currentTarget);else if(id==='trade')this.toggleQuickTrade();else if(id==='replay')this.startReplaySelection();else this.openMore();}},el('b',{},ic),label)));}
  applyLayout(layout,save=true){
    const grid=$('#chart-grid');const counts={'1':1,'2h':2,'2v':2,'3a':3,'3b':3,'4':4};const count=counts[layout]||1;
    this.state.layout=layout;
    const old=this.panes.map(p=>({symbol:p.symbol,timeframe:p.timeframe,chartType:p.chartType,period:cloneSerializable(p.period),detached:p.detached}));
    this.panes.forEach(p=>p.destroy());this.panes=[];grid.innerHTML='';grid.className=`chart-grid layout-${layout}`;
    for(let i=0;i<count;i++){
      const cfg=this.state.paneConfigs[i]||old[i]||old[0]||{symbol:this.state.symbol,chartType:this.state.chartType,period:cloneSerializable(this.state.period)};
      const pane=new ChartPane(this,`pane-${i}`,cfg);
      this.panes.push(pane);grid.append(pane.root);pane.mount();this.attachQuickTrade(pane);
    }
    this.state.activePane=Math.min(this.state.activePane,count-1);this.updateActivePaneStyle();this.syncPaneConfigs();
    this.installLayoutSplitters();if(save)this.save();setTimeout(()=>this.panes.forEach(p=>p.resize()),40);this.renderTopbar();
  }
  installLayoutSplitters(){
    const grid=$('#chart-grid');grid.querySelectorAll('.layout-splitter').forEach(x=>x.remove());
    const layout=this.state.layout;const add=(axis,pos='50%')=>{const sp=el('div',{class:`layout-splitter ${axis}`});if(axis==='vertical')sp.style.left=pos;else sp.style.top=pos;grid.append(sp);sp.addEventListener('pointerdown',e=>{e.preventDefault();sp.setPointerCapture?.(e.pointerId);const r=grid.getBoundingClientRect();const move=ev=>{if(axis==='vertical'){const pct=clamp((ev.clientX-r.left)/r.width*100,18,82);if(layout==='2h'||layout==='4')grid.style.gridTemplateColumns=`${pct}% ${100-pct}%`;else if(layout==='3a')grid.style.gridTemplateColumns=`${pct}% ${100-pct}%`;sp.style.left=`${pct}%`;}else{const pct=clamp((ev.clientY-r.top)/r.height*100,18,82);if(layout==='2v'||layout==='4')grid.style.gridTemplateRows=`${pct}% ${100-pct}%`;else if(layout==='3b')grid.style.gridTemplateRows=`${pct}% ${100-pct}%`;sp.style.top=`${pct}%`;}this.panes.forEach(p=>p.resize());};const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);});};
    if(layout==='2h'||layout==='3a')add('vertical');if(layout==='2v'||layout==='3b')add('horizontal');if(layout==='4'){add('vertical');add('horizontal');}
  }
  attachQuickTrade(pane){
    const last=pane.displayBars?.at(-1)?.close||0,cfg=SYMBOLS[pane.symbol]||SYMBOLS.XAUUSD,spread=Math.max(cfg.minMove*2,last*.00002),sell=last-spread/2,buy=last+spread/2;
    const q=el('div',{class:`quick-trade ${this.state.quickTrade?'':'hidden'}`},
      el('button',{class:'qt-sell',onclick:()=>this.previewOrder('Sell',pane)},el('small',{},'SELL'),el('b',{class:'qt-price'},formatPrice(pane.symbol,sell))),
      el('button',{class:'qt-mid',title:'Open risk / size settings',onclick:()=>this.openSettings('trading')},el('small',{},this.state.tradeSizeMode==='risk'?'RISK %':'SIZE'),el('b',{},this.state.tradeSizeMode==='risk'?`${this.state.riskPercent}%`:`${this.state.fixedLots}`),el('em',{},this.state.tradeSizeMode==='risk'?'auto lots':'lots')),
      el('button',{class:'qt-buy',onclick:()=>this.previewOrder('Buy',pane)},el('small',{},'BUY'),el('b',{class:'qt-price'},formatPrice(pane.symbol,buy)))
    );pane.root.append(q);
  }
  updateQuickTrade(){this.panes.forEach(p=>{const q=p.root.querySelector('.quick-trade');if(!q)return;q.classList.toggle('hidden',!this.state.quickTrade);const b=q.querySelector('.qt-mid b'),sm=q.querySelector('.qt-mid small'),em=q.querySelector('.qt-mid em');if(b)b.textContent=this.state.tradeSizeMode==='risk'?`${this.state.riskPercent}%`:`${this.state.fixedLots}`;if(sm)sm.textContent=this.state.tradeSizeMode==='risk'?'RISK %':'SIZE';if(em)em.textContent=this.state.tradeSizeMode==='risk'?'auto lots':'lots';const last=p.displayBars?.at(-1)?.close||0,cfg=SYMBOLS[p.symbol]||SYMBOLS.XAUUSD,spread=Math.max(cfg.minMove*2,last*.00002);const ps=q.querySelectorAll('.qt-price');if(ps[0])ps[0].textContent=formatPrice(p.symbol,last-spread/2);if(ps[1])ps[1].textContent=formatPrice(p.symbol,last+spread/2);});}
  activePane(){return this.panes[this.state.activePane]||this.panes[0];}
  activeConfig(){
    const p=this.activePane();
    return p?{symbol:p.symbol,timeframe:p.timeframe,chartType:p.chartType,period:cloneSerializable(p.period)}:
      {symbol:this.state.symbol,timeframe:this.state.timeframe,chartType:this.state.chartType,period:cloneSerializable(this.state.period)};
  }
  setActivePaneById(id){const i=this.panes.findIndex(p=>p.id===id);if(i>=0){this.state.activePane=i;this.updateActivePaneStyle();this.renderTopbar();this.renderRightPanel();}}
  updateActivePaneStyle(){this.panes.forEach((p,i)=>p.root.classList.toggle('active-pane',i===this.state.activePane));}
  setSymbol(sym){
    const p=this.activePane();if(!p)return;p.setConfig({symbol:sym},{home:true});
    if(this.state.layoutSync.symbol)this.panes.filter(x=>x!==p).forEach(x=>x.setConfig({symbol:sym},{home:true}));
    this.syncPaneConfigs();this.closeMenu();this.renderTopbar();this.renderRightPanel();this.save();
  }
  registerTransitionHook(phase,fn){
    if(!['before','after'].includes(phase)||typeof fn!=='function')return()=>{};
    this.transitionHooks=this.transitionHooks||{before:[],after:[]};
    this.transitionHooks[phase].push(fn);
    return()=>{this.transitionHooks[phase]=this.transitionHooks[phase].filter(x=>x!==fn);};
  }
  runTransitionHooks(phase,context){
    const hooks=this.transitionHooks?.[phase]||[];
    for(const fn of hooks){try{fn(context);}catch(err){console.warn(`Trade Avata ${phase} transition hook failed`,err);}}
  }
  applyChartTransition(nextConfig={},options={}){
    const p=this.activePane();if(!p)return null;
    const current={chartType:p.chartType,period:clonePeriod(p.period)};
    const requestedPeriod=nextConfig.period!=null?clonePeriod(nextConfig.period):clonePeriod(p.period);
    const requestedType=nextConfig.chartType??p.chartType;
    const resolved=resolveConstruction({chartType:requestedType,period:requestedPeriod});
    const target={chartType:resolved.chartType,period:resolved.period};
    const sameConstruction=isSameConstruction(current,target);
    const preserveView=options.preserveView??sameConstruction;
    const home=options.home??!preserveView;
    const closeMenu=options.closeMenu!==false;
    const context={app:this,pane:p,current,target,construction:resolved.construction,preserveView,home,reason:options.reason||'chart-transition'};

    this.runTransitionHooks('before',context);
    p.setConfig(target,{home,preserveView});

    if(this.state.layoutSync.timeframe){
      this.panes.filter(x=>x!==p).forEach(x=>{
        const otherCurrent={chartType:x.chartType,period:clonePeriod(x.period)};
        const otherResolved=resolveConstruction({chartType:x.chartType,period:resolved.period});
        x.setConfig({chartType:otherResolved.chartType,period:otherResolved.period},{home:!isSameConstruction(otherCurrent,otherResolved),preserveView:isSameConstruction(otherCurrent,otherResolved)});
      });
    }

    this.state.chartType=resolved.chartType;
    this.state.period=cloneSerializable(resolved.period);
    if(resolved.period.mode==='time')this.state.timeframe=resolved.period.value;
    if(resolved.period.mode==='renko-pips')this.state.periodSettings.renkoPips=Number(resolved.period.value)||this.state.periodSettings.renkoPips;
    if(resolved.period.mode==='renko-time')this.state.periodSettings.renkoTime=String(resolved.period.value||this.state.periodSettings.renkoTime);
    if(resolved.period.mode==='range-pips')this.state.periodSettings.rangePips=Number(resolved.period.value)||this.state.periodSettings.rangePips;

    this.syncPaneConfigs();
    if(closeMenu)this.closeMenu();
    this.renderTopbar();
    this.save();

    requestAnimationFrame(()=>{
      this.runTransitionHooks('after',context);
      globalThis.__tradeAvataChartQuality?.record?.('construction_switch',{
        from:`${current.chartType}:${current.period.mode}:${current.period.value}`,
        to:`${resolved.chartType}:${resolved.period.mode}:${resolved.period.value}`,
        construction:resolved.construction
      });
    });
    return context;
  }
  setTimeframe(tf){return this.applyChartTransition({period:{mode:'time',value:tf}},{reason:'timeframe'});}
  setPeriod(period){return this.applyChartTransition({period},{reason:'period'});}
  setChartType(type){
    const p=this.activePane();if(!p)return null;
    if(type==='Renko')return this.applyChartTransition({chartType:'Candles',period:{mode:'renko-pips',value:Number(this.state.periodSettings?.renkoPips)||5}},{reason:'chart-type'});
    if(type==='Range')return this.applyChartTransition({chartType:'Candles',period:{mode:'range-pips',value:Number(this.state.periodSettings?.rangePips)||5}},{reason:'chart-type'});
    const period=['Candles','Heikin-Ashi','Bars','Line','Area'].includes(type)&&p.period?.mode!=='time'?{mode:'time',value:this.state.timeframe||p.timeframe||'15s'}:p.period;
    return this.applyChartTransition({chartType:type,period},{reason:'chart-type'});
  }
  setConstruction(chartType,period,options={}){return this.applyChartTransition({chartType,period},{...options,reason:options.reason||'construction-menu'});}
  syncPaneConfigs(){this.state.paneConfigs=this.panes.map(p=>({symbol:p.symbol,timeframe:p.timeframe,chartType:p.chartType,period:cloneSerializable(p.period),detached:!!p.detached}));}
  setTool(id,{preserveSelection=false}={}){
    if(id==='magnet'){
      const order=['off','weak','strong'],cur=this.state.magnetMode||'off',next=order[(order.indexOf(cur)+1)%order.length];
      this.state.magnetMode=next;this.state.magnet=next!=='off';toast(`Magnet ${next}`);
    }else if(id==='hide'){
      this.state.drawings.forEach(d=>d.hidden=!d.hidden);this.refreshDrawingLayers();
    }else if(id==='lock'){
      this.toggleSelectedDrawingLock();
    }else{
      this.state.activeTool=id;
      if(id==='cursor'&&!preserveSelection){this.state.selectedDrawingId=null;this.state.selectedDrawingIds=[];}
    }
    this.renderLeftbar();this.panes.forEach(p=>p.updateCursorMode?.());this.syncDrawingLayers();this.save();
  }
  toggleMobileTools(anchor=$('#mobile-dock button')){this.openDrawingMenu(anchor,true);}
  openDrawingMenu(anchor,mobile=false){
    const cls=mobile?'drawing-sheet':'drawing-menu';
    if(this.menu?.classList?.contains(cls)){this.closeMenu();return;}
    const tools=[['cursor','Mouse / Pointer'],['crosshair','Crosshair'],['crossline','Cross line'],['trend','Trend'],['horizontal','Horizontal'],['vertical','Vertical'],['ray','Ray'],['fibonacci','Fibonacci'],['rectangle','Rectangle'],['long','Long position'],['short','Short position'],['measure','Measure'],['text','Text'],['brush','Brush'],['highlighter','Highlighter'],['channel','Channel'],['arrow','Arrow']];
    const menu=this.createMenu(anchor,mobile?300:250,cls);menu.append(el('div',{class:'menu-title'},'Drawing tools'));
    const grid=el('div',{class:'drawing-tool-grid'});for(const [id,label] of tools){grid.append(el('button',{class:`drawing-tool-card ${this.state.activeTool===id?'active':''}`,onclick:()=>{this.setTool(id);this.closeMenu();}},el('b',{},icon(id)),el('span',{},label)));}menu.append(grid);
    menu.append(el('div',{class:'menu-divider'}));
    menu.append(checkMenu('Keep drawing',this.state.keepDrawing,v=>{this.state.keepDrawing=v;this.renderLeftbar();this.save();}));
    const mag=el('div',{class:'menu-title'},'Magnet snapping');menu.append(mag);
    for(const [mode,label] of [['off','Off'],['weak','Weak magnet'],['strong','Strong magnet']])menu.append(el('button',{class:`menu-item ${this.state.magnetMode===mode?'active':''}`,onclick:()=>{this.state.magnetMode=mode;this.state.magnet=mode!=='off';this.renderLeftbar();this.save();this.closeMenu();}},label));
  }
  syncDrawingLayers(){this.panes.forEach(p=>p.drawingLayer?.syncPointerMode());this.refreshDrawingLayers();this.renderRightPanel();}
  refreshDrawingLayers(){this.panes.forEach(p=>p.renderOverlays());}
  handleDrawingChange(ev,pane){
    if(ev.type==='add'){
      this.pushDrawingHistory('draw');
      this.state.drawings.push(ev.drawing);this.state.selectedDrawingId=ev.drawing.id;this.state.selectedDrawingIds=[ev.drawing.id];
      toast(`${capitalize(ev.drawing.type)} added`,'success');
    }else if(ev.type==='delete'){this.deleteDrawing(ev.id);return;}
    else if(ev.type==='commit-drag'){
      if(ev.before)this.state.undoStack.push({label:'move drawing',drawings:cloneSerializable(this.state.drawings.map(d=>d.id===ev.id?{...d,points:ev.before}:d))});
      else this.pushDrawingHistory('move drawing');
      this.state.redoStack=[];
    }
    this.save();this.refreshDrawingLayers();if(this.state.rightPanel==='objects')this.renderRightPanel();
  }
  pushDrawingHistory(label){this.state.undoStack.push({label,drawings:cloneSerializable(this.state.drawings)});if(this.state.undoStack.length>80)this.state.undoStack.shift();this.state.redoStack=[];}
  deleteDrawing(id){this.pushDrawingHistory('delete drawing');this.state.drawings=this.state.drawings.filter(d=>d.id!==id);this.state.selectedDrawingIds=(this.state.selectedDrawingIds||[]).filter(x=>x!==id);if(this.state.selectedDrawingId===id)this.state.selectedDrawingId=null;this.save();this.syncDrawingLayers();}
  deleteSelectedDrawings(){const ids=new Set(this.state.selectedDrawingIds?.length?this.state.selectedDrawingIds:(this.state.selectedDrawingId?[this.state.selectedDrawingId]:[]));if(!ids.size)return;this.pushDrawingHistory('delete drawing');this.state.drawings=this.state.drawings.filter(d=>!ids.has(d.id));this.state.selectedDrawingIds=[];this.state.selectedDrawingId=null;this.save();this.syncDrawingLayers();}
  duplicateSelectedDrawing(){const d=this.state.drawings.find(x=>x.id===this.state.selectedDrawingId);if(!d)return;this.pushDrawingHistory('duplicate drawing');const c=cloneSerializable(d);c.id=`draw-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;c.points=c.points.map(p=>this.activePane().shiftPoint(p,4));this.state.drawings.push(c);this.state.selectedDrawingId=c.id;this.state.selectedDrawingIds=[c.id];this.save();this.syncDrawingLayers();}
  toggleSelectedDrawingLock(){const ids=new Set(this.state.selectedDrawingIds?.length?this.state.selectedDrawingIds:(this.state.selectedDrawingId?[this.state.selectedDrawingId]:[]));if(!ids.size)return;this.pushDrawingHistory('drawing lock');const anyUnlocked=this.state.drawings.some(d=>ids.has(d.id)&&!d.locked);this.state.drawings.forEach(d=>{if(ids.has(d.id))d.locked=anyUnlocked;});this.save();this.syncDrawingLayers();}
  openQuickDrawingColor(){const d=this.state.drawings.find(x=>x.id===this.state.selectedDrawingId);if(!d)return;const next=prompt('Drawing color (hex):',d.style?.color||'#7cc8ff');if(!next)return;this.pushDrawingHistory('drawing color');d.style=d.style||{};d.style.color=next;this.save();this.refreshDrawingLayers();}
  openSelectedDrawingMore(anchor){this.openMenu(anchor,[{label:'Share selected',action:()=>this.shareSelectedDrawing()},{label:'Duplicate',action:()=>this.duplicateSelectedDrawing()},{label:'Settings…',action:()=>this.openDrawingSettings(this.state.selectedDrawingId)},{label:'Lock / unlock',action:()=>this.toggleSelectedDrawingLock()},{label:'Delete selected',action:()=>this.deleteSelectedDrawings()}],210);}
  undo(){const snap=this.state.undoStack.pop();if(!snap){toast('Nothing to undo');return;}this.state.redoStack.push({label:'redo',drawings:cloneSerializable(this.state.drawings)});this.state.drawings=cloneSerializable(snap.drawings);this.state.selectedDrawingId=null;this.state.selectedDrawingIds=[];this.save();this.syncDrawingLayers();toast(`Undo: ${snap.label}`);}
  redo(){const snap=this.state.redoStack.pop();if(!snap){toast('Nothing to redo');return;}this.state.undoStack.push({label:'undo',drawings:cloneSerializable(this.state.drawings)});this.state.drawings=cloneSerializable(snap.drawings);this.state.selectedDrawingId=null;this.state.selectedDrawingIds=[];this.save();this.syncDrawingLayers();toast('Redo');}
  openSymbolMenu(anchor){const items=this.state.watchlist.map(sym=>({label:`${sym}  ·  ${SYMBOLS[sym].name}`,active:this.activeConfig().symbol===sym,action:()=>this.setSymbol(sym)}));this.openMenu(anchor,items,220);}
  openTimeframeMenu(anchor){
    const menu=this.createMenu(anchor,320,window.innerWidth<=780?'interval-sheet':'period-menu');
    menu.append(el('div',{class:'sheet-head'},el('strong',{},'Bar periods'),el('button',{class:'panel-close',onclick:()=>this.closeMenu()},'×')));
    const tabs=el('div',{class:'period-tabs'});
    const modes=[['time','Time'],['tick','Ticks'],['renko-pips','Renko Pips'],['renko-time','Renko Time'],['range-pips','Range Pips']];
    const content=el('div',{class:'period-content'});
    const renderMode=mode=>{
      tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.mode===mode));content.innerHTML='';
      const addPeriod=(period,label)=>{
        const key=periodKey(period),active=periodKey(this.activeConfig().period)===key,fav=this.state.favoritePeriods.some(x=>periodKey(x)===key);
        const row=el('button',{class:`period-row ${active?'active':''}`,onclick:()=>this.setPeriod(period)},el('span',{},label||describePeriod(period)));
        const star=el('span',{class:`star ${fav?'on':''}`,onclick:e=>{e.stopPropagation();this.toggleFavoritePeriod(period);}},fav?'★':'☆');row.append(star);content.append(row);
      };
      if(mode==='time'){
        content.append(el('button',{class:'menu-item',onclick:()=>this.openCustomInterval()},'＋ Add custom interval…'));
        for(const [name,arr] of [['Seconds',TIMEFRAMES.filter(([k])=>k.endsWith('s'))],['Minutes',TIMEFRAMES.filter(([k])=>k.endsWith('m'))],['Hours',TIMEFRAMES.filter(([k])=>k.endsWith('h'))],['Days / weeks / months',TIMEFRAMES.filter(([k])=>['1D','1W','1M'].includes(k))]]){
          content.append(el('div',{class:'menu-title'},name));for(const [tf,label] of arr)addPeriod({mode:'time',value:tf},label);
        }
      }else if(mode==='tick'){
        content.append(el('p',{class:'sheet-help'},'Tick charts in this standalone preview use approximated micro-batches. Real broker ticks replace this in production.'));
        TICK_PERIODS.forEach(v=>addPeriod({mode:'tick',value:v},`${v} ticks`));
      }else if(mode==='renko-pips'){
        content.append(el('p',{class:'sheet-help'},'cTrader-style price Renko. Continuation = 1 brick; reversal = 2 brick distances. Production uses broker ticks.'));
        RENKO_PIP_PERIODS.forEach(v=>addPeriod({mode:'renko-pips',value:v},`${v} pips`));
      }else if(mode==='renko-time'){
        content.append(el('p',{class:'sheet-help'},'Trade Avata Renko Time is separate from cTrader native Renko. It evaluates Renko thresholds at each selected time bucket.'));
        RENKO_TIME_PERIODS.forEach(v=>addPeriod({mode:'renko-time',value:v},`Renko Time · ${v}`));
      }else{
        content.append(el('p',{class:'sheet-help'},'Range bars use a fixed high-to-low range in pips.'));
        RANGE_PIP_PERIODS.forEach(v=>addPeriod({mode:'range-pips',value:v},`${v} pips`));
      }
    };
    for(const [mode,label] of modes)tabs.append(el('button',{'data-mode':mode,class:this.activeConfig().period.mode===mode?'active':'',onclick:()=>renderMode(mode)},label));
    menu.append(tabs,content);renderMode(this.activeConfig().period.mode||'time');
  }
  openMobileIntervalMenu(anchor){this.openTimeframeMenu(anchor);}
  openChartTypeMenu(anchor){
    this.openMenu(anchor,['Candles','Bars','Line','Area','Heikin-Ashi','Renko','Range'].map(t=>({label:t,active:this.activeConfig().chartType===t,action:()=>this.setChartType(t)})),190);
  }
  openIndicatorMenu(anchor){this.openIndicatorBrowser(anchor);}
  openIndicatorBrowser(anchor){
    this.closeMenu();const m=this.makeModal('Indicators','indicator-browser-modal');m.main.className='modal-main single';const body=el('div',{class:'indicator-browser'});m.main.replaceChildren(body);m.ok.style.display='none';m.cancel.textContent='Close';
    const head=el('div',{class:'indicator-browser-head'});const search=el('input',{class:'field indicator-search',placeholder:'Search indicators…'});head.append(search);body.append(head);
    const tabs=el('div',{class:'indicator-browser-tabs'});
    const list=el('div',{class:'indicator-browser-list'});body.append(tabs,list);
    const cats=['All','Favorites',...new Set(BUILTIN_INDICATORS.map(x=>x.category))];let cat='All';
    const render=()=>{list.innerHTML='';const q=(search.value||'').trim().toLowerCase();const rows=BUILTIN_INDICATORS.filter(d=>(cat==='All'||(cat==='Favorites'&&this.state.indicatorFavorites.includes(d.kind))||d.category===cat)&&(!q||`${d.name} ${d.short} ${d.category}`.toLowerCase().includes(q)));for(const d of rows){const fav=this.state.indicatorFavorites.includes(d.kind);const row=el('div',{class:'indicator-browser-row'},el('button',{class:'indicator-main',onclick:()=>{this.addBuiltInIndicator(d.kind);this.openIndicatorBrowser();}},el('strong',{},d.name),el('small',{},`${d.short} · ${d.category}`)),el('button',{class:`indicator-star ${fav?'on':''}`,title:'Favorite',onclick:()=>{this.toggleIndicatorFavorite(d.kind);render();}},fav?'★':'☆'));list.append(row);}if(!rows.length)list.append(el('div',{class:'empty-state'},'No indicators found.'));};
    cats.forEach(c=>tabs.append(el('button',{class:c===cat?'active':'',onclick:e=>{cat=c;tabs.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===e.currentTarget));render();}},c)));search.addEventListener('input',render);render();
  }
  addBuiltInIndicator(kind){
    const d=indicatorDefinition(kind);if(!d)return;const colors=this.state.indicatorPalette;const spec=makeIndicator(kind,{color:colors[this.state.indicators.length%colors.length]});const gate=validateIndicatorSpec(spec);
    if(!gate.ok){toast(`Indicator blocked: ${gate.errors.join(' ')}`,'error');return;}this.state.indicators.push(spec);this.refreshAllCharts();this.save();toast(`${d.name} added`,'success');
  }
  toggleIndicatorFavorite(kind){const a=this.state.indicatorFavorites;this.state.indicatorFavorites=a.includes(kind)?a.filter(x=>x!==kind):[...a,kind];this.save();}
  openLayoutMenu(anchor){
    this.closeMenu();const menu=this.createMenu(anchor,300,'layout-picker');menu.append(el('div',{class:'menu-title'},'Choose layout'));
    const g=el('div',{class:'layout-grid'});
    [['1','Single','li1',1],['2h','2 side-by-side','li2h',2],['2v','2 stacked','li2v',2],['3a','3 · large left','li3a',3],['3b','3 · large top','li3a',3],['4','4 grid','li4',4]].forEach(([id,label,cls,count])=>{
      const b=el('button',{class:`layout-option ${this.state.layout===id?'active':''}`,title:label,onclick:()=>{this.applyLayout(id);this.closeMenu();}});
      const ic=el('div',{class:`layout-icon ${cls}`});for(let i=0;i<count;i++)ic.append(el('span'));b.append(ic);g.append(b);
    });
    menu.append(g,el('div',{class:'menu-divider'}),el('div',{class:'menu-title'},'Synchronize'));
    for(const [key,label] of [['symbol','Symbol'],['timeframe','Period / timeframe'],['crosshair','Crosshair'],['time','Time / scroll'],['drawings','Drawings']])menu.append(checkMenu(label,this.state.layoutSync[key],v=>{this.state.layoutSync[key]=v;this.save();}));
    menu.append(el('div',{class:'menu-divider'}));
    menu.append(el('button',{class:'menu-item',onclick:()=>this.detachActiveChart()},this.detachedInfo.detached?'↩ Reattach / close detached chart':'↗ Detach active chart'));
    menu.append(el('button',{class:'menu-item',onclick:()=>this.openWorkspaceManager()},'▦ Saved workspaces…'));
  }
  openTemplateMenu(anchor){
    this.closeMenu();const menu=this.createMenu(anchor,285,'template-menu');menu.append(el('div',{class:'menu-title'},'Chart templates'));
    menu.append(el('button',{class:'menu-item primaryish',onclick:()=>this.openSaveTemplateModal()},'＋ Save current as template'));
    if(this.state.chartTemplates?.length){menu.append(el('div',{class:'menu-divider'}));for(const tpl of this.state.chartTemplates){const row=el('div',{class:'template-menu-row'});const apply=el('button',{class:`menu-item template-apply ${this.state.activeChartTemplateId===tpl.id?'active':''}`,onclick:()=>this.applyChartTemplate(tpl.id)},el('span',{},tpl.name),el('small',{},tpl.includePeriod&&tpl.config?.period?`${tpl.config.chartType} · ${periodLabel(tpl.config.period)}`:tpl.config?.chartType||'Chart'));const edit=el('button',{class:'template-kebab',title:'Template actions',onclick:e=>{e.stopPropagation();this.openTemplateManager();}},'⋮');row.append(apply,edit);menu.append(row);}}else menu.append(el('div',{class:'menu-empty'},'No saved templates yet.'));
    menu.append(el('div',{class:'menu-divider'}));menu.append(el('button',{class:'menu-item',onclick:()=>this.openTemplateManager()},'Manage templates…'));
  }
  openSaveTemplateModal(existingId=null){
    this.closeMenu();const existing=this.state.chartTemplates.find(t=>t.id===existingId)||null;const m=this.makeModal(existing?'Overwrite chart template':'Save chart template');const body=el('div',{class:'settings-body'});m.main.replaceChildren(body);let name=existing?.name||`Template ${this.state.chartTemplates.length+1}`,includePeriod=existing?.includePeriod||false;
    const nameField=textInput(name,v=>name=v);body.append(setting('Template name',nameField,'Use a clear name such as Gold Scalping, Trend Setup or Clean Price Action.'));
    body.append(setting('Include period',check(includePeriod,v=>includePeriod=v),'Off by default so the same template can be reused on any Time, Tick, Renko or Range period.'));
    body.append(el('div',{class:'side-card'},el('h4',{},'Saved in this template'),el('p',{},'Indicators and their parameters · chart type · candle and wick colours · grid and crosshair settings · chart scale/margins · visible overlays · quick-trade visibility and sizing setup · drawing favourites. Symbol, broker account, alerts, orders, positions and existing drawings are not stored in a chart template.')));
    m.ok.textContent=existing?'Overwrite':'Save template';m.ok.onclick=()=>{name=String(name||'').trim();if(!name){toast('Enter a template name.','error');return;}const dup=this.state.chartTemplates.find(t=>t.name.toLowerCase()===name.toLowerCase()&&t.id!==existingId);if(dup&&!confirm(`A template named "${name}" already exists. Save another with the same name?`))return;const snap=captureChartTemplate(this.state,{name,chartType:this.activeConfig().chartType,period:this.activeConfig().period,includePeriod});if(existing){snap.id=existing.id;snap.createdAt=existing.createdAt||snap.createdAt;this.state.chartTemplates=this.state.chartTemplates.map(t=>t.id===existing.id?snap:t);}else this.state.chartTemplates.push(snap);this.state.activeChartTemplateId=snap.id;this.save();this.closeModal();this.renderTopbar();toast(`Template "${name}" saved`,'success');};setTimeout(()=>{nameField.focus?.();nameField.select?.();},0);
  }
  applyChartTemplate(id){
    const tpl=this.state.chartTemplates.find(t=>t.id===id);if(!tpl){toast('Template not found.','error');return;}
    applyChartTemplateToState(this.state,tpl);const p=this.activePane();
    if(p){const cfg={chartType:tpl.config?.chartType||p.chartType};if(tpl.includePeriod&&tpl.config?.period)cfg.period=tpl.config.period;p.setConfig(cfg,{home:true});if(cfg.period&&this.state.layoutSync.timeframe)this.panes.filter(x=>x!==p).forEach(x=>x.setConfig({period:cfg.period},{home:true}));}
    this.syncPaneConfigs();this.refreshAllCharts();this.closeMenu();this.closeModal();toast(`Template "${tpl.name}" applied`,'success');
  }
  openTemplateActions(tpl,anchor){
    this.closeMenu();this.openMenu(anchor,[{label:'Apply',action:()=>this.applyChartTemplate(tpl.id)},{label:'Overwrite with current chart',action:()=>this.openSaveTemplateModal(tpl.id)},{label:'Rename',action:()=>this.renameChartTemplate(tpl.id)},{label:'Duplicate',action:()=>this.duplicateChartTemplate(tpl.id)},{label:'Delete',action:()=>this.deleteChartTemplate(tpl.id)}],230);
  }
  renameChartTemplate(id){const tpl=this.state.chartTemplates.find(t=>t.id===id);if(!tpl)return;const name=prompt('Rename chart template:',tpl.name)?.trim();if(!name)return;tpl.name=name;tpl.updatedAt=new Date().toISOString();this.save();this.openTemplateManager();toast('Template renamed','success');}
  duplicateChartTemplate(id){const tpl=this.state.chartTemplates.find(t=>t.id===id);if(!tpl)return;const copy=cloneSerializable(tpl);copy.id=`tpl-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;copy.name=`${tpl.name} Copy`;copy.createdAt=new Date().toISOString();copy.updatedAt=copy.createdAt;this.state.chartTemplates.push(copy);this.save();this.openTemplateManager();toast('Template duplicated','success');}
  deleteChartTemplate(id){const tpl=this.state.chartTemplates.find(t=>t.id===id);if(!tpl)return;if(!confirm(`Delete template "${tpl.name}"?`))return;this.state.chartTemplates=this.state.chartTemplates.filter(t=>t.id!==id);if(this.state.activeChartTemplateId===id)this.state.activeChartTemplateId=null;this.save();this.openTemplateManager();toast('Template deleted');}
  openTemplateManager(){
    this.closeMenu();this.closeModal();const m=this.makeModal('Chart Templates','template-manager-modal');const body=el('div',{class:'settings-body'});m.main.replaceChildren(body);m.ok.style.display='none';m.cancel.textContent='Close';body.append(el('div',{class:'side-card'},el('h4',{},'Reusable chart setups'),el('p',{},'Save an indicator/chart setup once, give it a name, and apply it again later without rebuilding the chart. Templates are stored locally in this package; Trade Avata account cloud sync can replace this storage when Firebase is connected.')));body.append(el('button',{class:'primary',onclick:()=>this.openSaveTemplateModal()},'＋ Save current chart as template'));
    if(!this.state.chartTemplates.length){body.append(el('div',{class:'empty-state'},'No chart templates saved yet.'));return;}
    for(const tpl of this.state.chartTemplates){const meta=tpl.includePeriod&&tpl.config?.period?`${tpl.config?.chartType||'Chart'} · ${periodLabel(tpl.config.period)}`:(tpl.config?.chartType||'Chart');const card=el('div',{class:'side-card template-card'},el('div',{style:'display:flex;justify-content:space-between;gap:12px;align-items:flex-start'},el('div',{},el('h4',{},tpl.name),el('p',{},`${meta} · ${tpl.config?.indicators?.length||0} indicator(s)`),el('small',{},`Updated ${new Date(tpl.updatedAt||tpl.createdAt).toLocaleString()}`)),this.state.activeChartTemplateId===tpl.id?el('span',{class:'status-badge'},'ACTIVE'):null));const actions=el('div',{class:'template-actions'},el('button',{class:'primary',onclick:()=>this.applyChartTemplate(tpl.id)},'Apply'),el('button',{class:'secondary',onclick:()=>this.openSaveTemplateModal(tpl.id)},'Overwrite'),el('button',{class:'secondary',onclick:()=>this.renameChartTemplate(tpl.id)},'Rename'),el('button',{class:'secondary',onclick:()=>this.duplicateChartTemplate(tpl.id)},'Duplicate'),el('button',{class:'danger',onclick:()=>this.deleteChartTemplate(tpl.id)},'Delete'));card.append(actions);body.append(card);}
  }
  openMore(){
    const anchor=(window.innerWidth<=780?$('#mobile-dock button:last-child'):$('#right-rail .rail-btn:last-child'))||$('#topbar');
    const items=[
      {label:'Market Intelligence',action:()=>this.toggleRightPanel('market')},
      {label:'AI Insights',action:()=>this.toggleRightPanel('ai')},
      {label:'Object Tree',action:()=>this.toggleRightPanel('objects')},
      {label:'Drawing tools',keep:true,action:()=>this.openDrawingMenu(anchor,window.innerWidth<=780)},
      {label:'Data Window',action:()=>{this.state.showDataWindow=!this.state.showDataWindow;this.refreshAllCharts();}},
      {label:'Notification center',action:()=>this.openNotificationCenter()},
      {label:'Chart Settings',action:()=>this.openSettings('symbol')},
      {label:'Chart Templates',action:()=>this.openTemplateManager()},
      {label:'Saved Workspaces',action:()=>this.openWorkspaceManager()},
      {label:'Detach active chart',action:()=>this.detachActiveChart()},
      {label:'Connect broker',action:()=>this.openLogin()}
    ];
    if(this.canUseAIChat())items.push({label:'Indicator AI (private)',action:()=>this.openAI()});
    if(this.state.ownerMode)items.push({label:'Brand Manager',action:()=>this.openBrandManager()});
    items.push({label:'Reset workspace',action:()=>this.resetWorkspace()},{label:'About / attribution',action:()=>this.openAbout()});this.openMenu(anchor,items,220);
  }
  openMenu(anchor,items,width=190){const m=this.createMenu(anchor,width);for(const x of items){m.append(el('button',{class:`menu-item ${x.active?'active':''}`,onclick:()=>{x.action?.();if(!x.keep)this.closeMenu();}},x.label));}}
  createMenu(anchor,width=190,extra=''){
    this.closeMenu();const r=anchor.getBoundingClientRect();const m=el('div',{class:`floating-menu ${extra}`});m.style.minWidth=`${width}px`;document.body.append(m);
    requestAnimationFrame(()=>{
      const mr=m.getBoundingClientRect();let left=Math.min(window.innerWidth-mr.width-8,Math.max(6,r.left));let top=r.bottom+5;
      if(top+mr.height>window.innerHeight-6)top=Math.max(6,r.top-mr.height-5);
      m.style.left=`${left}px`;m.style.top=`${top}px`;
    });
    this.menu=m;
    this.outsideMenuHandler=e=>{const inAnchor=typeof anchor.contains==='function'&&anchor.contains(e.target);if(this.menu&&!this.menu.contains(e.target)&&!inAnchor){document.removeEventListener('pointerdown',this.outsideMenuHandler,true);this.outsideMenuHandler=null;this.closeMenu();}};
    setTimeout(()=>document.addEventListener('pointerdown',this.outsideMenuHandler,true),0);return m;
  }
  closeMenu(){if(this.outsideMenuHandler){document.removeEventListener('pointerdown',this.outsideMenuHandler,true);this.outsideMenuHandler=null;}if(this.menu){this.menu.remove();this.menu=null;}}
  toggleFavoritePeriod(period){const key=periodKey(period),a=this.state.favoritePeriods||[];this.state.favoritePeriods=a.some(x=>periodKey(x)===key)?a.filter(x=>periodKey(x)!==key):[...a,cloneSerializable(period)];this.renderTopbar();this.save();}
  toggleFavoriteTf(tf){this.toggleFavoritePeriod({mode:'time',value:tf});}
  openCustomInterval(){this.closeMenu();const v=prompt('Custom interval, for example 12s, 7m or 6h:','12s');if(!v)return;this.setPeriod({mode:'time',value:v});if(!this.state.favoritePeriods.some(x=>periodKey(x)===periodKey({mode:'time',value:v})))this.state.favoritePeriods.push({mode:'time',value:v});this.save();}
  addIndicator(){this.addBuiltInIndicator('ema');}
  toggleAllIndicators(){const any=this.state.indicators.some(i=>i.visible!==false);this.state.indicators.forEach(i=>i.visible=!any);this.refreshAllCharts();this.renderTopbar();this.save();}
  toggleIndicatorVisibility(id,force=null){
    const ind=this.state.indicators.find(i=>i.id===id);if(!ind)return;
    ind.visible=force==null?ind.visible===false:!!force;
    this.refreshAllCharts();this.renderTopbar();this.save();
  }
  toggleOscillatorIndicators(){
    const oscillators=this.state.indicators.filter(i=>(i.pane||indicatorDefinition(i.kind)?.pane)==='oscillator');
    if(!oscillators.length){toast('No oscillator indicators are open.');return;}
    const visible=oscillators.filter(i=>i.visible!==false);
    this.state.ui=this.state.ui||{};
    if(visible.length){
      this.state.ui.oscillatorVisibilitySnapshot=visible.map(i=>i.id);
      oscillators.forEach(i=>i.visible=false);
      toast('Oscillators hidden · double-click empty chart space to restore');
    }else{
      const saved=new Set(this.state.ui.oscillatorVisibilitySnapshot||[]);
      oscillators.forEach(i=>i.visible=saved.size?saved.has(i.id):true);
      this.state.ui.oscillatorVisibilitySnapshot=[];
      toast('Oscillators restored');
    }
    this.refreshAllCharts();this.renderTopbar();this.save();
  }
  openIndicatorSettings(id){
    this.closeMenu();const ind=this.state.indicators.find(i=>i.id===id);if(!ind)return;
    const wrap=this.makeModal(`Indicator · ${ind.name}`,'indicator-modal');const body=el('div',{class:'settings-body',style:'min-height:320px'});wrap.main.replaceChildren(body);
    body.append(setting('Visible',check(ind.visible!==false,v=>{ind.visible=v;})));
    const def=indicatorDefinition(ind.kind);const paramKeys=Object.keys(def?.defaults||{});
    for(const key of paramKeys)body.append(setting(capitalize(key),numberInput(ind[key]??def.defaults[key],v=>{ind[key]=Math.max(.0001,+v||def.defaults[key]||1);})));
    body.append(setting('Line width',select(['1','1.5','2','3','4'],String(ind.lineWidth||1.5),v=>ind.lineWidth=+v)));
    body.append(el('h4',{},'Colour'));body.append(palette(this.state.indicatorPalette,ind.color,c=>ind.color=c));
    body.append(setting('Name',textInput(ind.name,v=>ind.name=v)));
    wrap.ok.onclick=()=>{this.refreshAllCharts();this.closeModal();this.save();};
  }
  openSettings(tab='symbol'){
    this.closeMenu();const modal=this.makeModal('Settings','settings-modal');const nav=el('div',{class:'settings-nav'});const body=el('div',{class:'settings-body'});
    modal.main.className='modal-main split';modal.main.replaceChildren(nav,body);
    const tabs=['symbol','status','scales','canvas','platform','trading','alerts','ai','events'];
    tabs.forEach(t=>nav.append(el('button',{class:t===tab?'active':'',onclick:()=>this.fillSettings(t,nav,body)},capitalize(t==='scales'?'scales & lines':t))));
    this.fillSettings(tab,nav,body);modal.ok.textContent='OK';modal.ok.onclick=()=>{this.applyPlatformTheme();this.refreshAllCharts();this.updateQuickTrade();this.closeModal();this.save();};
  }
  fillSettings(tab,nav,body){
    $$('button',nav).forEach(b=>b.classList.toggle('active',b.textContent.toLowerCase().startsWith(tab==='scales'?'scales':tab)));
    body.innerHTML='';const s=this.state,c=s.candleStyle;
    if(tab==='symbol'){
      body.append(el('h4',{},'Chart type & symbol'));
      body.append(setting('Chart type',select(['Candles','Bars','Line','Area','Heikin-Ashi','Renko','Range'],this.activeConfig().chartType,v=>this.setChartType(v))));
      body.append(setting('Symbol',select(Object.keys(SYMBOLS),this.activeConfig().symbol,v=>this.setSymbol(v))));
      body.append(setting('Bar period',el('button',{class:'secondary',onclick:e=>this.openTimeframeMenu(e.currentTarget)},describePeriod(this.activeConfig().period))));
      body.append(el('h4',{},'Candles · three layers'));
      body.append(setting('Bull body',colorInput(c.upBody,v=>c.upBody=v)));body.append(setting('Bear body',colorInput(c.downBody,v=>c.downBody=v)));
      body.append(setting('Bull border',colorInput(c.upBorder,v=>c.upBorder=v)));body.append(setting('Bear border',colorInput(c.downBorder,v=>c.downBorder=v)));
      body.append(setting('Bull wick',colorInput(c.upWick,v=>c.upWick=v)));body.append(setting('Bear wick',colorInput(c.downWick,v=>c.downWick=v)));
      body.append(setting('Show borders',check(c.borderVisible!==false,v=>c.borderVisible=v)));body.append(setting('Show wicks',check(c.wickVisible!==false,v=>c.wickVisible=v)));
      body.append(el('h4',{},'Candle palette presets'));body.append(candlePaletteGrid(preset=>{Object.assign(c,preset);this.refreshAllCharts();}));
      body.append(setting('Timezone',select(['UTC','Local','UTC+1 Lagos'],s.timezone||'UTC+1 Lagos',v=>s.timezone=v)));
    }
    if(tab==='status'){
      body.append(el('h4',{},'Status line'));body.append(setting('Symbol/title',check(s.showSymbolOverlay,v=>s.showSymbolOverlay=v)));body.append(setting('OHLC values',check(s.showOHLC,v=>s.showOHLC=v)));body.append(setting('Indicator values',check(s.showIndicatorOverlay,v=>s.showIndicatorOverlay=v)));body.append(setting('Latency / price age',check(s.showLatency,v=>s.showLatency=v)));body.append(setting('Data window',check(s.showDataWindow,v=>s.showDataWindow=v)));body.append(setting('Buy / sell buttons',check(s.quickTrade,v=>s.quickTrade=v)));
    }
    if(tab==='scales'){
      s.marketLineStyles=s.marketLineStyles||{last:{color:'#00c7b1',width:1,style:'solid'},bid:{color:'#f59e0b',width:1,style:'solid'},ask:{color:'#22c55e',width:1,style:'solid'}};
      const styleOptions=[['solid','Solid'],['dashed','Dashed'],['dotted','Dotted']];
      body.append(el('h4',{},'Price scale'));
      body.append(setting('Scale mode',select([['normal','Regular'],['log','Logarithmic'],['percent','Percent'],['indexed','Indexed to 100']],s.priceScaleMode,v=>s.priceScaleMode=v)));
      body.append(setting('Auto scale on new chart',check(s.chartSettings.autoScale!==false,v=>s.chartSettings.autoScale=v)));
      body.append(setting('Right-side space',rangeInput(s.chartSettings.rightOffset,0,60,1,v=>s.chartSettings.rightOffset=+v)));
      body.append(setting('Top margin',rangeInput(s.chartSettings.topMargin*100,0,35,1,v=>s.chartSettings.topMargin=+v/100)));
      body.append(setting('Bottom margin',rangeInput(s.chartSettings.bottomMargin*100,0,35,1,v=>s.chartSettings.bottomMargin=+v/100)));
      body.append(setting('Crosshair price/time labels',check(s.showCrosshairLabels!==false,v=>s.showCrosshairLabels=v)));
      body.append(el('h4',{},'Current price'));
      body.append(setting('Last price line',check(s.showLastPriceLine!==false,v=>s.showLastPriceLine=v)));
      body.append(setting('Last price label',check(s.showLastPriceLabel!==false,v=>s.showLastPriceLabel=v)));
      body.append(setting('Last price color',colorInput(s.marketLineStyles.last.color,v=>s.marketLineStyles.last.color=v)));
      body.append(setting('Last price width',rangeInput(s.marketLineStyles.last.width||1,.5,4,.5,v=>s.marketLineStyles.last.width=+v)));
      body.append(setting('Last price style',select(styleOptions,s.marketLineStyles.last.style||'solid',v=>s.marketLineStyles.last.style=v)));
      body.append(setting('Candle countdown',check(s.showCountdown!==false,v=>s.showCountdown=v),'Shown directly under the current-price label for time-based candles.'));
      body.append(el('h4',{},'Bid & Ask'));
      body.append(setting('Bid line',check(s.showBidLine,v=>s.showBidLine=v)));body.append(setting('Bid label',check(s.showBidLabel!==false,v=>s.showBidLabel=v)));
      body.append(setting('Bid color',colorInput(s.marketLineStyles.bid.color,v=>s.marketLineStyles.bid.color=v)));body.append(setting('Bid width',rangeInput(s.marketLineStyles.bid.width||1,.5,4,.5,v=>s.marketLineStyles.bid.width=+v)));body.append(setting('Bid style',select(styleOptions,s.marketLineStyles.bid.style||'solid',v=>s.marketLineStyles.bid.style=v)));
      body.append(setting('Ask line',check(s.showAskLine,v=>s.showAskLine=v)));body.append(setting('Ask label',check(s.showAskLabel!==false,v=>s.showAskLabel=v)));
      body.append(setting('Ask color',colorInput(s.marketLineStyles.ask.color,v=>s.marketLineStyles.ask.color=v)));body.append(setting('Ask width',rangeInput(s.marketLineStyles.ask.width||1,.5,4,.5,v=>s.marketLineStyles.ask.width=+v)));body.append(setting('Ask style',select(styleOptions,s.marketLineStyles.ask.style||'solid',v=>s.marketLineStyles.ask.style=v)));
      body.append(el('h4',{},'Time scale'));
      body.append(setting('Default candle spacing',rangeInput(s.chartSettings.barSpacing,2,20,.5,v=>s.chartSettings.barSpacing=+v)));
      body.append(setting('Home-view bars (desktop)',rangeInput(s.chartSettings.homeBarsDesktop||180,60,400,10,v=>s.chartSettings.homeBarsDesktop=+v)));
      body.append(setting('Home-view bars (mobile)',rangeInput(s.chartSettings.homeBarsMobile||90,40,220,10,v=>s.chartSettings.homeBarsMobile=+v)));
      body.append(setting('Session / period separators',check(s.showSessionSeparators,v=>s.showSessionSeparators=v)));
      body.append(setting('Behavior',el('span',{},'Wheel/time scale = horizontal density · right price scale = vertical compression · AUTO restores visible-price fit · RESET restores Home View.')));
    }
    if(tab==='canvas'){
      body.append(el('h4',{},'Chart canvas'));
      body.append(setting('Background',colorInput(s.background,v=>s.background=v)));body.append(setting('Horizontal grid',check(s.gridH,v=>s.gridH=v)));body.append(setting('Vertical grid',check(s.gridV,v=>s.gridV=v)));body.append(setting('Round-price major grid',check(s.majorRoundGrid,v=>s.majorRoundGrid=v)));body.append(setting('Crosshair color',colorInput(s.crosshairColor,v=>s.crosshairColor=v)));
      body.append(el('h4',{},'Chart background presets'));body.append(palette(['#111820','#171717','#23272b','#2b2b2b','#0b1320','#1d2330','#0e1726','#121212','#f4f5f7','#ffffff'],s.background,c=>s.background=c));
    }
    if(tab==='platform'){
      body.append(el('h4',{},'Platform theme'));body.append(el('p',{class:'settings-note'},'Platform theme changes Trade Avata menus, panels and controls. It does not overwrite your candle or chart colours.'));
      body.append(setting('Theme',select([['dark','Dark'],['light','Light'],['system','System']],s.platformTheme||'dark',v=>{s.platformTheme=v;this.applyPlatformTheme();})));
    }
    if(tab==='trading'){
      body.append(el('h4',{},'Quick trading'));body.append(setting('Show Buy / Sell',check(s.quickTrade,v=>s.quickTrade=v)));body.append(setting('Sizing mode',select(['risk','lots','cash'],s.tradeSizeMode,v=>s.tradeSizeMode=v)));body.append(setting('Risk %',numberInput(s.riskPercent,v=>s.riskPercent=clamp(+v||1,.01,100))));body.append(setting('Fixed lots',numberInput(s.fixedLots,v=>s.fixedLots=Math.max(.01,+v||.1))));body.append(setting('Fixed cash risk',numberInput(s.fixedCashRisk,v=>s.fixedCashRisk=Math.max(1,+v||100))));body.append(setting('Account size for planning',numberInput(s.accountSize,v=>s.accountSize=Math.max(1,+v||10000))));body.append(setting('Leverage',numberInput(s.leverage,v=>s.leverage=Math.max(1,+v||100))));body.append(setting('One-click trading',check(false,()=>toast('One-click trading remains disabled until a verified broker account is connected.'))));
    }
    if(tab==='alerts'){
      body.append(el('h4',{},'Alerts'));body.append(setting('Price / indicator alerts',el('button',{class:'secondary',onclick:()=>this.openAlertModal()},'Manage alerts')));body.append(setting('Alert sound',check(s.alertPreferences.sound,v=>s.alertPreferences.sound=v)));body.append(setting('Browser notifications',check(s.alertPreferences.browser,v=>s.alertPreferences.browser=v)));
    }
    if(tab==='ai'){
      body.append(el('h4',{},'AI & voice'));body.append(el('p',{class:'settings-note'},'Public users receive automated AI outputs. Conversational AI is displayed only for the owner or accounts with the secure AI-chat entitlement.'));
      body.append(setting('Voice input',check(s.aiAccess?.voiceInput!==false,v=>{s.aiAccess=s.aiAccess||{};s.aiAccess.voiceInput=v;}),'Uses browser speech recognition when available.'));
      body.append(setting('Read replies aloud',check(s.aiAccess?.readAloud!==false,v=>{s.aiAccess=s.aiAccess||{};s.aiAccess.readAloud=v;}),'Uses browser text-to-speech; no Trade Avata audio file is stored.'));
      body.append(setting('Auto-play AI replies',check(!!s.aiAccess?.autoReadReplies,v=>{s.aiAccess=s.aiAccess||{};s.aiAccess.autoReadReplies=v;}),'Owner / permitted conversations only.'));
      body.append(setting('Market Intelligence',el('button',{class:'secondary',onclick:()=>{this.closeModal();this.toggleRightPanel('market');}},'Open Market Center')));
      body.append(setting('AI Insights',el('button',{class:'secondary',onclick:()=>{this.closeModal();this.toggleRightPanel('ai');}},'Open AI Insights')));
    }
    if(tab==='events'){
      body.append(el('h4',{},'Events'));body.append(setting('Session breaks',check(s.showSessionSeparators,v=>s.showSessionSeparators=v)));body.append(setting('Economic events',check(s.showEconomicEvents!==false,v=>s.showEconomicEvents=v),'Preference is ready now; live event markers appear when the backend calendar feed is connected.'));body.append(setting('Latest news',check(!!s.showLatestNews,v=>s.showLatestNews=v),'Preference is ready now; live news markers require the backend news feed.'));
    }
  }
  makeModal(title,cls=''){this.closeModal();const back=el('div',{class:'modal-backdrop'});const modal=el('div',{class:`modal ${cls}`});const head=el('div',{class:'modal-head'},el('strong',{},title),el('button',{class:'modal-x',onclick:()=>this.closeModal()},'×'));const main=el('div',{class:'modal-main single'});const foot=el('div',{class:'modal-foot'});const cancel=el('button',{class:'secondary',onclick:()=>this.closeModal()},'Cancel');const ok=el('button',{class:'primary'},'OK');foot.append(cancel,ok);modal.append(head,main,foot);back.append(modal);$('#modal-layer').append(back);back.addEventListener('pointerdown',e=>{if(e.target===back)this.closeModal();});this.modal=back;return{back,modal,main,ok,cancel};}
  closeModal(){if(this.modal){this.modal.remove();this.modal=null;}}
  openAlertModal(){
    this.closeMenu();const m=this.makeModal('Create alert');const body=el('div',{class:'settings-body',style:'min-height:390px'});m.main.replaceChildren(body);
    let model={name:`${this.activeConfig().symbol} alert`,source:'Price',condition:'Crossing',operator:'at',value:formatPrice(this.activeConfig().symbol,this.activePane().displayBars.at(-1)?.close||0),frequency:'Once per bar close',message:'{{symbol}} {{source}} {{condition}} {{value}}',channels:{inApp:true,sound:this.state.alertPreferences.sound,browser:this.state.alertPreferences.browser,email:this.state.alertPreferences.email,telegram:this.state.alertPreferences.telegram,push:this.state.alertPreferences.push,webhook:this.state.alertPreferences.webhook}};
    body.append(setting('Alert name',textInput(model.name,v=>model.name=v)));body.append(setting('Symbol',el('span',{},this.activeConfig().symbol)));body.append(setting('Source',select(['Price',...this.state.indicators.map(i=>i.name),'Selected drawing'],model.source,v=>model.source=v)));body.append(setting('Condition',select(['Crossing','Crossing up','Crossing down','Greater than','Less than'],model.condition,v=>model.condition=v)));body.append(setting('Value',textInput(model.value,v=>model.value=v)));body.append(setting('Frequency',select(['Once','Every time','Once per bar','Once per bar close'],model.frequency,v=>model.frequency=v)));body.append(setting('Custom message',textInput(model.message,v=>model.message=v),'Supports placeholders such as {{symbol}}, {{source}}, {{value}}.'));
    const channels=el('div',{class:'channel-grid'});for(const [key,label] of [['inApp','In-app popup'],['sound','Sound'],['browser','Browser / desktop'],['push','Mobile push'],['email','Email'],['telegram','Telegram'],['webhook','Webhook']])channels.append(el('label',{class:'channel-chip'},check(model.channels[key],v=>model.channels[key]=v),el('span',{},label)));body.append(setting('Notify by',channels,'Email, Telegram, push and webhook require the secure alert server to be configured.'));
    body.append(el('div',{class:'alert-test-row'},el('button',{class:'secondary',onclick:()=>this.testLocalAlert(model)},'Test local notification'),el('button',{class:'secondary',onclick:async()=>{const r=await requestBrowserNotifications();toast(`Browser notifications: ${r}`,r==='granted'?'success':'info');}},'Enable browser notifications')));
    m.ok.onclick=()=>{this.state.alerts.push({id:`a-${Date.now()}`,symbol:this.activeConfig().symbol,...model});this.closeModal();this.save();this.renderBottom();this.renderRightPanel();toast('Alert created','success');};
  }
  testLocalAlert(model={}){const symbol=this.activeConfig().symbol,msg=(model.message||'Trade Avata alert triggered').replaceAll('{{symbol}}',symbol).replaceAll('{{source}}',model.source||'Price').replaceAll('{{condition}}',model.condition||'Crossing').replaceAll('{{value}}',model.value||'');if(model.channels?.sound!==false)playAlertTone();showBrowserNotification(model.name||`Trade Avata · ${symbol}`,msg);this.state.notifications.unshift({id:`n-${Date.now()}`,title:model.name||`${symbol} alert`,message:msg,time:new Date().toISOString(),read:false});this.state.notifications=this.state.notifications.slice(0,100);this.save();toast(msg,'success');}
  openNotificationCenter(){this.closeMenu();const m=this.makeModal('Notification center');const body=el('div',{class:'settings-body'});m.main.replaceChildren(body);m.ok.style.display='none';m.cancel.textContent='Close';if(!this.state.notifications.length)body.append(el('div',{class:'empty-state'},'No notifications yet.'));for(const n of this.state.notifications){body.append(el('div',{class:'side-card notification-item'},el('h4',{},n.title),el('p',{},n.message),el('small',{},new Date(n.time).toLocaleString())));}body.append(el('button',{class:'secondary',onclick:()=>{this.state.notifications=[];this.save();this.openNotificationCenter();}},'Clear notifications'));}
  openLogin(){
    this.closeMenu();const m=this.makeModal('Trade Avata account & broker','login-modal');const body=el('div',{class:'settings-body'});m.main.replaceChildren(body);m.ok.style.display='none';m.cancel.textContent='Close';
    const user=this.state.connection.tradeAvataUser;const userCard=el('div',{class:'login-card'},el('h3',{},'Trade Avata account'),el('p',{},user?`Signed in locally as ${user.email}. Firebase production configuration can replace this preview session.`:'Sign in to save workspaces, preferences, drawings and entitlements.'));if(!user){const f=el('div',{class:'form-grid'},el('input',{type:'email',placeholder:'Email',id:'ta-email'}),el('input',{type:'password',placeholder:'Password',id:'ta-pass'}),el('button',{class:'primary',onclick:()=>{const email=$('#ta-email')?.value?.trim();if(!email){toast('Enter your email','error');return;}this.state.connection.tradeAvataUser={email,uid:'preview-owner'};this.save();this.closeModal();this.renderTopbar();toast('Preview Trade Avata session signed in','success');}},'Sign in'));userCard.append(f);}else userCard.append(el('button',{class:'secondary',onclick:()=>{this.state.connection.tradeAvataUser=null;this.save();this.closeModal();this.renderTopbar();}},'Sign out'));body.append(userCard);
    const brokerCard=el('div',{class:'login-card'},el('h3',{},'Connect trading account'),el('p',{},'cTrader connection uses OAuth. Broker passwords must never be entered into Trade Avata.'));const btn=el('button',{class:'primary',onclick:()=>this.startBrokerConnect()},this.state.connection.status==='live'?'Manage cTrader connection':'Connect cTrader securely');brokerCard.append(btn);if(this.state.connection.status==='live')brokerCard.append(el('button',{class:'danger',style:'margin-left:7px',onclick:()=>this.disconnectBroker()},'Disconnect'));body.append(brokerCard);
    body.append(el('div',{class:'login-card'},el('h3',{},'Safety rule'),el('p',{},'Once a real broker feed is connected, demo market data must disappear. If live data becomes stale, Trade Avata shows RECONNECTING / PRICE STALE and blocks unsafe trading instead of silently showing fake data.')));
  }
  startBrokerConnect(){
    const gateway=window.TRADE_AVATA_BROKER_GATEWAY||localStorage.getItem('tradeAvataBrokerGateway');if(gateway){location.href=`${gateway.replace(/\/$/,'')}/oauth/ctrader/start?return_to=${encodeURIComponent(location.href)}`;return;}
    const url=prompt('Secure broker gateway URL is not configured yet. If your VPS gateway is deployed, paste its HTTPS URL here. Leave blank to keep demo mode.','');if(url){localStorage.setItem('tradeAvataBrokerGateway',url);toast('Gateway saved. Click Connect cTrader again.','success');}else toast('Broker gateway is required for real cTrader login. Demo mode remains clearly labelled.');
  }
  disconnectBroker(){this.state.connection={tradeAvataUser:this.state.connection.tradeAvataUser,broker:null,status:'demo',account:null,feed:'DEMO'};this.save();this.closeModal();this.renderTopbar();toast('Broker disconnected. Returned to clearly labelled DEMO mode.');}
  previewOrder(side,pane){this.openOrderTicket({side,pane});}
  previewOrderAtPrice(pane,price){const last=pane?.displayBars?.at(-1)?.close||price;const side=price>=last?'Buy':'Sell';this.openOrderTicket({side,pane,price});}
  openOrderTicket({side='Buy',pane=this.activePane(),price=null}={}){
    if(!pane)return;const last=pane.displayBars?.at(-1)?.close||0,isReplay=this.state.replay.active,isLive=this.state.connection.status==='live';
    const inferred=price==null?'Market':side==='Buy'?(price<last?'Limit':'Stop'):(price>last?'Limit':'Stop');
    const model={side,type:inferred,price:price==null?last:Number(price),size:Number(this.state.fixedLots||.1),riskPercent:Number(this.state.riskPercent||1),sl:null,tp:null};
    const m=this.makeModal(`${isReplay?'Replay ':isLive?'':'Demo '}${side} order · ${pane.symbol}`,'order-ticket-modal'),body=el('div',{class:'settings-body'});m.main.replaceChildren(body);
    body.append(el('div',{class:'side-card'},el('strong',{},isReplay?'REPLAY / SIMULATION':isLive?'LIVE — confirmation required':'DEMO — no broker order will be sent'),el('p',{},`Current price ${formatPrice(pane.symbol,last)} · ${periodLabel(pane.period)}`)));
    body.append(setting('Side',select(['Buy','Sell'],model.side,v=>model.side=v)));body.append(setting('Order type',select(['Market','Limit','Stop'],model.type,v=>model.type=v)));body.append(setting('Entry price',numberInput(model.price,v=>model.price=Number(v))));body.append(setting('Size / lots',numberInput(model.size,v=>model.size=Math.max(0.01,Number(v)||.01))));body.append(setting('Risk %',numberInput(model.riskPercent,v=>model.riskPercent=Math.max(0,Number(v)||0))));body.append(setting('Stop loss',numberInput(model.sl??'',v=>model.sl=v===''?null:Number(v))));body.append(setting('Take profit',numberInput(model.tp??'',v=>model.tp=v===''?null:Number(v))));
    m.ok.textContent=isLive?'Confirm & send':'Place simulated order';m.ok.onclick=async()=>{const request={symbol:pane.symbol,side:model.side,type:model.type,size:model.size,price:model.type==='Market'?null:model.price,sl:model.sl,tp:model.tp,riskPercent:model.riskPercent,source:isReplay?'replay':isLive?'live':'demo',clientTime:new Date().toISOString()};if(isLive){const ok=await this.sendBrokerCommand('orders',request);if(!ok)return;toast('Order accepted by broker gateway','success');}else{this.orders.unshift({id:`O-${Date.now()}`,status:isReplay?'REPLAY':'DEMO',...request,price:request.price??last});toast(`${isReplay?'Replay':'Demo'} order added`,'success');}this.closeModal();this.openBottom('orders');};
  }
  async sendBrokerCommand(action,payload){
    const gateway=window.TRADE_AVATA_BROKER_GATEWAY||localStorage.getItem('tradeAvataBrokerGateway');if(!gateway){toast('Secure broker gateway is not configured yet. The frontend is ready; backend order routing is still required.','error');return false;}
    try{const r=await fetch(`${gateway.replace(/\/$/,'')}/api/trading/${action}`,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify(payload)});if(!r.ok){const text=await r.text().catch(()=> '');throw new Error(text||`Gateway returned ${r.status}`);}return true;}catch(e){toast(e?.message||'Broker gateway request failed','error');return false;}
  }
  openPositionModify(position){
    const m=this.makeModal(`Modify ${position.symbol} ${position.side}`,'position-modify-modal'),body=el('div',{class:'settings-body'}),model={size:Number(position.size),sl:Number(position.sl),tp:Number(position.tp)};m.main.replaceChildren(body);body.append(setting('Size / lots',numberInput(model.size,v=>model.size=Math.max(.01,Number(v)||.01))));body.append(setting('Stop loss',numberInput(model.sl,v=>model.sl=Number(v))));body.append(setting('Take profit',numberInput(model.tp,v=>model.tp=Number(v))));m.ok.textContent=this.state.connection.status==='live'?'Submit modification':'Apply demo change';m.ok.onclick=async()=>{if(this.state.connection.status==='live'){const ok=await this.sendBrokerCommand('positions/modify',{id:position.id,symbol:position.symbol,size:model.size,sl:model.sl,tp:model.tp});if(!ok)return;}position.size=model.size;position.sl=model.sl;position.tp=model.tp;this.closeModal();this.renderBottom();toast('Position updated','success');};
  }
  async requestClosePosition(position){if(!confirm(`Close ${position.symbol} ${position.side} position?`))return;if(this.state.connection.status==='live'){const ok=await this.sendBrokerCommand('positions/close',{id:position.id,symbol:position.symbol});if(!ok)return;}this.positions=this.positions.filter(p=>p.id!==position.id);this.renderBottom();toast(this.state.connection.status==='live'?'Close request accepted':'Demo position closed','success');}
  async cancelOrder(order){if(this.state.connection.status==='live'&&order.status==='LIVE'){const ok=await this.sendBrokerCommand('orders/cancel',{id:order.id,symbol:order.symbol});if(!ok)return;}this.orders=this.orders.filter(o=>o.id!==order.id);this.renderBottom();toast('Order cancelled','success');}
  openAI(){
    if(!this.canUseAIChat()){toast('Indicator AI conversation is owner / entitled access only.','error');return;}
    const m=this.makeModal('Trade Avata Indicator AI · Owner / Entitled','ai-owner-modal');const b=el('div',{class:'settings-body'});m.main.replaceChildren(b);m.ok.style.display='none';m.cancel.textContent='Close';const p=this.activePane(),bars=p.displayBars,last=bars.at(-1),first=bars[Math.max(0,bars.length-80)],change=first&&last?((last.close-first.close)/first.close*100):0;
    const visibleText=`${p.symbol} ${p.timeframe} is ${change>=0?'up':'down'} ${Math.abs(change).toFixed(2)}% across the recent visible sample.`;
    b.append(el('div',{class:'side-card'},el('div',{class:'card-title-row'},el('h4',{},'Visible-chart context'),el('button',{class:'mini-action',onclick:()=>this.speakAI(visibleText)},'▶ Listen')),el('p',{},visibleText),el('p',{},'This AI is for indicator understanding, signal explanation and analysis. It is not allowed to place or modify broker orders by itself.')));
    b.append(el('h4',{},'Indicator intelligence profiles'));
    for(const ind of this.state.indicators){const profile=this.state.indicatorProfiles[ind.id]||{notes:''};const card=el('div',{class:'side-card'},el('strong',{},ind.name),el('p',{},`Security gate: ${safeIndicatorSummary(ind).ok?'declarative / approved':'review required'}`));const ta=el('textarea',{class:'field ai-notes',placeholder:'Describe what this indicator means, when you trust it, invalidation rules, sessions, examples…'});ta.value=profile.notes||'';ta.addEventListener('input',()=>{this.state.indicatorProfiles[ind.id]={...profile,notes:ta.value};this.save();});card.append(ta);b.append(card);}
    const indicatorContext={symbol:p.symbol,timeframe:p.timeframe,visibleChangePct:change,indicators:this.state.indicators.map(ind=>({name:ind.name,kind:ind.kind,length:ind.length,visible:ind.visible!==false,profile:this.state.indicatorProfiles[ind.id]||{}}))};
    this.renderAIChatComposer(b,'indicator',indicatorContext,{title:'Talk to Indicator AI'});
    b.append(el('div',{class:'side-card'},el('h4',{},'Indicator AI jobs'),el('p',{},'Explain why a signal did or did not occur · interpret your private indicator dashboard · compare historical setups · explain parameter changes · replay coaching · risk/context analysis. Private indicator source can remain server-side.')));
  }
  openAbout(){const m=this.makeModal('About Trade Avata Chart');const b=el('div',{class:'settings-body'});m.main.replaceChildren(b);m.ok.style.display='none';m.cancel.textContent='Close';b.innerHTML='<div class="side-card"><h4>Trade Avata Chart · Full Native</h4><p>Chart rendering, axes, coordinates, indicators, oscillator panes, crosshair, scaling and interactions are powered by Trade Avata Native v3.2. No external chart renderer is installed.</p></div>';}
  openDrawingSettings(id){
    const d=this.state.drawings.find(x=>x.id===id);if(!d)return;
    const before=cloneSerializable(this.state.drawings);
    const title=d.type==='fibonacci'?'Fib retracement':`Drawing · ${capitalize(d.type)}`;
    const m=this.makeModal(title,'drawing-settings-modal');m.main.className='modal-main single';
    const wrap=el('div',{class:'drawing-settings-wrap'}),tabs=el('div',{class:'drawing-settings-tabs'}),body=el('div',{class:'settings-body drawing-settings-body'});wrap.append(tabs,body);m.main.replaceChildren(wrap);
    d.style=d.style||{};d.visibility=d.visibility||{all:true,periods:[],timeframes:[]};let active='style';
    const render=()=>{
      body.innerHTML='';tabs.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.tab===active));
      if(active==='style'){
        if(d.type==='fibonacci'){
          body.append(setting('Trend line',check(d.showTrendLine!==false,v=>d.showTrendLine=v), 'Anchor trend line'));
          body.append(setting('Trend line colour',colorInput(d.style.color||'#7cc8ff',v=>d.style.color=v)));
          body.append(setting('Levels line',select([['solid','Solid'],['dashed','Dashed'],['dotted','Dotted']],d.style.lineStyle||'solid',v=>d.style.lineStyle=v)));
          body.append(setting('Extend',select([['none','No extension'],['right','Extend lines right']],d.extend||'right',v=>d.extend=v)));
          const grid=el('div',{class:'fib-level-grid'});
          for(const lv of d.levels||[]){const row=el('div',{class:'fib-level-row'});row.append(check(lv.visible!==false,v=>lv.visible=v),numberInput(lv.value,v=>lv.value=Number(v)),colorInput(lv.color||d.style.color||'#7cc8ff',v=>lv.color=v));grid.append(row);}
          body.append(el('h4',{},'Levels'),grid);
          body.append(setting('Use one colour',check(!!d.useOneColor,v=>d.useOneColor=v)));
          body.append(setting('Background',check(!!d.background,v=>d.background=v)));
        }else{
          body.append(setting('Colour',colorInput(d.style.color||'#7cc8ff',v=>d.style.color=v)));
          body.append(setting('Line width',select(['1','1.5','2','3','4','6','10'],String(d.style.width||1.5),v=>d.style.width=+v)));
          body.append(setting('Line style',select([['solid','Solid'],['dashed','Dashed'],['dotted','Dotted']],d.style.lineStyle||'solid',v=>d.style.lineStyle=v)));
          body.append(setting('Opacity',rangeInput(Math.round((d.style.opacity??1)*100),5,100,1,v=>d.style.opacity=+v/100)));
          body.append(setting('Locked',check(d.locked,v=>d.locked=v)));
          if(d.type==='rectangle')body.append(setting('Fill',colorInput(rgbToHex(d.style.fill)||'#2896ff',v=>d.style.fill=hexToRgba(v,.12))));
          if(d.type==='text')body.append(setting('Text',textInput(d.text||'',v=>d.text=v)));
          if(['long','short'].includes(d.type)&&d.points.length>=3){
            body.append(el('h4',{},'Position appearance'));
            body.append(setting('Profit colour',colorInput(d.style.profitColor||'#00a8b8',v=>d.style.profitColor=v)));
            body.append(setting('Stop colour',colorInput(d.style.lossColor||'#b92ebd',v=>d.style.lossColor=v)));
            body.append(setting('Entry colour',colorInput(d.style.entryColor||'#00b6c8',v=>d.style.entryColor=v)));
            body.append(setting('Show statistics',check(d.style.showStats!==false,v=>d.style.showStats=v)));
          }
        }
        const tplBtn=el('button',{class:'secondary drawing-template-btn',onclick:e=>this.openDrawingTemplateMenu(e.currentTarget,d,render)},'Template ▾');body.append(el('div',{class:'drawing-template-row'},tplBtn));
      }else if(active==='coordinates'){
        d.points.forEach((pt,i)=>{
          body.append(el('h4',{},i===0?'Point 1 / Entry':i===1?'Point 2 / Target':'Point 3 / Stop'));
          body.append(setting('Price',numberInput(pt.price,v=>pt.price=Number(v)||pt.price)));
          body.append(setting('Logical / bar position',numberInput(Number.isFinite(pt.logical)?pt.logical:this.activePane().logicalForTime(pt.time),v=>{pt.logical=Number(v);pt.time=this.activePane().projectedTimeForLogical(pt.logical);}),'Can extend beyond the latest candle into future chart space.'));
        });
        if(['long','short'].includes(d.type)){
          body.append(setting('Risk %',numberInput(d.riskPercent??this.state.riskPercent,v=>d.riskPercent=clamp(+v||1,.01,100))));
          body.append(setting('Account size',numberInput(this.state.accountSize,v=>this.state.accountSize=Math.max(1,+v||10000))));
          body.append(setting('Leverage',numberInput(this.state.leverage,v=>this.state.leverage=Math.max(1,+v||100))));
          body.append(el('button',{class:'primary',onclick:()=>this.usePositionSetup(d)},'Use setup → Create order'));
        }
      }else{
        body.append(el('h4',{},'Visibility'));
        body.append(setting('Visible on all periods',check(d.visibility.all!==false,v=>d.visibility.all=v)));
        body.append(el('p',{class:'settings-note'},'When “all periods” is off, choose exact period keys below. This lets a drawing appear only on the timeframes or bar types where it is useful.'));
        const keys=[...TIMEFRAMES.map(([v])=>`time:${v}`),'renko-pips:5','renko-pips:10','renko-time:1m','range-pips:5','range-pips:10'];
        const chips=el('div',{class:'visibility-chip-grid'});
        for(const key of keys){const on=d.visibility.periods?.includes(key);chips.append(el('button',{class:`visibility-chip ${on?'active':''}`,onclick:e=>{d.visibility.periods=d.visibility.periods||[];d.visibility.periods=on?d.visibility.periods.filter(x=>x!==key):[...d.visibility.periods,key];e.currentTarget.classList.toggle('active');}},key));}
        body.append(chips);
      }
      this.refreshDrawingLayers();
    };
    for(const [key,label] of [['style','Style'],['coordinates','Coordinates'],['visibility','Visibility']])tabs.append(el('button',{'data-tab':key,class:key===active?'active':'',onclick:()=>{active=key;render();}},label));
    render();
    m.ok.onclick=()=>{this.state.undoStack.push({label:'drawing settings',drawings:before});this.state.redoStack=[];this.refreshDrawingLayers();this.closeModal();this.save();};
    m.cancel.onclick=()=>{this.state.drawings=before;this.refreshDrawingLayers();this.closeModal();};
  }
  openDrawingTemplateMenu(anchor,d,rerender){
    const matching=(this.state.drawingTemplates||[]).filter(t=>t.type===d.type),items=[{label:'Save current style as template…',action:()=>this.saveDrawingTemplate(d)}];
    if(matching.length)items.push(...matching.map(t=>({label:`Apply · ${t.name}`,action:()=>{this.applyDrawingTemplate(d,t);rerender?.();this.refreshDrawingLayers();toast(`Drawing template "${t.name}" applied`,'success');}})));
    this.openMenu(anchor,items,260);
  }
  saveDrawingTemplate(d){
    const name=prompt('Drawing template name:',`${capitalize(d.type)} Template`)?.trim();if(!name)return;
    const tpl={id:`dt-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,name,type:d.type,style:cloneSerializable(d.style||{}),levels:cloneSerializable(d.levels||null),extend:d.extend||null,useOneColor:!!d.useOneColor,background:!!d.background};
    this.state.drawingTemplates=this.state.drawingTemplates||[];this.state.drawingTemplates.push(tpl);this.save();toast(`Drawing template "${name}" saved`,'success');
  }
  applyDrawingTemplate(d,t){d.style=cloneSerializable(t.style||{});if(Array.isArray(t.levels))d.levels=cloneSerializable(t.levels);if(t.extend!=null)d.extend=t.extend;d.useOneColor=!!t.useOneColor;d.background=!!t.background;}
  usePositionSetup(d){if(this.state.connection.status!=='live'){toast('Position plan saved. Connect a verified broker account before converting it to an order.');return;}toast(`${d.type==='long'?'Long':'Short'} setup sent to order confirmation.`,'success');}
  openBrandManager(){
    this.closeMenu();const m=this.makeModal('Trade Avata Brand Manager');const b=el('div',{class:'settings-body'});m.main.replaceChildren(b);m.ok.style.display='none';m.cancel.textContent='Close';b.append(el('div',{class:'side-card'},el('h4',{},'Platform logo'),el('p',{},'Owner-only local preview. Production should store approved brand assets in the admin backend/CDN.')));const input=el('input',{type:'file',accept:'image/png,image/jpeg,image/webp,image/svg+xml'});input.addEventListener('change',()=>{const f=input.files?.[0];if(!f)return;if(f.size>2_000_000){toast('Logo must be under 2 MB.','error');return;}const r=new FileReader();r.onload=()=>{this.state.brand.logoDataUrl=String(r.result);this.save();this.renderTopbar();toast('Logo updated for this workspace','success');};r.readAsDataURL(f);});b.append(setting('Upload logo',input));b.append(el('button',{class:'secondary',onclick:()=>{this.state.brand.logoDataUrl=null;this.save();this.renderTopbar();toast('Default logo restored');}},'Restore default logo'));
  }
  renderAdSlot(){
    document.querySelector('.ta-ad-slot')?.remove();if(this.state.ownerMode||!this.state.advertising?.enabled||this.state.advertising?.dismissedSession)return;const ad=el('div',{class:'ta-ad-slot'},el('small',{},'ADVERTISEMENT'),el('span',{},'Trade Avata · Explore indicators, analytics and trading tools'),el('button',{title:'Close advertisement',onclick:()=>{this.state.advertising.dismissedSession=true;ad.remove();}},'×'));document.body.append(ad);
  }
  toggleRightPanel(id){if(id==='settings'){this.openSettings('canvas');return;}this.state.rightSidebarOpen=this.state.rightPanel===id?!this.state.rightSidebarOpen:true;this.state.rightPanel=id;this.renderRightPanel();this.renderRightRail();this.save();setTimeout(()=>this.panes.forEach(p=>p.resize()),180);}
  toggleQuickTrade(){this.state.quickTrade=!this.state.quickTrade;this.updateQuickTrade();this.renderTopbar();this.save();}
  openBottom(tab){this.state.bottomTab=tab;this.state.bottomOpen=true;this.state.bottomHeight=Math.max(180,this.state.bottomLastHeight||this.state.bottomHeight||280);this.renderBottom();this.save();setTimeout(()=>this.panes.forEach(p=>p.resize()),30);}
  toggleBottom(){if(this.state.bottomOpen){this.state.bottomLastHeight=this.state.bottomHeight;this.state.bottomOpen=false;}else{this.state.bottomOpen=true;this.state.bottomHeight=this.state.bottomLastHeight||360;}this.renderBottom();this.save();setTimeout(()=>this.panes.forEach(p=>p.resize()),30);}
  installBottomResize(){document.addEventListener('pointerdown',e=>{if(!e.target.closest('.bottom-resize'))return;e.preventDefault();this.state.bottomOpen=true;this.bottomDrag={startY:e.clientY,startH:this.state.bottomHeight};document.body.style.cursor='ns-resize';});document.addEventListener('pointermove',e=>{if(!this.bottomDrag)return;const max=window.innerHeight-90;this.state.bottomHeight=clamp(this.bottomDrag.startH+(this.bottomDrag.startY-e.clientY),120,max);this.state.bottomLastHeight=this.state.bottomHeight;$('#bottom-panel').style.height=`${this.state.bottomHeight}px`;$('#chart-grid').style.bottom=`${this.state.bottomHeight}px`;this.panes.forEach(p=>p.resize());});document.addEventListener('pointerup',()=>{if(this.bottomDrag){this.bottomDrag=null;document.body.style.cursor='';this.save();}});}
  startReplaySelection(){
    const p=this.activePane();if(!p)return;
    if(this.state.replay.active){this.endReplay();return;}
    this.state.replay.selecting=true;this.state.replay.playing=false;p.enterReplaySelection();this.renderTopbar();
    toast('Replay: scroll to the historical point you want, then click the candle.');
  }
  onReplayStartSelected(pane,index){
    const r=this.state.replay;r.selecting=false;r.active=true;r.index=index;r.playing=false;r.follow=true;
    pane.setReplayIndex(index,{anchor:true});this.renderReplayControls(pane);this.renderTopbar();this.save();
  }
  renderReplayControls(pane=this.activePane()){
    if(!pane||!this.state.replay.active){pane?.clearReplayToolbar?.();return;}
    const r=this.state.replay;
    const btn=(label,fn,cls='')=>el('button',{class:`replay-control ${cls}`,onclick:e=>{e.stopPropagation();fn();}},label);
    const speed=select(['0.5','1','2','5','10','25','50'],String(r.speed||1),v=>{r.speed=+v;this.save();});
    speed.classList.add('replay-speed');
    const follow=btn(r.follow?'Follow ✓':'Follow',()=>{r.follow=!r.follow;if(r.follow)pane.anchorReplayViewport();this.renderReplayControls(pane);this.save();},r.follow?'active':'');
    const time=el('span',{class:'replay-time'});
    const bar=pane.displayBars[r.index];time.textContent=bar?new Date(Number(bar.time)*1000).toLocaleString():'Replay';
    pane.renderReplayToolbar([
      btn('|◀',()=>this.replayStep(-10)),btn('◀',()=>this.replayStep(-1)),
      btn(r.playing?'Pause':'Play',()=>this.toggleReplayPlayback(),'primary'),
      btn('▶|',()=>this.replayStep(1)),speed,time,follow,
      btn('Share',()=>this.openShareCenter('replay')),
      btn('Restart',()=>this.startReplaySelection()),btn('Exit',()=>this.endReplay(),'dangerish')
    ]);
  }
  toggleReplayPlayback(){const r=this.state.replay;if(!r.active){this.startReplaySelection();return;}r.playing=!r.playing;this.renderReplayControls();if(r.playing)this.runReplay();else clearTimeout(this.replayTimer);this.save();}
  runReplay(){
    clearTimeout(this.replayTimer);const tick=()=>{
      const r=this.state.replay;if(!r.playing)return;const p=this.activePane();
      if(r.index>=p.displayBars.length-1){r.playing=false;this.renderReplayControls(p);return;}
      this.replayStep(1,false);this.replayTimer=setTimeout(tick,Math.max(55,700/Math.max(.5,r.speed||1)));
    };tick();
  }
  replayStep(delta,render=true){
    const r=this.state.replay,p=this.activePane();if(!p)return;if(!r.active){this.startReplaySelection();return;}
    r.index=clamp(r.index+delta,20,p.displayBars.length-1);p.setReplayIndex(r.index,{anchor:r.follow!==false});if(render)this.renderReplayControls(p);this.save();
  }
  endReplay(){
    const r=this.state.replay,p=this.activePane();r.active=false;r.selecting=false;r.playing=false;r.follow=true;clearTimeout(this.replayTimer);
    p?.exitReplaySelection?.();p?.clearReplay?.();p?.clearReplayToolbar?.();this.renderTopbar();this.save();
  }
  async prepareOnlineReplay(){
    const gateway=window.TRADE_AVATA_MARKET_GATEWAY||window.TRADE_AVATA_BROKER_GATEWAY||localStorage.getItem('tradeAvataBrokerGateway');
    if(!gateway){toast('Online replay server is not configured. Local demo replay remains available.','error');return false;}
    try{
      const p=this.activePane();toast('Loading online replay history…');const bars=await fetchOnlineReplay({gateway,symbol:p.symbol,timeframe:p.timeframe});
      if(!bars.length)throw new Error('No replay bars returned.');
      p.rawBars=bars;p.periodBars=bars;p.displayBars=bars;p.barIndex=new Map(bars.map((b,i)=>[Number(b.time),i]));p.rebuildSeries();p.homeView();toast('Online replay history loaded','success');return true;
    }catch(e){toast(e.message||'Online replay unavailable','error');return false;}
  }
  downloadOfflineReplay(){
    const p=this.activePane();if(!p)return;const pkg={version:1,product:'Trade Avata Replay',symbol:p.symbol,period:p.period,chartType:p.chartType,createdAt:new Date().toISOString(),bars:p.rawBars};
    downloadBlob(new Blob([JSON.stringify(pkg)],{type:'application/json'}),`trade-avata-replay-${p.symbol}-${periodLabel(p.period).replace(/\s+/g,'-')}.json`);toast('Offline replay package downloaded','success');
  }
  ensureShareIdentity(){
    this.state.share=this.state.share||{referralId:null,lastInboundRef:null,events:[]};
    if(!this.state.share.referralId){this.state.share.referralId=makeReferralId();saveState(this.state);}
  }
  recordShareEvent(action,payload,{persist=true}={}){
    const event={id:`share-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,action,kind:payload?.kind||'chart',status:payload?.status||'UNCONFIRMED',symbol:payload?.chart?.symbol||null,ref:payload?.ref||null,time:new Date().toISOString()};
    this.state.share=this.state.share||{referralId:makeReferralId(),events:[]};this.state.share.events=[event,...(this.state.share.events||[])].slice(0,150);
    try{window.dispatchEvent(new CustomEvent('tradeavata:share-event',{detail:event}));}catch{}
    if(persist)this.save();return event;
  }
  buildCurrentSharePayload(kind='chart',drawingId=null){
    const p=this.activePane(),cfg=this.activeConfig();
    let drawing=drawingId?this.state.drawings.find(x=>x.id===drawingId):null;
    if(kind==='trade'&&!drawing){drawing=this.state.drawings.find(x=>x.id===this.state.selectedDrawingId&&['long','short'].includes(x.type))||null;}
    let forceStatus=null,metrics=null,replay=null;
    if(kind==='analytics'){
      // The current v8 analytics panel is explicitly demo history until a real broker-history source is connected.
      forceStatus='DEMO';const a=summarizeTrades(this.demoHistory,10000);metrics={totalTrades:a.totalTrades,winRate:a.winRate,net:a.net,profitFactor:a.profitFactor,maxDD:a.maxDD,maxDDPct:a.maxDDPct,expectancy:a.expectancy,avgR:a.avgR};
    }
    if(kind==='replay'){
      forceStatus='REPLAY';const r=this.state.replay,index=r.index||0,total=Math.max(1,p?.displayBars?.length||1),bar=p?.displayBars?.[index];replay={index,total,progressPct:Math.max(0,Math.min(100,index/Math.max(1,total-1)*100)),time:bar?.time?Number(bar.time)*1000:null};
    }
    const status=normalizeShareStatus({kind,connectionStatus:this.state.connection.status,replayActive:this.state.replay.active,forceStatus});
    return createSharePayload({kind,status,ref:this.state.share?.referralId,chart:{symbol:cfg.symbol,period:cloneSerializable(cfg.period),chartType:cfg.chartType},indicators:this.state.indicators,drawing,metrics,replay});
  }
  openShareCenter(kind='chart',drawingId=null){
    this.closeMenu();const payload=this.buildCurrentSharePayload(kind,drawingId),m=this.makeModal('Share with Trade Avata','share-center-modal'),b=el('div',{class:'settings-body'});m.main.replaceChildren(b);m.ok.style.display='none';m.cancel.textContent='Close';
    const summary=buildShareSummary(payload);
    b.append(el('div',{class:'side-card'},el('div',{style:'display:flex;align-items:center;gap:8px;flex-wrap:wrap'},el('span',{class:'status-badge'},payload.status),el('strong',{},kind==='trade'?'Share trade':kind==='replay'?'Share replay':kind==='analytics'?'Share analytics':'Share chart')),el('p',{},summary)));
    const actions=el('div',{class:'template-actions'},
      el('button',{class:'primary',onclick:()=>this.shareBrandedCard(payload)},'Share'),
      el('button',{class:'secondary',onclick:()=>this.copyShareLink(payload)},'Copy link'),
      el('button',{class:'secondary',onclick:()=>this.copyShareCard(payload)},'Copy image'),
      el('button',{class:'secondary',onclick:()=>this.downloadShareCard(payload)},'Download card'),
      el('button',{class:'secondary',onclick:()=>this.copyShareSummary(payload)},'Copy summary')
    );b.append(actions);
    b.append(el('div',{class:'side-card'},el('h4',{},'Zero-image-storage sharing'),el('p',{},'The chart card is rendered locally on this device. Trade Avata does not upload or keep this PNG. The current share link stores only compact chart/share metadata inside the URL; permanent rich social previews can later be generated temporarily by the backend without keeping screenshot files.')));
  }
  shareSelectedDrawing(){const id=this.state.selectedDrawingId,d=this.state.drawings.find(x=>x.id===id);if(!d)return;this.openShareCenter(['long','short'].includes(d.type)?'trade':'chart',id);}
  async shareBrandedCard(payload){
    const card=this.getShareCardCanvas(payload);if(!card){toast('Share card unavailable','error');return;}const blob=await this.canvasBlob(card);if(!blob)return;
    const url=buildStatelessShareUrl(payload),summary=buildShareSummary(payload),file=new File([blob],`trade-avata-${payload.kind}-${payload.chart?.symbol||'chart'}.png`,{type:'image/png'});
    try{
      if(navigator.share&&navigator.canShare?.({files:[file]})){await navigator.share({title:`Trade Avata · ${payload.chart?.symbol||'Chart'}`,text:summary,url,files:[file]});this.recordShareEvent('native_share',payload);}
      else if(navigator.share){await navigator.share({title:`Trade Avata · ${payload.chart?.symbol||'Chart'}`,text:summary,url});this.recordShareEvent('native_share_link',payload);}
      else{toast('System sharing is unavailable here. Use Copy link, Copy image or Download card.');}
    }catch(e){if(e?.name!=='AbortError')toast('Share was not completed.','error');}
  }
  getShareCardCanvas(payload){const snap=this.getScreenshotCanvas();return snap?createSocialCardCanvas(snap,payload):null;}
  canvasBlob(canvas){return new Promise(resolve=>{try{canvas.toBlob(b=>resolve(b),'image/png');}catch{resolve(null);}});}
  async copyShareCard(payload){
    const c=this.getShareCardCanvas(payload),b=c?await this.canvasBlob(c):null;if(!b){toast('Share card unavailable','error');return;}
    try{if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw new Error();await navigator.clipboard.write([new ClipboardItem({'image/png':b})]);this.recordShareEvent('copy_image',payload);toast('Branded share image copied','success');}catch{toast('Image copy is not supported here. Use Download card.','error');}
  }
  async downloadShareCard(payload){const c=this.getShareCardCanvas(payload),b=c?await this.canvasBlob(c):null;if(!b){toast('Share card unavailable','error');return;}downloadBlob(b,`trade-avata-${payload.kind}-${payload.chart?.symbol||'chart'}-${Date.now()}.png`);this.recordShareEvent('download_card',payload);toast('Branded share card downloaded','success');}
  async copyShareLink(payload){const url=buildStatelessShareUrl(payload);if(await this.copyText(url)){this.recordShareEvent('copy_link',payload);toast('Trade Avata share link copied','success');}else toast('Could not copy share link','error');}
  async copyShareSummary(payload){if(await this.copyText(buildShareSummary(payload))){this.recordShareEvent('copy_summary',payload);toast('Share summary copied','success');}else toast('Could not copy summary','error');}
  async copyText(text){
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch{}
    try{const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.append(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return !!ok;}catch{return false;}
  }
  applyIncomingShare(payload){
    if(!payload||payload.v!==1||payload.product!=='Trade Avata Chart')return;
    const p=this.activePane();if(!p)return;const allowedTypes=new Set(['Candles','Bars','Line','Area','Heikin-Ashi','Renko','Range']);const allowedModes=new Set(['time','tick','renko-pips','renko-time','range-pips']);
    const symbol=SYMBOLS[payload.chart?.symbol]?payload.chart.symbol:p.symbol,chartType=allowedTypes.has(payload.chart?.chartType)?payload.chart.chartType:p.chartType;
    const period=payload.chart?.period&&allowedModes.has(payload.chart.period.mode)?payload.chart.period:p.period;
    if(payload.indicators?.length){const imported=payload.indicators.map(i=>indicatorDefinition(i.kind)?makeIndicator(i.kind,{...i,id:`shared-${i.kind}-${Math.random().toString(36).slice(2,7)}`}):null).filter(Boolean);if(imported.length)this.state.indicators=imported;}
    p.setConfig({symbol,chartType,period},{home:true});
    if(payload.drawing?.points?.length){const allowed=new Set(['trend','ray','rectangle','fibonacci','arrow','channel','measure','horizontal','vertical','text','crossline','long','short']);if(allowed.has(payload.drawing.type)){const d=cloneSerializable(payload.drawing);d.id=`shared-draw-${Date.now()}`;d.paneId=p.id;d.hidden=false;d.locked=false;d.createdAt=Date.now();this.state.drawings.push(d);this.state.selectedDrawingId=d.id;this.state.selectedDrawingIds=[d.id];this.syncDrawingLayers();}}
    this.state.share.lastInboundRef=payload.ref||null;this.recordShareEvent('opened_share',payload,{persist:false});this.renderTopbar();toast(`${payload.status||'Shared'} ${payload.kind||'chart'} opened from Trade Avata share link`,'success');
  }
  openSnapshotMenu(anchor){
    const items=[
      {label:'Save chart image',action:()=>this.saveScreenshot()},
      {label:'Copy chart image',action:()=>this.copyScreenshot()},
      {label:'Share chart image',action:()=>this.shareScreenshot()},
      {label:'Copy chart link',action:()=>this.copyChartLink()},
      {label:'Share / marketing card',action:()=>this.openShareCenter('chart')},
      {label:'Copy branded share link',action:()=>this.copyShareLink(this.buildCurrentSharePayload('chart'))},
      {label:'Copy chart summary',action:()=>this.copyShareSummary(this.buildCurrentSharePayload('chart'))}
    ];this.openMenu(anchor,items,230);
  }
  getScreenshotCanvas(){return this.activePane()?.screenshot({metadata:true,drawings:true})||null;}
  saveScreenshot(){const c=this.getScreenshotCanvas();if(!c){toast('Screenshot unavailable','error');return;}c.toBlob(b=>{if(b)downloadBlob(b,`trade-avata-${this.activeConfig().symbol}-${Date.now()}.png`);},'image/png');}
  copyScreenshot(){const c=this.getScreenshotCanvas();if(!c)return;c.toBlob(async b=>{try{if(!b||!navigator.clipboard?.write)throw new Error();await navigator.clipboard.write([new ClipboardItem({'image/png':b})]);toast('Chart image copied','success');}catch{toast('Image copy is not supported by this browser. Use Save image instead.','error');}},'image/png');}
  shareScreenshot(){const c=this.getScreenshotCanvas();if(!c)return;c.toBlob(async b=>{if(!b)return;const file=new File([b],`trade-avata-${this.activeConfig().symbol}.png`,{type:'image/png'});try{if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({title:`Trade Avata · ${this.activeConfig().symbol}`,files:[file]});else{toast('System image sharing is not supported here. Use Save or Copy image.');}}catch{}},'image/png');}
  async copyChartLink(){try{const p=this.activeConfig(),u=new URL(location.href);u.searchParams.set('symbol',p.symbol);u.searchParams.set('period',periodKey(p.period));u.searchParams.set('type',p.chartType);if(await this.copyText(u.toString()))toast('Chart link copied','success');else throw new Error();}catch{toast('Could not copy chart link','error');}}
  openChartContextMenu(e,pane,ctx){
    this.setActivePaneById(pane.id);
    const virtual={getBoundingClientRect:()=>({left:e.clientX,top:e.clientY,right:e.clientX,bottom:e.clientY,width:0,height:0})};
    const price=Number(ctx.price);
    const items=[
      {label:'↶ Reset chart view',action:()=>pane.resetView()},
      {label:'View all data',action:()=>pane.viewAllData()},
      {label:`Copy price ${Number.isFinite(price)?formatPrice(pane.symbol,price):''}`,action:async()=>{if(await this.copyText(String(price)))toast('Price copied','success');else toast('Could not copy price','error');}},
      {label:`Add alert at ${Number.isFinite(price)?formatPrice(pane.symbol,price):'price'}`,action:()=>this.openAlertModalAtPrice(price)},
      ...((this.state.connection.status==='live'||this.state.replay.active)&&Number.isFinite(price)?[{label:`${this.state.replay.active?'Replay ':''}Create order at ${formatPrice(pane.symbol,price)}…`,action:()=>this.previewOrderAtPrice(pane,price)}]:[]),
      {label:'Object Tree',action:()=>this.toggleRightPanel('objects')},
      {label:'Chart template',action:()=>this.openTemplateManager()},
      {label:'Detach chart',action:()=>this.detachActiveChart()},
      {label:`Remove ${this.state.drawings.filter(d=>d.paneId===pane.id||d.syncAll).length} drawing(s)`,action:()=>this.removePaneDrawings(pane)},
      {label:'Settings…',action:()=>this.openSettings('symbol')}
    ];
    this.openMenu(virtual,items,300);
  }
  openAlertModalAtPrice(price){this.openAlertModal();setTimeout(()=>{const inputs=[...document.querySelectorAll('.modal input.field')];const value=inputs.find(i=>i.value&&/^\d/.test(i.value));if(value&&Number.isFinite(price)){value.value=String(price);value.dispatchEvent(new Event('input',{bubbles:true}));}},0);}
  removePaneDrawings(pane){const ids=this.state.drawings.filter(d=>d.paneId===pane.id||d.syncAll).map(d=>d.id);if(!ids.length)return;if(!confirm(`Remove ${ids.length} drawing(s) from this chart?`))return;this.pushDrawingHistory('remove chart drawings');this.state.drawings=this.state.drawings.filter(d=>!ids.includes(d.id));this.syncDrawingLayers();this.save();}

  openWorkspaceManager(){
    this.closeMenu();const m=this.makeModal('Saved Workspaces','workspace-manager-modal');const b=el('div',{class:'settings-body'});m.main.replaceChildren(b);m.ok.style.display='none';m.cancel.textContent='Close';
    b.append(el('div',{class:'side-card'},el('h4',{},'Workspaces'),el('p',{},'A workspace saves the multi-chart layout, symbols/periods, panel state, drawings and indicators. Chart Templates remain reusable single-chart setups.')));
    b.append(el('button',{class:'primary',onclick:()=>this.saveWorkspacePrompt()},'＋ Save current workspace'));
    if(!this.state.workspaces.length)b.append(el('div',{class:'empty-state'},'No saved workspaces yet.'));
    for(const ws of this.state.workspaces){
      const card=el('div',{class:'side-card workspace-card'},el('h4',{},ws.name),el('p',{},`${ws.config?.paneConfigs?.length||1} chart(s) · ${ws.config?.layout||'1'} layout`));
      card.append(el('div',{class:'template-actions'},
        el('button',{class:'primary',onclick:()=>this.applyWorkspace(ws.id)},'Open'),
        el('button',{class:'secondary',onclick:()=>this.renameWorkspace(ws.id)},'Rename'),
        el('button',{class:'secondary',onclick:()=>this.duplicateWorkspace(ws.id)},'Duplicate'),
        el('button',{class:'danger',onclick:()=>this.deleteWorkspace(ws.id)},'Delete')
      ));b.append(card);
    }
  }
  saveWorkspacePrompt(){
    const name=prompt('Workspace name:',`Workspace ${this.state.workspaces.length+1}`)?.trim();if(!name)return;
    this.syncPaneConfigs();const ws=captureWorkspace(this.state,{name});this.state.workspaces.push(ws);this.state.activeWorkspaceId=ws.id;this.save();this.openWorkspaceManager();toast(`Workspace "${name}" saved`,'success');
  }
  applyWorkspace(id){
    const ws=this.state.workspaces.find(x=>x.id===id);if(!ws)return;applyWorkspaceToState(this.state,ws);this.applyLayout(this.state.layout||'1',false);this.renderRightPanel();this.renderBottom();this.save();this.closeModal();toast(`Workspace "${ws.name}" opened`,'success');
  }
  renameWorkspace(id){const ws=this.state.workspaces.find(x=>x.id===id);if(!ws)return;const n=prompt('Rename workspace:',ws.name)?.trim();if(!n)return;ws.name=n;ws.updatedAt=new Date().toISOString();this.save();this.openWorkspaceManager();}
  duplicateWorkspace(id){const ws=this.state.workspaces.find(x=>x.id===id);if(!ws)return;const c=cloneSerializable(ws);c.id=`ws-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;c.name=`${ws.name} Copy`;c.createdAt=new Date().toISOString();c.updatedAt=c.createdAt;this.state.workspaces.push(c);this.save();this.openWorkspaceManager();}
  deleteWorkspace(id){const ws=this.state.workspaces.find(x=>x.id===id);if(!ws||!confirm(`Delete workspace "${ws.name}"?`))return;this.state.workspaces=this.state.workspaces.filter(x=>x.id!==id);this.save();this.openWorkspaceManager();}
  detachActiveChart(){
    const p=this.activePane();if(!p)return;
    if(this.detachedInfo.detached){window.close();toast('Close this window to return to the main workspace.');return;}
    this.syncPaneConfigs();this.save();const url=makeDetachedUrl({paneId:p.id,slot:this.state.activePane});const win=window.open(url,`trade-avata-${p.id}`,`popup=yes,width=1200,height=760,resizable=yes,scrollbars=no`);
    if(!win)toast('Popup blocked. Allow popups for Trade Avata, then try Detach Chart again.','error');else toast('Chart detached. Move the new window to another monitor.','success');
  }
  handleWorkspaceMessage(msg){
    if(!msg)return;const incoming=msg.payload||{};
    if(msg.type==='detached-sync'&&!this.detachedInfo.detached){
      if(Array.isArray(incoming.drawings))this.state.drawings=cloneSerializable(incoming.drawings);
      if(Array.isArray(incoming.indicators))this.state.indicators=cloneSerializable(incoming.indicators);
      const slot=Number(incoming.slot||0),cfg=incoming.paneConfig;
      if(cfg){this.state.paneConfigs[slot]=cloneSerializable(cfg);const pane=this.panes[slot];if(pane&&JSON.stringify({s:pane.symbol,p:pane.period,t:pane.chartType})!==JSON.stringify({s:cfg.symbol,p:cfg.period,t:cfg.chartType}))pane.setConfig(cfg,{home:false});}
      saveState(this.state);this.refreshDrawingLayers();return;
    }
    if(msg.type!=='state-sync')return;
    if(Array.isArray(incoming.drawings))this.state.drawings=cloneSerializable(incoming.drawings);if(Array.isArray(incoming.indicators))this.state.indicators=cloneSerializable(incoming.indicators);
    if(this.detachedInfo.detached&&Array.isArray(incoming.paneConfigs)){const cfg=incoming.paneConfigs[this.detachedInfo.slot]||incoming.paneConfigs[0];const p=this.activePane();if(cfg&&p&&JSON.stringify({s:p.symbol,p:p.period,t:p.chartType})!==JSON.stringify({s:cfg.symbol,p:cfg.period,t:cfg.chartType}))p.setConfig(cfg,{home:false});}
    this.refreshDrawingLayers();
  }
  applyPlatformTheme(){
    let theme=this.state.platformTheme||'dark';if(theme==='system')theme=matchMedia?.('(prefers-color-scheme: light)')?.matches?'light':'dark';
    document.documentElement.dataset.platformTheme=theme;document.body?.classList.toggle('theme-light',theme==='light');
  }

  toggleFullscreen(){if(!document.fullscreenElement)document.documentElement.requestFullscreen?.();else document.exitFullscreen?.();}
  resetWorkspace(){if(!confirm('Reset drawings, indicators and workspace layout to defaults?'))return;for(const k of ['tradeAvataChartV8State','tradeAvataChartV7State','tradeAvataChartV6State'])localStorage.removeItem(k);location.reload();}
  refreshAllCharts(){this.panes.forEach(p=>{p.refreshAppearance({preserveView:true});p.drawingLayer?.syncPointerMode();});this.renderTopbar();this.renderRightPanel();this.renderBottom();this.save();}
  onPaneRangeChanged(source,range){if(this.state.replay.active&&source===this.activePane()&&this.state.replay.follow){this.state.replay.follow=false;this.renderReplayControls(source);}if(!this.state.layoutSync.time)return;range=range||source.chart.timeScale().getVisibleLogicalRange?.();if(!range)return;this.panes.filter(p=>p!==source).forEach(p=>{try{p.chart.timeScale().setVisibleLogicalRange(range);}catch{}});}
  onCrosshair(source,param){if(!this.state.layoutSync.crosshair||!param?.time||!param.point)return;const price=source.priceAtCoordinate(param.point.y);if(price==null)return;this.panes.filter(p=>p!==source).forEach(p=>{try{p.chart.setCrosshairPosition(price,param.time,p.series);}catch{}});}
  installGlobalKeys(){
    window.addEventListener('keydown',e=>{
      const meta=e.ctrlKey||e.metaKey,key=e.key.toLowerCase();
      if(meta&&key==='z'){e.preventDefault();e.shiftKey?this.redo():this.undo();}
      else if((e.key==='Delete'||e.key==='Backspace')&&this.state.selectedDrawingId){e.preventDefault();this.deleteSelectedDrawings();}
      else if(meta&&key==='c'&&this.state.selectedDrawingId){const d=this.state.drawings.find(x=>x.id===this.state.selectedDrawingId);if(d){this.state.drawingClipboard=cloneSerializable(d);toast('Drawing copied');}}
      else if(meta&&key==='v'&&this.state.drawingClipboard){e.preventDefault();this.pushDrawingHistory('paste drawing');const d=cloneSerializable(this.state.drawingClipboard);d.id=`draw-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;d.points=d.points.map(p=>this.activePane().shiftPoint(p,4));d.paneId=this.activePane().id;this.state.drawings.push(d);this.state.selectedDrawingId=d.id;this.state.selectedDrawingIds=[d.id];this.syncDrawingLayers();this.save();}
      else if(meta&&key==='g'){e.preventDefault();this.state.gridH=!this.state.gridH;this.state.gridV=this.state.gridH;this.refreshAllCharts();}
      else if(e.key==='Home'){this.activePane()?.resetView();}
      else if(e.key==='End'){this.activePane()?.goLive();}
      else if(e.key==='F12'&&this.state.replay.active){e.preventDefault();this.replayStep(1);}
      else if(e.key==='Escape'){this.activePane()?.exitReplaySelection?.();this.state.replay.selecting=false;this.closeMenu();this.closeModal();this.state.selectedDrawingId=null;this.state.selectedDrawingIds=[];this.setTool('cursor');this.renderTopbar();}
    });
    window.addEventListener('resize',()=>this.panes.forEach(p=>p.resize()));
  }
  save(){
    this.syncPaneConfigs();
    if(this.detachedInfo.detached){
      this.bus?.send('detached-sync',{slot:this.detachedInfo.slot,paneConfig:this.state.paneConfigs[0],drawings:this.state.drawings,indicators:this.state.indicators});
      return;
    }
    saveState(this.state);
    this.bus?.send('state-sync',{paneConfigs:this.state.paneConfigs,drawings:this.state.drawings,indicators:this.state.indicators});
  }
  registerServiceWorker(){if('serviceWorker'in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('./sw.js').catch(()=>{});}
}
function capitalize(s){return s.charAt(0).toUpperCase()+s.slice(1);}
function setting(label,control,help=''){return el('div',{class:'setting-row'},el('div',{},el('label',{},label),help?el('small',{},help):null),control);}
function check(v,on){const l=el('label',{class:'check'});const i=el('input',{type:'checkbox'});i.checked=!!v;i.addEventListener('change',()=>on(i.checked));l.append(i,el('span',{},v?'On':'Off'));i.addEventListener('change',()=>l.querySelector('span').textContent=i.checked?'On':'Off');return l;}
function checkMenu(label,v,on){const b=el('label',{class:'menu-item check'});const i=el('input',{type:'checkbox'});i.checked=!!v;i.addEventListener('change',()=>on(i.checked));b.append(i,el('span',{},label));return b;}
function select(options,value,on){const s=el('select',{class:'select'});options.forEach(o=>{const val=Array.isArray(o)?o[0]:o,label=Array.isArray(o)?o[1]:o;const op=el('option',{value:val},label);if(String(val)===String(value))op.selected=true;s.append(op);});s.addEventListener('change',()=>on(s.value));return s;}
function numberInput(value,on){const i=el('input',{class:'field',type:'number',value,step:'any'});i.addEventListener('change',()=>on(i.value));return i;}
function textInput(value,on){const i=el('input',{class:'field',value});i.addEventListener('input',()=>on(i.value));return i;}
function colorInput(value,on){const i=el('input',{class:'field',type:'color',value});i.addEventListener('input',()=>on(i.value));return i;}
function rangeInput(value,min,max,step,on){const w=el('div',{style:'display:flex;align-items:center;gap:8px'}),r=el('input',{type:'range',min,max,step,value}),out=el('span',{},String(value));r.addEventListener('input',()=>{out.textContent=r.value;on(r.value)});w.append(r,out);return w;}
function palette(colors,current,on){const p=el('div',{class:'palette'});colors.forEach(c=>p.append(el('button',{class:`swatch ${c===current?'active':''}`,style:`background:${c}`,title:c,onclick:e=>{p.querySelectorAll('.swatch').forEach(x=>x.classList.remove('active'));e.currentTarget.classList.add('active');on(c);}})));return p;}
function toggleCard(label,v,on){return el('div',{class:'side-card'},el('h4',{},label),el('button',{class:'secondary',onclick:on},v?'On':'Off'));}


function money(v){const n=Number(v)||0;return `${n>=0?'+':''}$${Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`.replace('+$-','-$');}
function simpleBars(title,values=[]){
  const box=el('div',{class:'side-card analytics-chart'},el('h4',{},title));if(!values.length)return box;
  const min=Math.min(...values),max=Math.max(...values),span=Math.max(1e-9,max-min);const svg=el('svg',{viewBox:'0 0 600 120',preserveAspectRatio:'none'});
  const pts=values.map((v,i)=>`${i/(Math.max(1,values.length-1))*600},${110-(v-min)/span*95}`).join(' ');svg.innerHTML=`<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke"/>`;box.append(svg);return box;
}
function perfTable(title,rows){
  const box=el('div',{class:'side-card'},el('h4',{},title));const t=el('table',{class:'data-table'});t.innerHTML='<thead><tr><th>Group</th><th>Trades</th><th>Win rate</th><th>Net</th></tr></thead>';const b=el('tbody');for(const row of rows){const tr=el('tr');row.forEach((v,i)=>tr.append(el('td',{class:i===3&&String(v).startsWith('+')?'pos':i===3&&String(v).startsWith('-')?'neg':''},String(v))));b.append(tr);}t.append(b);box.append(t);return box;
}
function tradeTable(trades){
  const t=el('table',{class:'data-table'});t.innerHTML='<thead><tr><th>Symbol</th><th>Side</th><th>P&L</th><th>R</th><th>Pips</th><th>Duration</th></tr></thead>';const b=el('tbody');for(const x of trades.slice().reverse()){const tr=el('tr');const vals=[x.symbol,x.side,money(x.pnl),`${Number(x.rMultiple||0).toFixed(2)}R`,Number(x.pips||0).toFixed(1),formatDuration(new Date(x.closeTime)-new Date(x.openTime))];vals.forEach((v,i)=>tr.append(el('td',{class:i===2?(Number(x.pnl)>=0?'pos':'neg'):''},v)));b.append(tr);}t.append(b);return t;
}
const CANDLE_PRESETS=[
  ['Teal / Red','#00c7b1','#ff4d57','#00b9a5','#f34450','#00aa99','#ef5861'],
  ['Trading Dark','#089981','#f23645','#089981','#f23645','#089981','#f23645'],
  ['Classic Green / Red','#26a69a','#ef5350','#26a69a','#ef5350','#26a69a','#ef5350'],
  ['Blue / Red','#2962ff','#f23645','#1d4ed8','#dc2626','#2962ff','#f23645'],
  ['Emerald / Rose','#10b981','#f43f5e','#059669','#e11d48','#10b981','#f43f5e'],
  ['Cyan / Orange','#06b6d4','#f97316','#0891b2','#ea580c','#06b6d4','#f97316'],
  ['Lime / Crimson','#84cc16','#e11d48','#65a30d','#be123c','#84cc16','#e11d48'],
  ['Aqua / Magenta','#14b8a6','#d946ef','#0f766e','#c026d3','#14b8a6','#d946ef'],
  ['Sky / Scarlet','#0ea5e9','#ef4444','#0284c7','#dc2626','#0ea5e9','#ef4444'],
  ['Mint / Coral','#34d399','#fb7185','#10b981','#f43f5e','#34d399','#fb7185'],
  ['White / Red','#e5e7eb','#ef4444','#9ca3af','#dc2626','#d1d5db','#ef4444'],
  ['Yellow / Purple','#eab308','#8b5cf6','#ca8a04','#7c3aed','#eab308','#8b5cf6'],
  ['Green / Black','#22c55e','#111827','#16a34a','#030712','#22c55e','#111827'],
  ['Navy / Orange','#3b82f6','#f59e0b','#2563eb','#d97706','#3b82f6','#f59e0b'],
  ['Turquoise / Pink','#2dd4bf','#ec4899','#14b8a6','#db2777','#2dd4bf','#ec4899'],
  ['Soft Green / Soft Red','#6ee7b7','#fda4af','#34d399','#fb7185','#6ee7b7','#fda4af'],
  ['Ice / Fire','#67e8f9','#fb923c','#22d3ee','#f97316','#67e8f9','#fb923c'],
  ['Gold / Violet','#fbbf24','#a78bfa','#f59e0b','#8b5cf6','#fbbf24','#a78bfa'],
  ['Monochrome','#d1d5db','#6b7280','#9ca3af','#4b5563','#d1d5db','#6b7280'],
  ['High Contrast','#00ff99','#ff1744','#00cc77','#d50000','#00ff99','#ff1744']
];
function candlePaletteGrid(on){
  const g=el('div',{class:'candle-preset-grid'});for(const [name,up,down,ub,db,uw,dw] of CANDLE_PRESETS){const b=el('button',{class:'candle-preset',title:name,onclick:()=>on({upBody:up,downBody:down,upBorder:ub,downBorder:db,upWick:uw,downWick:dw,borderVisible:true,wickVisible:true})},el('span',{style:`background:${up}`}),el('span',{style:`background:${down}`}),el('small',{},name));g.append(b);}return g;
}
function rgbToHex(v){if(!v)return null;if(/^#[0-9a-f]{6}$/i.test(v))return v;const m=String(v).match(/\d+/g);if(!m||m.length<3)return null;return '#'+m.slice(0,3).map(x=>Number(x).toString(16).padStart(2,'0')).join('');}
function hexToRgba(hex,a=.12){const h=String(hex).replace('#','');if(h.length!==6)return `rgba(40,150,255,${a})`;const n=parseInt(h,16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${a})`;}

function boot(){
  new TradeAvataApp();
}
boot();
