import {
  TIMEFRAMES, RENKO_PIP_PERIODS, RANGE_PIP_PERIODS, RENKO_TIME_PERIODS,
  periodKey, describePeriod
} from './data.js';
import { BUILTIN_INDICATORS, indicatorDefinition, makeIndicator } from './indicators.js';
import { DrawingLayer } from './drawings.js';
import { installNativeV27Engine } from './native-v27-renderer.js';
import { installChartQualityAI } from './chart-quality-ai.js';

const BUILD='Trade Avata Master Recovery v9.3.0';
const POSITION_TYPES=new Set(['long','short']);

const OSC_GUIDES={
  rsi:[30,50,70],
  stochastic:[20,50,80],
  macd:[0],
  adx:[20,25,50],
  cci:[-100,0,100],
  momentum:[100],
  roc:[0]
};

const THEMES=[
  ['default','Trade Avata'],
  ['midnight','Midnight'],
  ['graphite','Graphite'],
  ['navy','Navy'],
  ['slate','Slate'],
  ['light','Light']
];

const COLORS=[
  '#168cff',
  '#089981',
  '#f23645',
  '#f3a000',
  '#8b5cf6',
  '#06b6d4',
  '#14b8a6',
  '#ec4899',
  '#eab308',
  '#ffffff',
  '#94a3b8',
  '#111820'
];

const h=(tag,attrs={},...children)=>{
  const n=document.createElement(tag);

  for(const [k,v] of Object.entries(attrs||{})){
    if(k==='class'){
      n.className=v;
    }else if(k==='text'){
      n.textContent=v;
    }else if(k==='html'){
      n.innerHTML=v;
    }else if(k.startsWith('on')&&typeof v==='function'){
      n.addEventListener(
        k.slice(2).toLowerCase(),
        v
      );
    }else if(v!==false&&v!=null){
      n.setAttribute(
        k,
        String(v)
      );
    }
  }

  for(const c of children.flat()){
    if(c!=null){
      n.append(
        c?.nodeType
          ?c
          :document.createTextNode(String(c))
      );
    }
  }

  return n;
};

const btn=(
  label,
  action,
  cls='secondary',
  title=''
)=>h(
  'button',
  {
    class:cls,
    title,
    onclick:e=>{
      e.preventDefault();
      e.stopPropagation();
      action?.(e);
    }
  },
  label
);

const clamp=(v,a,b)=>
  Math.max(
    a,
    Math.min(b,v)
  );

const isDrawingTool=t=>
  !!t&&
  ![
    'cursor',
    'crosshair',
    'magnet',
    'lock',
    'hide',
    'more-draw'
  ].includes(t);

function waitForApp(){

  return new Promise(resolve=>{

    const tick=()=>{

      if(window.__tradeAvata){
        resolve(
          window.__tradeAvata
        );
      }else{
        setTimeout(
          tick,
          15
        );
      }
    };

    tick();
  });
}

function migrateState(app){

  const s=app.state;

  s.masterRecoveryVersion='9.3.0';

  s.recentColors=
    Array.isArray(s.recentColors)
      ?s.recentColors.slice(0,12)
      :[];

  s.platformTheme=
    ['dark','system'].includes(
      s.platformTheme
    )
      ?'default'
      :(s.platformTheme||'default');

  if(
    !THEMES.some(
      ([id])=>id===s.platformTheme
    )
  ){
    s.platformTheme='default';
  }

  s.chartEngines={
    nativeEnabled:true,
    active:'native',
    architecture:'full-native'
  };

  s.replay=
    s.replay||{};

  s.replay.toolbarPos=
    s.replay.toolbarPos||null;

  /*
   * Do not inject permanent signal studies.
   * If a clean workspace has no study,
   * EMA is the only default.
   */

  if(
    !Array.isArray(
      s.indicators
    )
  ){
    s.indicators=[];
  }

  if(
    !s.indicators.length
  ){
    const ema=
      makeIndicator(
        'ema',
        {
          name:'EMA 20',
          length:20,
          color:'#168cff'
        }
      );

    if(ema){
      s.indicators.push(
        ema
      );
    }
  }

  app.save?.();
}

function patchAI(app){

  app.canUseAIChat=function(){

    const u=
      this.state
        .connection
        ?.tradeAvataUser||{};

    const perms=
      Array.isArray(
        u.permissions
      )
        ?u.permissions
        :[];

    const ent=
      u.entitlements||{};

    return(
      this.isLocalOwnerPreview?.()||
      u.role==='owner'||
      perms.includes('ai_chat')||
      ent.aiChat===true||
      ent.ai_chat===true
    );
  };
}

function patchTopbar(app){

  const original=
    app.renderTopbar.bind(app);

  app.renderTopbar=function(){

    original();

    document
      .querySelector(
        '.chart-type-select'
      )
      ?.remove();

    const more=
      document.querySelector(
        '.tf-more'
      );

    if(more){
      more.textContent='Chart ▾';
      more.title=
        'Chart construction & interval';

      more.classList.add(
        'master-chart-menu'
      );
    }

    const first=
      document.querySelector(
        '#leftbar .left-tool'
      );

    if(first){
      first.title=
        'Mouse / Pointer — return to normal chart control';

      first.dataset.masterPointer='1';
    }
  };
}

function patchLeftbar(app){

  const original=
    app.renderLeftbar.bind(app);

  app.renderLeftbar=function(){

    original();

    const first=
      document.querySelector(
        '#leftbar .left-tool'
      );

    if(first){
      first.title=
        'Mouse / Pointer — return to normal chart control';

      first.setAttribute(
        'aria-label',
        'Mouse / Pointer'
      );
    }
  };
}

function currentConstruction(app){

  const cfg=
    app.activeConfig?.()||{};

  const mode=
    cfg.period?.mode||'time';

  if(mode==='renko-time'){
    return'renko-time';
  }

  if(mode==='renko-pips'){
    return'renko-pips';
  }

  if(
    mode==='range-pips'||
    ['Bars','Line','Area']
      .includes(cfg.chartType)
  ){
    return'misc';
  }

  if(
    cfg.chartType==='Heikin-Ashi'
  ){
    return'heikin';
  }

  return'candles';
}

function preferredTimePeriod(app){

  const cfg=
    app.activeConfig?.()||{};

  if(
    cfg.period?.mode==='time'
  ){
    return structuredClone(
      cfg.period
    );
  }

  return{
    mode:'time',
    value:
      app.state.timeframe||
      cfg.timeframe||
      '15s'
  };
}

function installAtomicConstructionSwitch(app){

  /*
   * v9.3: there is exactly one chart-transition authority and it lives in
   * TradeAvataApp.applyChartTransition().  Master Recovery must never wrap
   * setPeriod() or create a second construction pipeline again.
   */
  if(
    typeof app.setConstruction!=='function'||
    typeof app.applyChartTransition!=='function'
  ){
    throw new Error('Trade Avata transition controller is unavailable');
  }

  app.__masterConstructionController='app.applyChartTransition';
}

function periodButton(
  app,
  period,
  label,
  {
    chartType='Candles'
  }={}
){

  const key=periodKey(period);
  const displayLabel=(label==null||label==='')?describePeriod(period):String(label);
  const cfg=app.activeConfig();
  const active=
    periodKey(cfg.period)===key&&
    cfg.chartType===chartType;

  const favorites=
    Array.isArray(app.state.favoritePeriods)
      ?app.state.favoritePeriods
      :[];

  const favorite=
    favorites.some(
      x=>periodKey(x)===key
    );

  const row=h(
    'button',
    {
      class:`master-period-row ${active?'active':''}`,
      onclick:()=>{
        app.setConstruction(
          chartType,
          period,
          {
            closeMenu:true
          }
        );
      }
    },
    h(
      'span',
      {
        class:'period-name'
      },
      displayLabel
    )
  );

  const star=h(
    'span',
    {
      class:`star master-period-star ${favorite?'on':''}`,
      title:favorite?'Remove from favourites':'Add to favourites',
      onclick:e=>{
        e.preventDefault();
        e.stopPropagation();
        app.toggleFavoritePeriod?.(period);
        star.textContent=star.textContent==='★'?'☆':'★';
        star.classList.toggle('on');
      }
    },
    favorite?'★':'☆'
  );

  row.append(
    star,
    active
      ?h(
          'span',
          {
            class:'period-active'
          },
          '✓'
        )
      :null
  );

  return row;
}

function patchConstructionMenu(app){

  installAtomicConstructionSwitch(app);

  app.openTimeframeMenu=function(anchor){

    const menu=
      this.createMenu(
        anchor,
        360,
        innerWidth<=780
          ?'interval-sheet master-period-menu'
          :'master-period-menu'
      );

    menu.append(
      h(
        'div',
        {
          class:'master-menu-head'
        },

        h(
          'div',
          {},
          h(
            'strong',
            {
              text:
                'Chart construction'
            }
          ),

          h(
            'small',
            {
              text:
                'Choose Candlestick, Heiken Ashi, Renko Time or Renko Pips.'
            }
          )
        ),

        btn(
          '×',
          ()=>this.closeMenu(),
          'panel-close'
        )
      )
    );

    const tabs=
      h(
        'div',
        {
          class:
            'master-construction-tabs'
        }
      );

    const content=
      h(
        'div',
        {
          class:
            'master-construction-content'
        }
      );

    const defs=[
      ['candles','Candlestick'],
      ['heikin','Heiken Ashi'],
      ['renko-time','Renko Time'],
      ['renko-pips','Renko Pips'],
      ['misc','Miscellaneous']
    ];

    let active=
      currentConstruction(this);

    /*
     * Tabs are navigation only. Merely opening Renko Time / Renko Pips / Heiken
     * Ashi must never rebuild the chart. The chart changes only after the user
     * chooses an actual interval/brick size.
     */

    const render=()=>{

      [
        ...tabs.children
      ].forEach(
        x=>
          x.classList.toggle(
            'active',
            x.dataset.id===active
          )
      );

      content.replaceChildren();

      if(
        active==='candles'||
        active==='heikin'
      ){

        const ct=
          active==='heikin'
            ?'Heikin-Ashi'
            :'Candles';

        const groups=[
          [
            'Seconds',
            TIMEFRAMES.filter(
              ([v])=>v.endsWith('s')
            )
          ],
          [
            'Minutes',
            TIMEFRAMES.filter(
              ([v])=>v.endsWith('m')
            )
          ],
          [
            'Hours',
            TIMEFRAMES.filter(
              ([v])=>v.endsWith('h')
            )
          ],
          [
            'Higher',
            TIMEFRAMES.filter(
              ([v])=>
                [
                  '1D',
                  '1W',
                  '1M'
                ].includes(v)
            )
          ]
        ];

        for(
          const[
            name,
            arr
          ]of groups
        ){

          content.append(
            h(
              'div',
              {
                class:'master-subtitle',
                text:name
              }
            )
          );

          for(
            const[
              value,
              label
            ]of arr
          ){
            content.append(
              periodButton(
                this,
                {
                  mode:'time',
                  value
                },
                label,
                {
                  chartType:ct
                }
              )
            );
          }
        }

        content.append(
          btn(
            '＋ Custom interval',
            ()=>{

              const v=
                prompt(
                  'Custom interval (examples: 12s, 7m, 6h):',
                  '12s'
                );

              if(v){
                this.setConstruction(
                  ct,
                  {
                    mode:'time',
                    value:v
                  },
                  {
                    home:true
                  }
                );

                this.closeMenu();
              }
            },
            'master-custom-btn'
          )
        );

      }else if(
        active==='renko-time'
      ){

        content.append(
          h(
            'p',
            {
              class:'master-help',
              text:
                'Renko Time evaluates brick movement at each selected time bucket.'
            }
          )
        );

        for(
          const value of
          RENKO_TIME_PERIODS
        ){
          content.append(
            periodButton(
              this,
              {
                mode:'renko-time',
                value
              },
              `Renko Time · ${value}`,
              {
                chartType:'Candles'
              }
            )
          );
        }

        content.append(
          btn(
            '＋ Custom Renko time',
            ()=>{

              const v=
                prompt(
                  'Renko Time interval (examples: 15s, 2m, 1h):',
                  '1m'
                );

              if(v){
                this.setConstruction(
                  'Candles',
                  {
                    mode:'renko-time',
                    value:v
                  },
                  {
                    home:true
                  }
                );

                this.closeMenu();
              }
            },
            'master-custom-btn'
          )
        );

      }else if(
        active==='renko-pips'
      ){

        content.append(
          h(
            'p',
            {
              class:'master-help',
              text:
                'Price Renko. Choose a brick size or set your own pip value.'
            }
          )
        );

        for(
          const value of
          RENKO_PIP_PERIODS
        ){
          content.append(
            periodButton(
              this,
              {
                mode:'renko-pips',
                value
              },
              `${value} pips`,
              {
                chartType:'Candles'
              }
            )
          );
        }

        content.append(
          btn(
            '＋ Custom pip size',
            ()=>{

              const v=
                Number(
                  prompt(
                    'Renko brick size in pips:',
                    '10'
                  )
                );

              if(v>0){

                this.setConstruction(
                  'Candles',
                  {
                    mode:'renko-pips',
                    value:v
                  },
                  {
                    home:true
                  }
                );

                this.closeMenu();
              }
            },
            'master-custom-btn'
          )
        );

      }else{

        content.append(
          h(
            'p',
            {
              class:'master-help',
              text:
                'Secondary chart styles stay here so they do not compete with the four main Trade Avata constructions.'
            }
          )
        );

        for(
          const type of
          [
            'Bars',
            'Line',
            'Area'
          ]
        ){
          content.append(
            btn(
              type,
              ()=>{
                this.setConstruction(
                  type,
                  preferredTimePeriod(this),
                  {
                    home:true
                  }
                );

                this.closeMenu();
              },
              'master-period-row'
            )
          );
        }

        content.append(
          h(
            'div',
            {
              class:'master-subtitle',
              text:'Range Pips'
            }
          )
        );

        for(
          const value of
          RANGE_PIP_PERIODS
        ){
          content.append(
            periodButton(
              this,
              {
                mode:'range-pips',
                value
              },
              `Range · ${value} pips`,
              {
                chartType:'Candles'
              }
            )
          );
        }
      }
    };

    defs.forEach(
      ([id,label])=>
        tabs.append(
          h(
            'button',
            {
              'data-id':id,
              class:
                id===active
                  ?'active'
                  :'',
              onclick:()=>{
                active=id;
                render();
              }
            },
            label
          )
        )
    );

    menu.append(
      tabs,
      content
    );

    render();
  };
}

function removeIndicator(
  app,
  id
){
  app.state.indicators=
    app.state.indicators.filter(
      x=>x.id!==id
    );

  app.refreshAllCharts();
  app.save();
}

function rememberColor(
  app,
  c
){

  if(!c)return;

  const a=
    app.state.recentColors||[];

  app.state.recentColors=[
    c,
    ...a.filter(
      x=>x!==c
    )
  ].slice(0,12);

  app.save();
}

function colorChooser(
  app,
  current,
  onChange
){

  const wrap=
    h(
      'div',
      {
        class:
          'master-color-chooser'
      }
    );

  const row=
    h(
      'div',
      {
        class:
          'master-color-grid'
      }
    );

  for(
    const c of
    COLORS
  ){
    row.append(
      h(
        'button',
        {
          class:
            `master-swatch ${
              c.toLowerCase()===
              String(current)
                .toLowerCase()
                ?'active'
                :''
            }`,

          style:
            `--swatch:${c}`,

          title:c,

          onclick:()=>{
            onChange(c);
            rememberColor(app,c);

            [
              ...row.children
            ].forEach(
              x=>
                x.classList.toggle(
                  'active',
                  x.title===c
                )
            );
          }
        }
      )
    );
  }

  wrap.append(row);

  if(
    app.state.recentColors
      ?.length
  ){

    wrap.append(
      h(
        'small',
        {
          class:
            'master-mini-label',
          text:
            'Recently used'
        }
      )
    );

    const recent=
      h(
        'div',
        {
          class:
            'master-color-grid recent'
        }
      );

    for(
      const c of
      app.state.recentColors
    ){
      recent.append(
        h(
          'button',
          {
            class:
              'master-swatch',

            style:
              `--swatch:${c}`,

            title:c,

            onclick:()=>{
              onChange(c);
              rememberColor(app,c);
            }
          }
        )
      );
    }

    wrap.append(recent);
  }

  const native=
    h(
      'input',
      {
        type:'color',
        value:
          current||
          '#168cff'
      }
    );

  native.addEventListener(
    'input',
    ()=>{
      onChange(native.value);
      rememberColor(
        app,
        native.value
      );
    }
  );

  wrap.append(
    h(
      'label',
      {
        class:
          'master-custom-color'
      },
      'Custom colour ',
      native
    )
  );

  return wrap;
}

function patchIndicatorSettings(app){

  app.removeIndicator=
    id=>
      removeIndicator(
        app,
        id
      );

  app.openIndicatorSettings=
    function(id){

      this.closeMenu?.();

      const ind=
        this.state
          .indicators
          .find(
            i=>i.id===id
          );

      if(!ind)return;

      const def=
        indicatorDefinition(
          ind.kind
        );

      const m=
        this.makeModal(
          `Edit · ${ind.name}`,
          'indicator-modal master-indicator-settings'
        );

      const body=
        h(
          'div',
          {
            class:
              'master-settings-scroll'
          }
        );

      m.main.replaceChildren(
        body
      );

      const field=(
        label,
        control,
        help=''
      )=>
        body.append(
          h(
            'div',
            {
              class:
                'master-setting-row'
            },
            h(
              'div',
              {},
              h(
                'strong',
                {
                  text:label
                }
              ),
              help
                ?h(
                    'small',
                    {
                      text:help
                    }
                  )
                :null
            ),
            control
          )
        );

      const num=(
        value,
        cb
      )=>{

        const n=
          h(
            'input',
            {
              class:'field',
              type:'number',
              value,
              step:'any'
            }
          );

        n.addEventListener(
          'input',
          ()=>{
            cb(
              Number(
                n.value
              )
            );
          }
        );

        return n;
      };

      const sel=(
        items,
        value,
        cb
      )=>{

        const s=
          h(
            'select',
            {
              class:'select'
            }
          );

        items.forEach(
          x=>{

            const o=
              h(
                'option',
                {
                  value:
                    Array.isArray(x)
                      ?x[0]
                      :x,

                  text:
                    Array.isArray(x)
                      ?x[1]
                      :x
                }
              );

            o.selected=
              String(o.value)===
              String(value);

            s.append(o);
          }
        );

        s.addEventListener(
          'change',
          ()=>{
            cb(s.value);
          }
        );

        return s;
      };

      field(
        'Visible',
        sel(
          [
            ['true','Shown'],
            ['false','Hidden']
          ],
          String(
            ind.visible!==false
          ),
          v=>
            ind.visible=
              v==='true'
        )
      );

      field(
        'Name',
        (()=>{

          const x=
            h(
              'input',
              {
                class:'field',
                value:ind.name
              }
            );

          x.addEventListener(
            'input',
            ()=>{
              ind.name=
                x.value;
            }
          );

          return x;
        })()
      );

      if(def?.defaults){

        for(
          const[
            key,
            dv
          ]of Object.entries(
            def.defaults
          )
        ){
          field(
            key
              .replace(
                /([A-Z])/g,
                ' $1'
              )
              .replace(
                /^./,
                x=>x.toUpperCase()
              ),

            num(
              ind[key]??dv,
              v=>
                ind[key]=
                  Number.isFinite(v)
                    ?v
                    :dv
            )
          );
        }
      }

      if(
        [
          'ema',
          'sma',
          'wma',
          'rsi',
          'macd',
          'stochastic',
          'atr',
          'adx',
          'cci',
          'momentum',
          'roc'
        ].includes(
          ind.kind
        )
      ){
        field(
          'Source',
          sel(
            [
              'close',
              'open',
              'high',
              'low',
              'hl2',
              'hlc3',
              'ohlc4'
            ],
            ind.source||
            'close',
            v=>
              ind.source=v
          )
        );
      }

      field(
        'Line width',
        sel(
          [
            '1',
            '1.5',
            '2',
            '3',
            '4'
          ],
          String(
            ind.lineWidth||
            1.5
          ),
          v=>
            ind.lineWidth=
              Number(v)
        )
      );

      field(
        'Line style',
        sel(
          [
            ['solid','Solid'],
            ['dashed','Dashed'],
            ['dotted','Dotted']
          ],
          ind.lineStyle||
          'solid',
          v=>
            ind.lineStyle=v
        )
      );

      const opacity=
        h(
          'input',
          {
            type:'range',
            min:'5',
            max:'100',
            value:
              String(
                Math.round(
                  (
                    ind.opacity??1
                  )*100
                )
              )
          }
        );

      const out=
        h(
          'span',
          {
            text:
              `${opacity.value}%`
          }
        );

      opacity.addEventListener(
        'input',
        ()=>{
          ind.opacity=
            Number(
              opacity.value
            )/100;

          out.textContent=
            `${opacity.value}%`;
        }
      );

      field(
        'Opacity',
        h(
          'div',
          {
            class:
              'master-inline'
          },
          opacity,
          out
        )
      );

      body.append(
        h(
          'h4',
          {
            text:'Colour'
          }
        ),

        colorChooser(
          this,
          ind.color||
          '#168cff',
          c=>
            ind.color=c
        )
      );

      if(
        OSC_GUIDES[
          ind.kind
        ]
      ){

        body.append(
          h(
            'h4',
            {
              text:'Levels'
            }
          )
        );

        ind.levels=
          Array.isArray(
            ind.levels
          )
            ?ind.levels
            :[
                ...OSC_GUIDES[
                  ind.kind
                ]
              ];

        const levels=
          h(
            'div',
            {
              class:
                'master-levels'
            }
          );

        const renderLevels=()=>{

          levels.replaceChildren();

          ind.levels.forEach(
            (v,i)=>{

              levels.append(
                h(
                  'div',
                  {
                    class:
                      'master-level-row'
                  },

                  num(
                    v,
                    n=>
                      ind.levels[i]=n
                  ),

                  btn(
                    '×',
                    ()=>{
                      ind.levels.splice(
                        i,
                        1
                      );

                      renderLevels();
                    },
                    'icon-btn'
                  )
                )
              );
            }
          );
        };

        renderLevels();

        body.append(
          levels,

          btn(
            '＋ Add level',
            ()=>{
              ind.levels.push(0);
              renderLevels();
            },
            'secondary'
          )
        );
      }

      const actions=
        h(
          'div',
          {
            class:
              'master-modal-actions'
          },

          btn(
            'Remove from chart',
            ()=>{
              removeIndicator(
                this,
                id
              );

              this.closeModal();
            },
            'danger'
          )
        );

      body.append(actions);

      m.ok.textContent='Apply';

      m.ok.onclick=()=>{

        this.refreshAllCharts();
        this.closeModal();
        this.save();
      };
    };
}

function patchBuiltInIndicatorGate(app){

  /*
   * Built-ins are first-party code
   * and must not be rejected by
   * the third-party declarative gate.
   */

  app.addBuiltInIndicator=
    function(kind){

      const d=
        indicatorDefinition(kind);

      if(!d)return;

      const palette=
        this.state
          .indicatorPalette
          ?.length
          ?this.state.indicatorPalette
          :COLORS;

      const spec=
        makeIndicator(
          kind,
          {
            color:
              palette[
                this.state
                  .indicators
                  .length%
                palette.length
              ]
          }
        );

      if(!spec)return;

      this.state.indicators.push(
        spec
      );

      this.refreshAllCharts();
      this.save();
    };
}

const PRIVATE_FORBIDDEN=[
  [
    'process-env',
    'Server environment access is prohibited.',
    /\bprocess\s*\.\s*env\b/i
  ],
  [
    'node-require',
    'Node require() is prohibited.',
    /\brequire\s*\(/i
  ],
  [
    'filesystem',
    'Filesystem access is prohibited.',
    /\b(?:node:)?fs\b|\bfs\s*\./i
  ],
  [
    'child-process',
    'Shell / child-process access is prohibited.',
    /\bchild_process\b|\bexecSync\b|\bspawn\s*\(/i
  ],
  [
    'dynamic-eval',
    'Dynamic code execution is prohibited.',
    /\beval\s*\(|\bnew\s+Function\b/i
  ],
  [
    'network',
    'Arbitrary external network access is prohibited.',
    /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\s*\(/i
  ],
  [
    'dynamic-import',
    'Arbitrary module imports are prohibited.',
    /\bimport\s*\(|\bimport\s+.+\s+from\s+/i
  ],
  [
    'dom',
    'DOM/window/storage access is unavailable in indicator sandboxes.',
    /\bwindow\b|\bdocument\b|\blocalStorage\b|\bsessionStorage\b/i
  ],
  [
    'worker',
    'Indicators cannot create their own workers.',
    /\bnew\s+(?:Shared)?Worker\s*\(/i
  ]
];

function sourceFingerprint(
  source=''
){

  let n=
    2166136261;

  for(
    let i=0;
    i<source.length;
    i++
  ){
    n^=
      source.charCodeAt(i);

    n=
      Math.imul(
        n,
        16777619
      );
  }

  return(
    `fnv1a-${
      (n>>>0)
        .toString(16)
        .padStart(8,'0')
    }`
  );
}

function scanPrivateIndicatorSource(
  source=''
){

  const code=
    String(
      source||''
    );

  const issues=[];

  if(
    !code.trim()
  ){
    issues.push({
      type:'format',
      message:
        'Indicator source is empty.'
    });
  }

  if(
    new TextEncoder()
      .encode(code)
      .length>
    200000
  ){
    issues.push({
      type:'format',
      message:
        'Indicator source exceeds 200 KB.'
    });
  }

  for(
    const[
      id,
      message,
      re
    ]of PRIVATE_FORBIDDEN
  ){
    if(
      re.test(code)
    ){
      issues.push({
        type:'security',
        id,
        message
      });
    }
  }

  const indicatorLike=
    /\b(?:plot|signal|calculate|onBar|indicator)\s*\(/i
      .test(code)||
    /\bta\s*\./i
      .test(code);

  if(
    code.trim()&&
    !indicatorLike
  ){
    issues.push({
      type:'format',
      message:
        'Code does not expose a recognized Trade Avata indicator calculation/plot interface.'
    });
  }

  const hash=
    sourceFingerprint(code);

  return{
    ok:
      issues.length===0,

    issues,

    sourceHash:
      hash,

    buildId:
      `TA-IND-${
        hash
          .slice(-8)
          .toUpperCase()
      }`,

    indicatorLike
  };
}

function patchPrivateIndicatorVault(app){

  app.openPrivateIndicatorVault=
    function(){

      const user=
        this.state
          .connection
          ?.tradeAvataUser||{};

      const owner=
        this.isLocalOwnerPreview?.()||
        user.role==='owner'||
        this.state.ownerMode;

      if(!owner){
        alert(
          'Private Indicator Vault is Owner Only.'
        );

        return;
      }

      const m=
        this.makeModal(
          'Private Indicator Vault · Owner Only',
          'master-indicator-vault'
        );

      m.ok.style.display='none';
      m.cancel.textContent='Close';

      const body=
        h(
          'div',
          {
            class:'master-vault'
          }
        );

      m.main.replaceChildren(
        body
      );

      body.append(
        h(
          'div',
          {
            class:
              'master-vault-banner'
          },

          h(
            'strong',
            {
              text:
                'Mandatory secure build gate'
            }
          ),

          h(
            'p',
            {
              text:
                'Upload or paste JavaScript/TypeScript → format check → prohibited-code scan → production sandbox dry run → resource test → output-contract validation → activate.'
            }
          )
        )
      );

      const file=
        h(
          'input',
          {
            type:'file',
            accept:
              '.js,.mjs,.ts,text/javascript,application/javascript'
          }
        );

      const ta=
        h(
          'textarea',
          {
            class:
              'field master-code-editor',

            placeholder:
              'Paste Trade Avata indicator source here…'
          }
        );

      const report=
        h(
          'div',
          {
            class:
              'master-build-report'
          }
        );

      const activate=
        btn(
          'Activate Approved Build',
          ()=>{},
          'primary'
        );

      activate.disabled=true;

      const draft=
        this.state
          .privateIndicatorDraft||{};

      ta.value=
        draft.source||'';

      file.addEventListener(
        'change',
        ()=>{

          const f=
            file.files?.[0];

          if(!f)return;

          const r=
            new FileReader();

          r.onload=()=>{
            ta.value=
              String(
                r.result||''
              );
          };

          r.readAsText(f);
        }
      );

      const build=
        btn(
          'Build & Validate',
          ()=>{

            const result=
              scanPrivateIndicatorSource(
                ta.value
              );

            this.state
              .privateIndicatorDraft={
                source:ta.value,
                lastReport:result
              };

            report.replaceChildren();

            report.append(
              h(
                'div',
                {
                  class:
                    `master-build-status ${
                      result.ok
                        ?'pass'
                        :'fail'
                    }`
                },

                h(
                  'strong',
                  {
                    text:
                      result.ok
                        ?'BUILD PASSED'
                        :'BUILD REJECTED'
                  }
                ),

                h(
                  'small',
                  {
                    text:
                      `${result.buildId} · ${result.sourceHash}`
                  }
                )
              )
            );

            if(
              result.issues.length
            ){

              const ul=
                h('ul');

              result.issues.forEach(
                x=>
                  ul.append(
                    h(
                      'li',
                      {
                        text:
                          `${
                            x.type==='security'
                              ?'SECURITY'
                              :'FORMAT'
                          } · ${x.message}`
                      }
                    )
                  )
              );

              report.append(ul);

            }else{

              report.append(
                h(
                  'p',
                  {
                    text:
                      'Static gate passed. Production activation must still pass the isolated backend sandbox/resource/output-contract checks.'
                  }
                )
              );
            }

            activate.disabled=
              !result.ok;

            this.save();
          },
          'primary'
        );

      activate.addEventListener(
        'click',
        ()=>{

          const r=
            this.state
              .privateIndicatorDraft
              ?.lastReport;

          if(!r?.ok)return;

          this.state
            .privateIndicatorBuilds=
            this.state
              .privateIndicatorBuilds||
            [];

          const meta={
            id:r.buildId,
            name:'Private Indicator',
            sourceHash:r.sourceHash,
            status:
              'approved-static-gate',
            createdAt:
              new Date()
                .toISOString(),
            ownerOnly:true
          };

          this.state
            .privateIndicatorBuilds
            .unshift(meta);

          this.state
            .privateIndicatorBuilds=
            this.state
              .privateIndicatorBuilds
              .slice(0,30);

          this.save();

          alert(
            'Static build approved. Source was NOT executed in the browser. Production activation remains locked to the secure backend sandbox.'
          );
        }
      );

      body.append(
        h(
          'div',
          {
            class:
              'master-vault-row'
          },
          file,
          build
        ),

        ta,
        report,
        activate,

        h(
          'p',
          {
            class:
              'master-help',

            text:
              'Security rule: private source must never be shipped to ordinary chart users. This frontend validates only; actual private indicator execution belongs on the isolated server sandbox.'
          }
        )
      );
    };
}

function patchIndicatorBrowser(app){

  app.openIndicatorBrowser=
    function(){

      this.closeMenu?.();

      const m=
        this.makeModal(
          'Indicators',
          'indicator-browser-modal master-indicator-browser'
        );

      m.main.className=
        'modal-main single';

      m.ok.style.display=
        'none';

      m.cancel.textContent=
        'Close';

      const body=
        h(
          'div',
          {
            class:
              'master-indicator-browser'
          }
        );

      m.main.replaceChildren(
        body
      );

      const u=
        this.state
          .connection
          ?.tradeAvataUser||{};

      if(
        this.state.ownerMode||
        u.role==='owner'||
        this.isLocalOwnerPreview?.()
      ){
        body.append(
          btn(
            '⚙ Private Indicator Vault',
            ()=>
              this.openPrivateIndicatorVault(),
            'secondary master-vault-open'
          )
        );
      }

      body.append(
        h(
          'div',
          {
            class:
              'master-browser-title'
          },

          h(
            'div',
            {},

            h(
              'h3',
              {
                text:
                  'On this chart'
              }
            ),

            h(
              'p',
              {
                text:
                  `${this.state.indicators.length} indicator${
                    this.state.indicators.length===1
                      ?''
                      :'s'
                  } attached`
              }
            )
          )
        )
      );

      const attached=
        h(
          'div',
          {
            class:
              'master-attached-list'
          }
        );

      if(
        !this.state
          .indicators
          .length
      ){
        attached.append(
          h(
            'div',
            {
              class:
                'empty-state',

              text:
                'No indicators attached.'
            }
          )
        );
      }

      for(
        const ind of
        this.state.indicators
      ){

        attached.append(
          h(
            'div',
            {
              class:
                'master-attached-row'
            },

            h(
              'div',
              {
                class:
                  'master-ind-name'
              },

              h(
                'strong',
                {
                  text:ind.name
                }
              ),

              h(
                'small',
                {
                  text:
                    ind.pane==='oscillator'
                      ?'Oscillator'
                      :'Overlay'
                }
              )
            ),

            h(
              'div',
              {
                class:
                  'master-ind-actions'
              },

              btn(
                ind.visible===false
                  ?'◌'
                  :'◉',

                ()=>{
                  this.toggleIndicatorVisibility(
                    ind.id
                  );

                  this.openIndicatorBrowser();
                },

                'icon-btn',

                ind.visible===false
                  ?'Show'
                  :'Hide'
              ),

              btn(
                '✎',
                ()=>{
                  this.openIndicatorSettings(
                    ind.id
                  );
                },
                'icon-btn',
                'Edit'
              ),

              btn(
                '×',
                ()=>{
                  removeIndicator(
                    this,
                    ind.id
                  );

                  this.openIndicatorBrowser();
                },
                'icon-btn dangerish',
                'Remove'
              )
            )
          )
        );
      }

      body.append(
        attached,
        h(
          'div',
          {
            class:
              'master-browser-divider'
          }
        )
      );

      const search=
        h(
          'input',
          {
            class:
              'field master-search',
            placeholder:
              'Search indicators…'
          }
        );

      const list=
        h(
          'div',
          {
            class:
              'master-library-list'
          }
        );

      body.append(
        h(
          'div',
          {
            class:
              'master-library-head'
          },

          h(
            'div',
            {},

            h(
              'h3',
              {
                text:
                  'Add indicator'
              }
            ),

            h(
              'p',
              {
                text:
                  'Built-ins are ready to use immediately.'
              }
            )
          ),

          search
        ),

        list
      );

      const render=()=>{

        list.replaceChildren();

        const q=
          search.value
            .trim()
            .toLowerCase();

        for(
          const d of
          BUILTIN_INDICATORS
            .filter(
              x=>
                !q||
                `${x.name} ${x.short} ${x.category}`
                  .toLowerCase()
                  .includes(q)
            )
        ){

          list.append(
            h(
              'button',
              {
                class:
                  'master-library-row',

                onclick:()=>{

                  this.addBuiltInIndicator(
                    d.kind
                  );

                  this.openIndicatorBrowser();
                }
              },

              h(
                'div',
                {},

                h(
                  'strong',
                  {
                    text:d.name
                  }
                ),

                h(
                  'small',
                  {
                    text:
                      `${d.short} · ${d.category}`
                  }
                )
              ),

              h(
                'span',
                {
                  text:'＋'
                }
              )
            )
          );
        }
      };

      search.addEventListener(
        'input',
        render
      );

      render();
    };
}

function applyGuidesAndStyles(app){

  for(
    const pane of
    app.panes||[]
  ){

    if(
      !pane?.indicatorSeries
    ){
      continue;
    }

    const firstById=
      new Map();

    for(
      const meta of
      pane.indicatorSeries
    ){

      const ind=
        meta.cfg||{};

      try{
        meta.series.applyOptions({
          lineWidth:
            Number(
              ind.lineWidth||
              1.5
            ),

          color:
            ind.color||meta.part?.color,

          visible:
            ind.visible!==false,

          lineStyle:
            ind.lineStyle||'solid',

          opacity:
            ind.opacity??1
        });
      }catch{}

      if(
        !firstById.has(
          ind.id
        )
      ){
        firstById.set(
          ind.id,
          meta
        );
      }
    }

    pane.__masterGuideLines=
      pane.__masterGuideLines||[];

    for(
      const x of
      pane.__masterGuideLines
    ){
      try{
        x.series
          .removePriceLine?.(
            x.line
          );
      }catch{}
    }

    pane.__masterGuideLines=[];

    for(
      const[
        id,
        meta
      ]of firstById
    ){

      const ind=
        meta.cfg||{};

      const levels=
        Array.isArray(
          ind.levels
        )
          ?ind.levels
          :OSC_GUIDES[
              ind.kind
            ];

      if(
        !levels?.length||
        meta.paneIndex===0
      ){
        continue;
      }

      for(
        const price of
        levels
      ){
        try{
          const line=
            meta.series
              .createPriceLine({
                price:
                  Number(price),

                color:
                  'rgba(148,163,184,.48)',

                lineWidth:1,
                lineStyle:2,
                axisLabelVisible:true,
                title:
                  String(price)
              });

          pane.__masterGuideLines
            .push({
              series:meta.series,
              line
            });
        }catch{}
      }
    }
  }
}

function patchOscillatorPersistence(app){

  app.registerTransitionHook?.(
    'before',
    ({pane})=>{
      pane?.captureOscillatorPaneHeights?.();
    }
  );

  app.registerTransitionHook?.(
    'after',
    ()=>{
      requestAnimationFrame(
        ()=>
          requestAnimationFrame(
            ()=>{
              for(const p of app.panes){
                p.applyOscillatorPaneHeights?.();
              }
              applyGuidesAndStyles(app);
              for(const p of app.panes){
                p.nativeV27Renderer?.sync?.();
                p.renderOverlays?.();
              }
            }
          )
      );
    }
  );

  const refresh=
    app.refreshAllCharts.bind(app);

  app.refreshAllCharts=
    function(){

      for(const p of this.panes){
        p.captureOscillatorPaneHeights?.();
      }

      refresh();

      requestAnimationFrame(
        ()=>
          requestAnimationFrame(
            ()=>{
              for(const p of this.panes){
                p.applyOscillatorPaneHeights?.();
              }

              applyGuidesAndStyles(this);

              for(const p of this.panes){
                p.nativeV27Renderer?.sync?.();
                p.renderOverlays?.();
              }
            }
          )
      );
    };

  app.toggleOscillatorIndicators=function(){};
}

function patchDrawingEngine(){

  if(
    DrawingLayer
      .prototype
      .__masterRecoveryPatched
  ){
    return;
  }

  DrawingLayer
    .prototype
    .__masterRecoveryPatched=true;

  const originalPointerDown=
    DrawingLayer
      .prototype
      .pointerDown;

  const originalHit=
    DrawingLayer
      .prototype
      .hitDrawing;

  const originalUpdate=
    DrawingLayer
      .prototype
      .updateDrag;

  const originalDrawPosition=
    DrawingLayer
      .prototype
      .drawPosition;

  DrawingLayer
    .prototype
    .pointerDown=
    function(e){

      const s=
        this.getState();

      const tool=
        s.activeTool;

      if(
        !POSITION_TYPES.has(
          tool
        )
      ){
        return originalPointerDown.call(
          this,
          e
        );
      }

      const p=
        this.pointFromEvent(e);

      if(!p)return;

      e.preventDefault();

      const entry=
        this.snapPoint(p);

      const vr=
        this.pane
          .visiblePriceRange?.();

      const span=
        vr&&
        Number.isFinite(
          vr.max-vr.min
        )
          ?vr.max-vr.min
          :Math.abs(entry.price)*.02;

      const distance=
        Math.max(
          Math.abs(
            entry.price
          )*.00035,

          span*.075
        );

      const right=
        this.pane.shiftPoint(
          entry,
          Math.max(
            8,
            Math.round(
              (
                this.pane
                  .chartHost
                  ?.clientWidth||
                800
              )/70
            )
          )
        );

      const target={
        ...right,
        price:
          tool==='long'
            ?entry.price+distance
            :entry.price-distance
      };

      const stop={
        ...right,
        price:
          tool==='long'
            ?entry.price-distance
            :entry.price+distance
      };

      const d=
        this.makeDrawing(
          tool,
          [
            entry,
            target,
            stop
          ]
        );

      d.positionBounds={
        leftLogical:
          entry.logical,

        rightLogical:
          right.logical
      };

      d.riskReward=1;

      this.onChange({
        type:'add',
        drawing:d
      });

      this.afterComplete();

      this.render();
    };

  DrawingLayer
    .prototype
    .drawPosition=
    function(
      ctx,
      d,
      pts,
      showDetails
    ){

      const entry=
        pts[0];

      const target=
        pts[1];

      const stop=
        pts[2];

      const st=
        d.style||{};

      const bound=
        d.positionBounds||{};

      let x1=
        Number.isFinite(
          bound.leftLogical
        )
          ?this.pane
              .logicalToCoordinate(
                bound.leftLogical
              )
          :Math.min(
              entry.x,
              target.x,
              stop.x
            );

      let x2=
        Number.isFinite(
          bound.rightLogical
        )
          ?this.pane
              .logicalToCoordinate(
                bound.rightLogical
              )
          :Math.max(
              entry.x,
              target.x,
              stop.x
            )+72;

      if(
        x1==null||
        x2==null
      ){
        return originalDrawPosition.call(
          this,
          ctx,
          d,
          pts,
          showDetails
        );
      }

      if(x2<x1){
        [
          x1,
          x2
        ]=[
          x2,
          x1
        ];
      }

      const width=
        Math.max(
          30,
          x2-x1
        );

      const rewardTop=
        Math.min(
          entry.y,
          target.y
        );

      const rewardH=
        Math.abs(
          entry.y-
          target.y
        );

      const lossTop=
        Math.min(
          entry.y,
          stop.y
        );

      const lossH=
        Math.abs(
          entry.y-
          stop.y
        );

      ctx.globalAlpha=
        st.opacity??.22;

      ctx.fillStyle=
        st.profitColor||
        '#00a8b8';

      ctx.fillRect(
        x1,
        rewardTop,
        width,
        rewardH
      );

      ctx.fillStyle=
        st.lossColor||
        '#b92ebd';

      ctx.fillRect(
        x1,
        lossTop,
        width,
        lossH
      );

      ctx.globalAlpha=1;

      const line=(
        y,
        color
      )=>{

        ctx.strokeStyle=
          color;

        ctx.beginPath();

        ctx.moveTo(
          x1,
          y
        );

        ctx.lineTo(
          x2,
          y
        );

        ctx.stroke();
      };

      line(
        entry.y,
        st.entryColor||
        '#00b6c8'
      );

      line(
        target.y,
        st.profitColor||
        '#00a8b8'
      );

      line(
        stop.y,
        st.lossColor||
        '#b92ebd'
      );

      if(
        showDetails&&
        st.showStats!==false
      ){
        this.drawPositionDetails(
          ctx,
          d,
          pts,
          {
            x1,
            width
          }
        );
      }

      if(showDetails){

        ctx.save();

        for(
          const[
            x,
            y
          ]of[
            [x1,target.y],
            [x2,target.y],
            [x1,entry.y],
            [x2,entry.y],
            [x1,stop.y],
            [x2,stop.y]
          ]
        ){

          ctx.beginPath();

          ctx.arc(
            x,
            y,
            5,
            0,
            Math.PI*2
          );

          ctx.fillStyle=
            '#fff';

          ctx.fill();

          ctx.strokeStyle=
            '#168cff';

          ctx.lineWidth=
            1.5;

          ctx.stroke();
        }

        ctx.restore();
      }
    };

  DrawingLayer
    .prototype
    .hitDrawing=
    function(
      d,
      x,
      y
    ){

      if(
        POSITION_TYPES.has(
          d.type
        )&&
        !d.hidden&&
        d.points?.length>=3
      ){

        const pts=
          d.points.map(
            p=>
              this.screenPoint(p)
          );

        if(
          pts.every(Boolean)
        ){

          const bound=
            d.positionBounds||{};

          let x1=
            Number.isFinite(
              bound.leftLogical
            )
              ?this.pane
                  .logicalToCoordinate(
                    bound.leftLogical
                  )
              :Math.min(
                  ...pts.map(
                    p=>p.x
                  )
                );

          let x2=
            Number.isFinite(
              bound.rightLogical
            )
              ?this.pane
                  .logicalToCoordinate(
                    bound.rightLogical
                  )
              :Math.max(
                  ...pts.map(
                    p=>p.x
                  )
                )+72;

          if(
            x1!=null&&
            x2!=null
          ){

            if(x2<x1){
              [
                x1,
                x2
              ]=[
                x2,
                x1
              ];
            }

            const ys=[
              pts[1].y,
              pts[0].y,
              pts[2].y
            ];

            const codes=[
              [10,11],
              [12,13],
              [14,15]
            ];

            for(
              let r=0;
              r<3;
              r++
            ){
              for(
                let c=0;
                c<2;
                c++
              ){

                const hx=
                  c
                    ?x2
                    :x1;

                if(
                  Math.hypot(
                    hx-x,
                    ys[r]-y
                  )<12
                ){
                  return{
                    handle:
                      codes[r][c]
                  };
                }
              }
            }

            if(
              x>=x1&&
              x<=x2&&
              y>=Math.min(...ys)&&
              y<=Math.max(...ys)
            ){
              return{
                handle:-1
              };
            }
          }
        }
      }

      return originalHit.call(
        this,
        d,
        x,
        y
      );
    };

  DrawingLayer
    .prototype
    .updateDrag=
    function(p){

      const d=
        this.getState()
          .drawings
          .find(
            x=>
              x.id===
              this.drag?.id
          );

      if(
        !d||
        d.locked||
        !POSITION_TYPES.has(
          d.type
        )
      ){
        return originalUpdate.call(
          this,
          p
        );
      }

      const code=
        this.drag.handle;

      const b=
        this.drag
          .originalBounds||
        (
          this.drag
            .originalBounds={
              ...(
                d.positionBounds||
                {
                  leftLogical:
                    Math.min(
                      ...this.drag
                        .original
                        .map(
                          x=>
                            x.logical||0
                        )
                    ),

                  rightLogical:
                    Math.max(
                      ...this.drag
                        .original
                        .map(
                          x=>
                            x.logical||0
                        )
                    )
                }
              )
            }
        );

      if(code===-1){

        const dx=
          (p.logical??0)-
          (
            this.drag
              .start
              .logical??0
          );

        d.positionBounds={
          leftLogical:
            b.leftLogical+dx,

          rightLogical:
            b.rightLogical+dx
        };

        d.points=
          this.drag
            .original
            .map(
              op=>
                this.pane
                  .shiftPoint(
                    op,
                    dx
                  )
            );

      }else if(
        code>=10&&
        code<=15
      ){

        const left=
          code%2===0;

        let L=
          b.leftLogical;

        let R=
          b.rightLogical;

        const logical=
          Number.isFinite(
            p.logical
          )
            ?p.logical
            :(left?L:R);

        if(left){
          L=
            Math.min(
              logical,
              R-1
            );
        }else{
          R=
            Math.max(
              logical,
              L+1
            );
        }

        d.positionBounds={
          leftLogical:L,
          rightLogical:R
        };

        if(
          code===10||
          code===11
        ){
          d.points[1].price=
            this.snapPoint(p)
              .price;
        }

        if(
          code===14||
          code===15
        ){
          d.points[2].price=
            this.snapPoint(p)
              .price;
        }

      }else{

        return originalUpdate.call(
          this,
          p
        );
      }

      this.drag.changed=true;

      this.render();

      this.updateFloatingToolbar();
    };
}

function installRealtimeOverlaySync(app){

  const bind=pane=>{

    if(
      !pane||
      pane.__masterSyncBound
    ){
      return;
    }

    pane.__masterSyncBound=true;

    const host=
      pane.chartHost;

    let raf=0;
    let dragging=false;

    const frame=()=>{

      if(!dragging)return;

      pane.renderOverlays?.();

      raf=
        requestAnimationFrame(
          frame
        );
    };

    host?.addEventListener(
      'pointerdown',
      ()=>{
        dragging=true;

        cancelAnimationFrame(
          raf
        );

        frame();
      },
      {
        capture:true
      }
    );

    const end=()=>{

      dragging=false;

      cancelAnimationFrame(
        raf
      );

      pane.renderOverlays?.();

      pane.captureOscillatorPaneHeights?.();
    };

    window.addEventListener(
      'pointerup',
      end
    );

    window.addEventListener(
      'pointercancel',
      end
    );

    host?.addEventListener(
      'wheel',
      ()=>
        requestAnimationFrame(
          ()=>
            pane.renderOverlays?.()
        ),
      {
        passive:true
      }
    );
  };

  const bindAll=
    ()=>app.panes.forEach(
      bind
    );

  bindAll();

  const original=
    app.applyLayout.bind(app);

  app.applyLayout=
    function(...args){

      const r=
        original(...args);

      setTimeout(
        bindAll,
        0
      );

      setTimeout(
        ()=>
          installPaneNavigation(
            this
          ),
        40
      );

      return r;
    };
}

function installPaneNavigation(app){

  for(
    const pane of
    app.panes
  ){

    if(
      pane.__masterNavBound
    ){
      continue;
    }

    pane.__masterNavBound=true;

    pane.root
      .querySelector(
        '.chart-nav'
      )
      ?.classList.add(
        'legacy-nav-hidden'
      );

    const nav=
      h(
        'div',
        {
          class:'ta-master-nav'
        },

        btn(
          '−',
          ()=>
            zoomPane(
              pane,
              1.18
            ),
          'ta-nav-btn',
          'Zoom out'
        ),

        btn(
          '+',
          ()=>
            zoomPane(
              pane,
              .84
            ),
          'ta-nav-btn',
          'Zoom in'
        ),

        btn(
          '←',
          ()=>
            stepPane(
              pane,
              -1
            ),
          'ta-nav-btn',
          'Move back one bar'
        ),

        btn(
          '→',
          ()=>
            stepPane(
              pane,
              1
            ),
          'ta-nav-btn',
          'Move forward one bar'
        ),

        btn(
          '⌂',
          ()=>
            (pane.hardHome?.()||pane.resetView?.()),
          'ta-nav-btn ta-home-btn',
          'Home / restore normal view'
        )
      );

    const live=
      btn(
        '↪ LIVE',
        ()=>
          pane.goLive?.(),
        'ta-return-live',
        'Return to live market'
      );

    live.hidden=true;

    pane.root.append(
      nav,
      live
    );

    const update=range=>{

      const n=
        pane.currentDataLength?.()||
        pane.displayBars?.length||
        0;

      const rightOffset=
        Number(
          app.state
            .chartSettings
            ?.rightOffset||
          0
        );

      live.hidden=
        !range||
        range.to>=(
          n-1+
          rightOffset-
          4
        );
    };

    try{
      pane.chart
        .timeScale()
        .subscribeVisibleLogicalRangeChange(
          update
        );

      update(
        pane.chart
          .timeScale()
          .getVisibleLogicalRange?.()
      );
    }catch{}
  }
}

function zoomPane(
  pane,
  factor
){

  try{

    const ts=
      pane.chart
        .timeScale();

    const r=
      ts.getVisibleLogicalRange();

    if(!r)return;

    const c=
      (
        r.from+
        r.to
      )/2;

    const span=
      (
        r.to-
        r.from
      )*factor;

    ts.setVisibleLogicalRange({
      from:
        c-span/2,

      to:
        c+span/2
    });

  }catch{}
}

function stepPane(
  pane,
  delta
){

  try{

    const ts=
      pane.chart
        .timeScale();

    const r=
      ts.getVisibleLogicalRange();

    if(!r)return;

    ts.setVisibleLogicalRange({
      from:
        r.from+delta,

      to:
        r.to+delta
    });

  }catch{}
}

function patchReplay(app){

  const original=
    app.renderReplayControls.bind(
      app
    );

  app.renderReplayControls=
    function(
      pane=
        this.activePane()
    ){

      original(pane);

      if(
        !pane||
        !this.state.replay.active
      ){
        return;
      }

      const box=
        pane.root
          .querySelector(
            '.replay-toolbar'
          );

      if(!box)return;

      box.classList.add(
        'master-replay-toolbar'
      );

      let grab=
        box.querySelector(
          '.master-replay-grab'
        );

      if(!grab){

        grab=
          h(
            'button',
            {
              class:
                'master-replay-grab',

              title:
                'Drag replay toolbar'
            },
            '⠿'
          );

        box.prepend(
          grab
        );

        installReplayDrag(
          this,
          pane,
          box,
          grab
        );
      }

      if(
        !box.querySelector(
          '.master-replay-sell'
        )
      ){
        box.append(
          btn(
            'SELL',
            ()=>
              this.previewOrder(
                'Sell',
                pane
              ),
            'replay-control master-replay-sell'
          )
        );
      }

      if(
        !box.querySelector(
          '.master-replay-buy'
        )
      ){
        box.append(
          btn(
            'BUY',
            ()=>
              this.previewOrder(
                'Buy',
                pane
              ),
            'replay-control master-replay-buy'
          )
        );
      }
    };
}

function installReplayDrag(
  app,
  pane,
  box,
  grab
){

  const saved=
    app.state.replay
      .toolbarPos;

  if(saved){
    box.style.left=
      `${saved.x}px`;

    box.style.top=
      `${saved.y}px`;

    box.style.transform=
      'none';
  }

  grab.addEventListener(
    'pointerdown',
    e=>{

      e.preventDefault();

      grab.setPointerCapture?.(
        e.pointerId
      );

      const pr=
        pane.root
          .getBoundingClientRect();

      const br=
        box.getBoundingClientRect();

      const sx=
        e.clientX;

      const sy=
        e.clientY;

      const start={
        x:
          br.left-
          pr.left,

        y:
          br.top-
          pr.top
      };

      const move=ev=>{

        const x=
          clamp(
            start.x+
            ev.clientX-
            sx,

            4,

            Math.max(
              4,
              pr.width-
              box.offsetWidth-
              4
            )
          );

        const y=
          clamp(
            start.y+
            ev.clientY-
            sy,

            4,

            Math.max(
              4,
              pr.height-
              box.offsetHeight-
              4
            )
          );

        box.style.left=
          `${x}px`;

        box.style.top=
          `${y}px`;

        box.style.right=
          'auto';

        box.style.transform=
          'none';

        app.state.replay
          .toolbarPos={
            x,
            y
          };
      };

      const up=()=>{

        window.removeEventListener(
          'pointermove',
          move
        );

        window.removeEventListener(
          'pointerup',
          up
        );

        app.save();
      };

      window.addEventListener(
        'pointermove',
        move
      );

      window.addEventListener(
        'pointerup',
        up
      );
    }
  );
}

function patchThemes(app){

  const original=
    app.applyPlatformTheme.bind(app);

  app.applyPlatformTheme=
    function(){

      original();

      let t=
        this.state
          .platformTheme||
        'default';

      if(t==='dark'){
        t='default';
      }

      if(t==='system'){
        t=
          matchMedia?.(
            '(prefers-color-scheme: light)'
          )?.matches
            ?'light'
            :'default';
      }

      document.documentElement
        .dataset
        .taTheme=t;

      document.body
        .classList
        .toggle(
          'theme-light',
          t==='light'
        );
    };

  const fill=
    app.fillSettings.bind(app);

  app.fillSettings=
    function(
      tab,
      nav,
      body
    ){

      fill(
        tab,
        nav,
        body
      );

      if(
        tab!=='platform'
      ){
        return;
      }

      body.append(
        h(
          'h4',
          {
            text:
              'Trade Avata themes'
          }
        ),

        h(
          'p',
          {
            class:
              'settings-note',

            text:
              'Platform theme changes menus, panels and controls. Chart colours remain independent.'
          }
        )
      );

      const grid=
        h(
          'div',
          {
            class:
              'master-theme-grid'
          }
        );

      for(
        const[
          id,
          label
        ]of THEMES
      ){

        grid.append(
          h(
            'button',
            {
              class:
                `master-theme-card ${
                  this.state.platformTheme===id
                    ?'active'
                    :''
                }`,

              onclick:()=>{

                this.state
                  .platformTheme=id;

                this.applyPlatformTheme();

                this.save();

                this.fillSettings(
                  'platform',
                  nav,
                  body
                );
              }
            },

            h(
              'span',
              {
                class:
                  `theme-preview theme-${id}`
              }
            ),

            h(
              'strong',
              {
                text:label
              }
            )
          )
        );
      }

      body.append(grid);
    };
}

function patchMobileAndEscape(app){

  const forcePointer=()=>{

    app.state.activeTool=
      'cursor';

    app.renderLeftbar?.();

    app.panes.forEach(
      p=>{

        p.drawingLayer
          ?.cancelDraft?.();

        p.updateCursorMode?.();

        p.drawingLayer
          ?.syncPointerMode?.();
      }
    );

    app.save?.();
  };

  window.addEventListener(
    'keydown',
    e=>{

      if(
        e.key==='Escape'
      ){
        forcePointer();
      }
    },
    true
  );

  document.addEventListener(
    'pointermove',
    e=>{

      if(
        e.target
          ?.classList
          ?.contains(
            'drawing-canvas'
          )&&
        isDrawingTool(
          app.state.activeTool
        )
      ){
        e.preventDefault();
      }
    },
    {
      capture:true,
      passive:false
    }
  );

  const observer=
    new MutationObserver(
      ()=>{

        document.body
          .classList
          .toggle(
            'ta-drawing-active',
            isDrawingTool(
              app.state.activeTool
            )
          );

        document
          .querySelectorAll(
            '.drawing-canvas'
          )
          .forEach(
            c=>
              c.style.touchAction=
                isDrawingTool(
                  app.state.activeTool
                )
                  ?'none'
                  :'auto'
          );
      }
    );

  observer.observe(
    document.body,
    {
      subtree:true,
      childList:true,
      attributes:true,
      attributeFilter:[
        'class'
      ]
    }
  );

  const setTool=
    app.setTool.bind(app);

  app.setTool=
    function(...args){

      const r=
        setTool(...args);

      document.body
        .classList
        .toggle(
          'ta-drawing-active',
          isDrawingTool(
            this.state.activeTool
          )
        );

      document
        .querySelectorAll(
          '.drawing-canvas'
        )
        .forEach(
          c=>
            c.style.touchAction=
              isDrawingTool(
                this.state.activeTool
              )
                ?'none'
                :'auto'
        );

      return r;
    };
}

function patchOps(app){

  const original=
    app.renderOps.bind(app);

  app.renderOps=
    function(body){

      original(body);

      const card=
        h(
          'div',
          {
            class:
              'side-card master-ops-card'
          },

          h(
            'h4',
            {
              text:
                'Chart engine'
            }
          ),

          h(
            'p',
            {
              text:
                'Trade Avata Native v3.2 is the only installed chart engine. Price axis, time axis, coordinates, candles, Heiken Ashi, Renko, indicators, oscillator panes, crosshair, zoom, pan, replay coordinates and drawing coordinates are all native.'
            }
          ),

          h(
            'div',
            {
              class:'status-badge',
              text:'FULL NATIVE · ACTIVE'
            }
          )
        );

      body.append(card);
    };
}

function modernizeRuntime(app){

  document.documentElement
    .dataset
    .masterRecovery=
    'v9.3';

  document
    .querySelectorAll(
      '.signal-badge'
    )
    .forEach(
      x=>
        x.setAttribute(
          'aria-hidden',
          'true'
        )
    );

  document.body
    .classList
    .toggle(
      'ta-drawing-active',
      isDrawingTool(
        app.state.activeTool
      )
    );

  installPaneNavigation(
    app
  );

  applyGuidesAndStyles(
    app
  );
}

async function boot(){

  patchDrawingEngine();

  const app=
    await waitForApp();

  migrateState(app);
  patchAI(app);
  patchTopbar(app);
  patchLeftbar(app);
  patchConstructionMenu(app);
  patchIndicatorSettings(app);
  patchBuiltInIndicatorGate(app);
  patchPrivateIndicatorVault(app);
  patchIndicatorBrowser(app);
  patchOscillatorPersistence(app);
  patchThemes(app);
  patchReplay(app);
  patchMobileAndEscape(app);
  patchOps(app);
  installRealtimeOverlaySync(app);

  installNativeV27Engine(app);

  installChartQualityAI(app);

  app.applyPlatformTheme();

  app.renderTopbar();

  app.renderLeftbar();

  app.refreshAllCharts();

  modernizeRuntime(app);

  window.__tradeAvataMasterRecovery={
    build:BUILD,
    app,
    runSelfCheck:
      ()=>runSelfCheck(app)
  };

  console.info(
    `[${BUILD}] loaded`
  );
}

function runSelfCheck(app){

  const checks={

    app:
      !!app,

    pointerTool:
      !!document.querySelector(
        '#leftbar .left-tool'
      ),

    topChartTypeRemoved:
      !document.querySelector(
        '.chart-type-select'
      ),

    indicatorPanel:
      typeof app.openIndicatorBrowser===
      'function',

    indicatorEdit:
      typeof app.openIndicatorSettings===
      'function',

    replay:
      typeof app.renderReplayControls===
      'function',

    drawingsPatched:
      !!DrawingLayer
        .prototype
        .__masterRecoveryPatched,

    nativeEngineActive:
      app.state
        .chartEngines
        ?.active==='native'&&
      !!app.panes
        ?.[0]
        ?.nativeV27Renderer,

    qualityAI:
      !!globalThis
        .__tradeAvataChartQuality,

    aiOwnerGate:
      typeof app.canUseAIChat===
      'function',

    themes:
      THEMES.length>=5,

    panes:
      (
        app.panes||[]
      ).length>0
  };

  return{
    ok:
      Object.values(
        checks
      ).every(Boolean),

    checks
  };
}

if(
  !globalThis
    .__TA_MASTER_RECOVERY_DISABLE_AUTOBOOT__
){
  boot()
    .catch(
      err=>
        console.error(
          `[${BUILD}]`,
          err
        )
    );
}
