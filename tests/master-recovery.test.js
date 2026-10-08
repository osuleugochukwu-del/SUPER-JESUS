import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=
  fs.readFileSync(
    new URL(
      '../src/app.js',
      import.meta.url
    ),
    'utf8'
  );

const pane=
  fs.readFileSync(
    new URL(
      '../src/chart-pane.js',
      import.meta.url
    ),
    'utf8'
  );

const recovery=
  fs.readFileSync(
    new URL(
      '../src/master-recovery.js',
      import.meta.url
    ),
    'utf8'
  );

const html=
  fs.readFileSync(
    new URL(
      '../index.html',
      import.meta.url
    ),
    'utf8'
  );

test(
  'master recovery is wired without changing the approved shell entry points',
  ()=>{
    assert.match(
      html,
      /assets\/master-recovery\.css/
    );

    assert.match(
      html,
      /src\/master-recovery\.js/
    );

    assert.match(
      html,
      /id="topbar"/
    );

    assert.match(
      html,
      /id="leftbar"/
    );

    assert.match(
      html,
      /id="right-rail"/
    );

    assert.match(
      html,
      /id="bottom-panel"/
    );
  }
);

test(
  'hardcoded signal badges and redundant chart style selector are removed',
  ()=>{
    assert.doesNotMatch(
      pane,
      /signal-badge signal-(?:buy|sell)/
    );

    assert.doesNotMatch(
      app,
      /class:'toolbar-select chart-type-select'/
    );
  }
);

test(
  'AI conversation is not automatically granted to admin role',
  ()=>{
    const fn=
      app.match(
        /canUseAIChat\(\)\{[\s\S]*?\n  \}/
      )?.[0]||'';

    assert.ok(
      fn.length>0
    );

    assert.doesNotMatch(
      fn,
      /u\.role==='admin'/
    );

    assert.match(
      fn,
      /u\.role==='owner'/
    );

    assert.match(
      fn,
      /permissions/
    );
  }
);

test(
  'pointer, mobile drawing and chart controls are present',
  ()=>{
    for(
      const key of[
        'Mouse / Pointer',
        'ta-drawing-active',
        'ta-return-live',
        'ta-master-nav',
        'master-replay-grab'
      ]
    ){
      assert.match(
        recovery,
        new RegExp(
          key.replace(
            /[.*+?^${}()|[\]\\]/g,
            '\\$&'
          )
        )
      );
    }
  }
);

test(
  'indicator attached list and Eye Edit Remove controls are present',
  ()=>{
    for(
      const key of[
        'On this chart',
        'master-ind-actions',
        'toggleIndicatorVisibility',
        'openIndicatorSettings',
        'Remove'
      ]
    ){
      assert.match(
        recovery,
        new RegExp(key)
      );
    }
  }
);

test(
  'risk reward, oscillator guides, replay trading, themes and vault are present',
  ()=>{
    for(
      const key of[
        'riskReward=1',
        'OSC_GUIDES',
        'master-replay-buy',
        'master-replay-sell',
        'master-theme-grid',
        'openPrivateIndicatorVault',
        'Build & Validate'
      ]
    ){
      assert.match(
        recovery,
        new RegExp(
          key.replace(
            /[&]/g,
            '&'
          )
        )
      );
    }
  }
);

test(
  'v9.3 delegates construction switching to the single app transition controller',
  ()=>{
    assert.match(recovery,/function installAtomicConstructionSwitch\(app\)/);
    assert.match(recovery,/app\.__masterConstructionController='app\.applyChartTransition'/);
    assert.match(app,/applyChartTransition\(nextConfig=\{\},options=\{\}\)/);
    assert.match(app,/setConstruction\(chartType,period,options=\{\}\)/);
    assert.doesNotMatch(recovery,/app\.setPeriod\s*=/);
  }
);

test(
  'Heiken Ashi and all period choices use setConstruction without double rebuild calls',
  ()=>{
    assert.match(recovery,/'Heikin-Ashi'/);
    const periodButton=recovery.match(/function periodButton[\s\S]*?function patchConstructionMenu/)?.[0]||'';
    assert.ok(periodButton.length>0);
    assert.match(periodButton,/setConstruction/);
    assert.doesNotMatch(periodButton,/setChartType\(chartType\).*setPeriod\(period\)/s);
  }
);

test(
  'Renko Time and Renko Pips remain separate construction modes',
  ()=>{
    assert.match(recovery,/mode:'renko-time'/);
    assert.match(recovery,/mode:'renko-pips'/);
    assert.match(recovery,/\['renko-time','Renko Time'\]/);
    assert.match(recovery,/\['renko-pips','Renko Pips'\]/);
  }
);

test(
  'construction menu opens on the active construction and tabs do not mutate the chart',
  ()=>{
    assert.match(recovery,/function currentConstruction\(app\)/);
    assert.match(recovery,/let active=\s*currentConstruction\(this\)/);
    assert.match(recovery,/Tabs are navigation only/);
    assert.doesNotMatch(recovery,/const applyTab=id=>/);
  }
);

test(
  'period rows restore favourite stars for candle Heiken Renko and range choices',
  ()=>{
    assert.match(recovery,/master-period-star/);
    assert.match(recovery,/toggleFavoritePeriod/);
    assert.match(recovery,/favorite\?'★':'☆'/);
  }
);
