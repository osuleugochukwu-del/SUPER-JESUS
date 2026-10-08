/* Trade Avata Indicator Security Gate
 * The browser accepts declarative indicator specifications, not arbitrary user JS.
 * Built-in code is first-party and reviewed. Third-party logic should run in an
 * isolated Worker/WASM sandbox or on the server with explicit resource limits.
 */
const ALLOWED_KINDS=new Set(['ema','sma','rsi','macd','atr','custom-server']);
const ALLOWED_SOURCES=new Set(['open','high','low','close','hl2','hlc3','ohlc4']);

export function validateIndicatorSpec(spec){
  const errors=[];
  if(!spec||typeof spec!=='object'||Array.isArray(spec))return{ok:false,errors:['Indicator spec must be an object.']};
  if(!ALLOWED_KINDS.has(spec.kind))errors.push('Unsupported indicator kind.');
  if(spec.source&&!ALLOWED_SOURCES.has(spec.source))errors.push('Unsupported price source.');
  if(spec.length!=null&&(!Number.isInteger(Number(spec.length))||Number(spec.length)<1||Number(spec.length)>100000))errors.push('Length is outside the safe range.');
  if(spec.code!=null||spec.script!=null||spec.javascript!=null)errors.push('Arbitrary JavaScript is not accepted by the browser indicator gate.');
  return{ok:errors.length===0,errors};
}

export function safeIndicatorSummary(spec){
  const {ok,errors}=validateIndicatorSpec(spec);
  return{ok,errors,permissions:['read:market-bars','write:indicator-series'],network:false,dom:false,storage:false,eval:false};
}
