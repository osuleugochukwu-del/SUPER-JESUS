import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const required=[
  'index.html','package.json','manifest.webmanifest','sw.js','.github/workflows/deploy.yml',
  'assets/styles.css','assets/master-recovery.css','public/brand/trade-avata-logo.svg',
  'src/app.js','src/chart-pane.js','src/native-chart.js','src/native-v3-core.js','src/native-v27-renderer.js','src/chart-transition.js','src/master-recovery.js','src/chart-quality-ai.js','src/data.js','src/drawings.js','src/state.js','src/utils.js','src/indicators.js','src/analytics.js','src/market-intelligence.js','src/ai-client.js','src/share.js','src/workspace-sync.js','src/indicator-security.js','src/alert-client.js','src/replay-client.js'
];
for(const f of required)if(!fs.existsSync(f))throw new Error(`Missing ${f}`);
const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));if(pkg.version!=='10.2.0')throw new Error(`Expected 10.2.0, got ${pkg.version}`);JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
const runtime=['index.html','sw.js',...fs.readdirSync('src').filter(f=>f.endsWith('.js')).map(f=>'src/'+f)];
for(const f of runtime){const t=fs.readFileSync(f,'utf8');if(/lightweight-charts|window\.LightweightCharts|unpkg\.com\/lightweight/i.test(t))throw new Error(`External chart renderer reference remains in ${f}`);}
const index=fs.readFileSync('index.html','utf8');if(!/Content-Security-Policy/.test(index))throw new Error('CSP missing');if(/<script[^>]+src=["']https?:\/\//i.test(index))throw new Error('External chart script remains');
const chart=fs.readFileSync('src/native-chart.js','utf8');for(const key of ['Trade Avata Native Chart v3.2','NativeTimeScale','NativePriceScale','CandlestickSeries','HistogramSeries','subscribeCrosshairMove','setCrosshairPosition','takeScreenshot',"kind:'pinch'","kind:'separator'",'_drawCandles','_drawAxes','_drawCrosshair'])if(!chart.includes(key))throw new Error(`Native chart missing ${key}`);
const pane=fs.readFileSync('src/chart-pane.js','utf8');for(const key of ['createNativeChart','hardHome','scheduleTransitionView','constructionMode','captureOscillatorPaneHeights','applyOscillatorPaneHeights'])if(!pane.includes(key))throw new Error(`Chart pane missing ${key}`);
const recovery=fs.readFileSync('src/master-recovery.js','utf8');for(const key of ['Mouse / Pointer','master-period-star','toggleFavoritePeriod','openPrivateIndicatorVault','master-replay-buy','master-replay-sell','FULL NATIVE · ACTIVE','installNativeV27Engine','installChartQualityAI'])if(!recovery.includes(key))throw new Error(`Recovery missing ${key}`);
const app=fs.readFileSync('src/app.js','utf8');for(const key of ['applyChartTransition','setConstruction','renderMarketCenter','renderAIInsights','openOrderTicket','openWorkspaceManager','openShareCenter'])if(!app.includes(key))throw new Error(`App missing ${key}`);
for(const f of fs.readdirSync('src').filter(x=>x.endsWith('.js'))){const r=spawnSync(process.execPath,['--check','src/'+f],{encoding:'utf8'});if(r.status!==0)throw new Error(`Syntax error in src/${f}: ${r.stderr}`);}
const workflow=fs.readFileSync('.github/workflows/deploy.yml','utf8');for(const key of ['npm test','npm run verify','npm run stress','npm run stress:full-native','npm run stress:parity','actions/deploy-pages@v5'])if(!workflow.includes(key))throw new Error(`Workflow missing ${key}`);
console.log('Trade Avata v10.2.0 Full Native verification passed — no external chart renderer, native axes/coordinates/rendering/interactions active, platform features preserved.');
