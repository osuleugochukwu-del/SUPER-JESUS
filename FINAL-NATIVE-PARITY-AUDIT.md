# Trade Avata v10.2.0 — Final Native Parity Audit

This package was rebuilt from the full-native V10 work and checked again against the actual currently deployed Trade Avata repository baseline (`SUPER-CHART-AVATA`, main commit `7c7a7cdffa01e2ec953972a91d8a4afd4a0cfb16`).

## Preservation result

- Existing baseline files: **52**
- Existing baseline files missing from this package: **0**
- Existing files still byte-for-byte unchanged: **35**
- Existing files intentionally changed for the native-engine migration/final parity pass: **17**
- New native-engine, transition, stress-test and audit files were added; they do not replace AI, drawings, analytics, sharing, security or backend modules.

Important unchanged working modules include:

- `src/ai-client.js`
- `src/drawings.js`
- `src/data.js`
- `src/analytics.js`
- `src/market-intelligence.js`
- `src/share.js`
- `src/workspace-sync.js`
- `src/indicator-security.js`
- `src/alert-client.js`
- `src/replay-client.js`
- `src/utils.js`
- `server/app.py`
- `assets/styles.css`
- the original `engines/trade-avata-native-chart-v2.7.html`

The changed application files are intentional because they contain the native renderer, settings, indicator parity, engine-status text, cache/version changes and tests.

## Price scale and market-line completion

The final native price scale now owns:

- current/last price line
- current-price label block
- candle countdown directly under the current-price label on time-based charts
- Bid line and Bid price label
- Ask line and Ask price label
- collision handling when Bid/Ask/last price are close together
- editable line colour, width and solid/dashed/dotted style
- independent line and label visibility
- crosshair price label on the right axis
- crosshair time label on the bottom axis
- price precision from the active symbol

Countdown is disabled automatically for non-time constructions such as Renko/Range and can be turned on/off in Scales & Lines.

## Round-number grid completion

Major round price levels now drive the native horizontal major grid. Major round labels are visually stronger than ordinary scale text and are drawn from the same price transform as candles and indicators, preventing grid/price drift.

The separate old round-grid canvas is retained for compatibility but no longer draws a second competing grid.

## Oscillator completion

- RSI and ADX enforce 0–100 ranges.
- Stochastic enforces 0–100 and its 20/50/80 levels.
- Custom oscillator levels are honoured.
- Oscillator panes have their own right-side numeric scale.
- Oscillator pane price scales can be dragged independently and reset by double-clicking their price scale.
- Stochastic `%D` now waits for genuine `%K` values instead of averaging synthetic zero warm-up values.
- Indicator Source settings now affect price-source calculations (`close`, `open`, `high`, `low`, `hl2`, `hlc3`, `ohlc4`).
- Indicator line style and opacity now reach the native renderer.

## Scale-mode completion

Native Regular, Logarithmic, Percent and Indexed-to-100 modes now use their own axis-label semantics. Percent displays percentage labels; Indexed-to-100 displays index values; logarithmic placement uses the native logarithmic transform while retaining readable raw-price labels.

## Interaction and blank-chart protections

The native visible logical range is bounded so the user cannot drag/zoom the entire dataset completely off-screen. This protection applies to pan, wheel zoom, pinch zoom, timeframe synchronization and programmatic range changes.

Additional native behavior now includes:

- live-edge following while the trader remains at the live edge
- Return Live restoring live following
- manual scrolling disabling live following until Return Live
- min-bar-spacing enforcement
- kinetic/inertial horizontal scrolling
- bottom time-axis drag zoom
- bottom-axis double-click Return Live/reset behavior
- independent main/oscillator price-axis scaling
- exact small/mobile pane dimensions (no phantom minimum rendering surface)
- crosshair OHLC magnet support

## Time axis and sessions

The Native engine honours Trade Avata timezone choices (`UTC`, `Local`, `UTC+1 Lagos`) and can draw larger-period separators. Intraday charts use day boundaries, H4-style intervals use weekly boundaries, daily-style intervals use monthly boundaries, and longer intervals use yearly boundaries.

## Series parity

The native renderer now honours:

- `lastValueVisible`
- `priceLineVisible`
- price-line colour, width and style
- line/indicator opacity
- line style
- area top/bottom gradient where the browser canvas supports gradients
- histogram opacity
- series and pane coordinates used by drawings/replay

## TradingView/Lightweight Charts removal

Production runtime files contain no Lightweight Charts / TradingView renderer dependency. `index.html` loads only Trade Avata modules. Compatibility names such as `.lwc-host` remain only where keeping the existing DOM/CSS contract prevents unrelated features from breaking; they do not load or invoke Lightweight Charts.

## Validation

Final validation:

- **75/75 repository tests passed**
- package verification passed
- **100,000** transition/Renko randomized scenarios passed
- **100,000** full-native geometry/transition scenarios passed
- **100,000** native geometry/axis/Home/timeframe-anchor scenarios passed
- **1,000** final parity constructions passed with Bid/Ask, countdown, axis, oscillator and blank-range invariants
- JavaScript syntax check passed for every source/test/stress module
- no existing baseline file is missing
- `ChartPane` retains every baseline method detected by the audit and adds native-transition/recovery methods

A true browser smoke test was attempted in the build environment, but the environment blocks browser navigation to local/file URLs by administrator policy. Therefore the final visual authority remains deployment on GitHub Pages followed by desktop + mobile inspection.
