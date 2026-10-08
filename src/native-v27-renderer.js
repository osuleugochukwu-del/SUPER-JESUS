/*
 * Trade Avata Native compatibility bridge.
 *
 * Historical name retained so the mature workspace and Master Recovery do not
 * lose any entry points. The actual visible chart is now Trade Avata Native
 * v3.x (src/native-chart.js). There is no external chart-library
 * renderer underneath this bridge.
 */

export const NATIVE_BUILD='Trade Avata Native v3.2 Full Native';

class NativeWorkspaceBridge{
  constructor(pane){this.pane=pane;this.app=pane.app;this.lastRenderMs=0;this.frameCount=0;this.sync();}
  active(){return this.app.state?.chartEngines?.active!=='legacy';}
  sync(){
    const active=this.active();
    this.pane.root?.classList?.toggle('ta-native-engine-active',active);
    this.pane.root?.classList?.toggle('ta-native-renko-active',active&&['renko-pips','renko-time'].includes(this.pane.period?.mode));
    this.pane.chart?.requestRender?.();
    return active;
  }
  render(){const t=performance?.now?.()??Date.now();this.pane.chart?.requestRender?.();this.lastRenderMs=(performance?.now?.()??Date.now())-t;this.frameCount++;this.app.__chartQuality?.recordNativeRender?.(this.pane,this.lastRenderMs);}
  resize(){this.pane.chart?.resize?.();}
  clear(){}
  destroy(){}
}

function attachPane(pane){
  if(!pane||pane.nativeV27Renderer)return pane?.nativeV27Renderer||null;
  const r=new NativeWorkspaceBridge(pane);pane.nativeV27Renderer=r;
  return r;
}

export function installNativeV27Engine(app){
  app.state.chartEngines={
    nativeEnabled:true,
    active:'native',
    ...(app.state.chartEngines||{}),
    nativeEnabled:true,
    active:'native'
  };

  const bind=()=>{for(const p of app.panes||[])attachPane(p)?.sync();};
  bind();

  if(!app.__nativeV3LayoutWrapped){
    app.__nativeV3LayoutWrapped=true;
    const original=app.applyLayout?.bind(app);
    if(original){
      app.applyLayout=function(...args){const r=original(...args);queueMicrotask(bind);setTimeout(bind,0);return r;};
    }
  }

  app.setChartEngine=function(engine='native'){
    if(engine!=='native'){
      console.warn('Trade Avata is full-native. No alternate chart renderer is installed.');
    }
    this.state.chartEngines.active='native';
    this.state.chartEngines.nativeEnabled=true;
    bind();this.save?.();return 'native';
  };

  app.getChartEngine=()=> 'native';
  globalThis.__tradeAvataNativeEngine={
    build:NATIVE_BUILD,
    architecture:'full-native',
    dependencyFree:true,
    bind
  };

  return{bind,build:NATIVE_BUILD};
}
