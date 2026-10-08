# Trade Avata Master Recovery v9.1.0 — Native v2.7 + Chart Quality AI

This package preserves the approved Trade Avata/Supreme application shell and Master Recovery features while the production chart is now **Trade Avata Native v3.2 Full Native**. The original standalone Native v2.7 engine remains in `engines/` as a preserved reference. Owner-only Chart Quality AI remains available. See `FINAL-NATIVE-PARITY-AUDIT.md` and `FULL-NATIVE-TEST-REPORT.md`.


## v9.1 native-engine integration

- **Trade Avata Native v2.7 is now the default visible candle renderer inside the Supreme workspace.** It is no longer merely bundled as a standalone reference file.
- The integration deliberately keeps Supreme's mature time/price-coordinate, axes and oscillator scaffolding underneath the native renderer so existing drawings, indicators, replay and multi-pane features are not broken. The candles the trader sees in the default engine are painted by Trade Avata's own HiDPI canvas renderer.
- v2.7 zoom-out limits are applied to the time scale and timeframe switches preserve visual candle spacing / future-space positioning instead of blindly resetting density.
- `Chart engine` is **Trade Avata Native v3.2 Full Native**. The production platform no longer loads an external chart renderer.
- A third AI surface, **Chart Quality AI**, runs a lightweight monitor by default. It samples frame rate periodically, native-paint time, timeframe-switch/rebuild time, overlay redraw cost, long tasks, runtime errors and oscillator pane drift.
- Chart Quality AI is visible only to the Owner (or local Owner preview), exposes automatic recommendations and built-in suggested questions, and falls back to a local diagnostic engine if the secure AI backend is not configured.
- Monitoring is technical only: it does not send broker passwords, tokens or private indicator source code.

# Trade Avata Chart v8.0.4 — Professional Chart + Market Intelligence + Organic Share Engine

This is the **complete standalone v8 repository package**. Upload the contents of the extracted ZIP directly to the root of one GitHub repository. It is a full package, not a patch layer.

## Important design rule

**The approved Trade Avata interface is intentionally preserved.** v8 focuses on making the existing chart, menus, panels, drawings, replay and analytics behave like a mature trading terminal. It does not redesign the shell the user approved.

## Major v8 improvements

### Chart movement, zoom and Reset
- Chart panes mount before the renderer is initialized, fixing the blank-until-interaction problem.
- **RESET is now a Home View**, not `fitContent()` over all history.
- Home View restores a comfortable recent-bar window, normal candle spacing, right-side breathing room and Auto price scale.
- **View All Data** is a separate command for intentionally fitting all loaded history.
- Horizontal time-density zoom and vertical price-scale manipulation remain separate.
- Price-scale drag releases the protected AUTO state into MANUAL/FREE vertical movement; AUTO restores intelligent scaling.
- LIVE returns to the current market area.
- Future whitespace is usable for planning and drawings.

### Candles and palettes
- Candles have **three independent visual layers**: body, border and wick.
- Separate bull/bear colors for each layer.
- Border and wick visibility controls.
- Twenty built-in professional candle palette presets plus custom colors.
- Chart appearance remains separate from the platform's Dark/Light/System theme.

### Period model: Time, Ticks, Renko and Range
The existing chart styles remain available (Candles, Bars, Line, Area, Heikin-Ashi, legacy Renko/Range), but v8 adds a separate professional period/construction model:
- Time
- Ticks
- Renko Pips
- Renko Time (Trade Avata mode, intentionally separate from cTrader-native pip Renko)
- Range Pips

Renko Pips uses a cTrader-inspired one-brick continuation / two-brick reversal rule. Browser demo reconstruction remains approximate when actual tick history is unavailable; production exactness requires real tick data.

### Indicator browser
The old “Add EMA” menu is replaced with a searchable built-in indicator library including:
- EMA / SMA / WMA
- Bollinger Bands
- VWAP
- RSI
- MACD
- Stochastic
- ATR / ADX
- CCI
- Momentum / ROC
- Volume

Indicators can be favorited and configured. Replay truncates indicator data at the replay cursor so future indicator values do not leak into backtests.

### Drawing system
- Cursor, Crosshair and Cross Line are separate concepts.
- One-shot drawing returns the mouse to Cursor unless Keep Drawing is enabled.
- No dangerous click-to-delete drawing mode.
- Shift multi-select, Delete/Backspace selected objects, drawing copy/paste/duplicate.
- Weak and Strong magnet modes.
- Drawings can extend beyond the latest candle into **future planning space**.
- Selected/hovered objects get a compact floating toolbar.
- Long/Short Position is anchored to chart coordinates and shows risk/reward statistics on hover/selection.
- Full drawing editor uses **Style / Coordinates / Visibility** tabs.
- Fibonacci supports independent levels, colors, visibility, extensions and background controls.

### Replay / backtesting
- Replay start selection happens directly on the chart with a vertical selector.
- Playback controls live on-chart so replay does not shrink the chart.
- Price **and indicators** are truncated at the replay cursor.
- Follow Replay keeps the active bar comfortably inside the chart; manual movement can disable follow.
- Online Replay remains the primary architecture through the market-data gateway.
- Offline replay packages can be downloaded for later use.
- Replay and broker execution paths remain separated for safety.

### Analytics
The Analytics tab is expanded from six cards into a cTrader-inspired performance workspace with:
- Summary
- Performance
- Trades
- Symbols
- Behaviour/insights
- Equity curve
- win rate, profit factor, expectancy, average win/loss, drawdown, long/short performance, time/symbol breakdowns and behaviour observations.

### Snapshot and chart context menu
Snapshot now opens choices rather than immediately forcing a download:
- Save image
- Copy image
- Share
- Copy chart link

The generated chart image includes symbol/period/chart metadata and Trade Avata context.

Right-clicking the chart opens a contextual menu with Home/Reset, View All Data, Copy Price, Add Alert, Object Tree, Templates, Detach Chart, drawing removal and Settings.

### Organic sharing without image-storage costs
- Existing v8 UI is preserved; sharing is additive.
- Universal Share Center for chart, selected trade/drawing, replay and analytics.
- Branded social cards are generated locally in the browser and are not uploaded or permanently stored.
- Share actions: Share, Copy Link, Copy Image, Download Card and Copy Summary.
- LIVE / DEMO / REPLAY / BACKTEST / UNCONFIRMED verification labels are embedded in shared content.
- Stateless share links carry compact chart/share metadata and referral attribution rather than screenshot files.
- Future rich social previews are designed for on-demand backend generation plus short caching, not permanent Firebase image storage.
- See `docs/SHARING.md`.

### Templates, workspaces and multi-monitor foundation
- Named **Chart Templates** remain available for reusable indicator/chart setups.
- Named **Workspaces** save multi-chart layout/configuration and workspace state.
- Charts can be opened in a synchronized detached browser window for multi-monitor use and reattached/closed later.
- Browser windows synchronize through a workspace communication layer.

### Settings and modal repair
- The approved Settings layout remains intact.
- Single-content dialogs now use the full modal width instead of being crushed into the old 160px navigation column.
- Chart Settings now separates Symbol, Status, Scales, Canvas, Platform Theme, Trading, Alerts, AI and Events.
- Platform theme is separate from chart colors.

### Broker/account behavior
The browser never stores broker passwords. cTrader connection is designed around secure OAuth/backend routing. Once a live broker account is connected, the account control displays the connected account/status instead of still appearing logged out.


## Market Intelligence + controlled AI in v8.0.4
- Added a new **Market Intelligence** workspace without removing or rearranging the approved chart shell.
- Market Center includes Overview, Heat Map, Screener, Sentiment and AI Alerts surfaces.
- Added a separate **AI Insights** panel for automated market output. Public/free users are designed to receive outputs only; no public prompt box is exposed.
- The existing **Indicator AI** remains separate and conversational for the owner / explicitly entitled accounts.
- Both private AI areas support **voice-to-text** through browser speech recognition when available.
- AI/market replies and summaries include **Play / Listen** controls using browser text-to-speech, so no audio file has to be stored by Trade Avata.
- Conversational AI access is gated in the frontend by owner/admin/`ai_chat` entitlement checks and must also be enforced by the secure backend.
- Live AI/model calls are not embedded in GitHub Pages. The frontend is wired to a secure `/api/ai/market` and `/api/ai/indicator` gateway seam.
- Demo market previews are explicitly labeled; the package does not present generated demo values as live feed data.

## GitHub Pages deployment

1. Create a new public repository (for example `TRADE-AVATA-CHART-V8`).
2. Extract the ZIP.
3. Upload **everything inside it** to the repository root.
4. Commit to `main`.
5. Open **Settings → Pages** and set **Source = GitHub Actions**.
6. Open **Actions** and wait for `Deploy Trade Avata Chart v8` to finish.

The included workflow uses current Node-24-compatible GitHub actions and runs tests, package verification and Python gateway syntax validation before deployment.

## Local verification

```bash
npm test
npm run verify
python -m py_compile server/app.py
```

To preview locally:

```bash
python -m http.server 4173
```

then open `http://localhost:4173`.

## Production boundary

GitHub Pages is the static frontend only. Real cTrader tokens, broker order routing, licensed live/historical market data, continuous server alerts, private indicators, AI secrets, dynamic rich-preview generation, live broker services and cloud workspace sync belong on the secure backend/VPS/Firebase infrastructure. Generated share images themselves do not need permanent storage.

## Documentation
- `docs/MASTER-UPGRADE-SPEC.md`
- `docs/PLATFORM-INFRASTRUCTURE.md`
- `docs/SECURITY-INDICATORS.md`
- `docs/RENKO-NOTES.md`
- `docs/ADS-AI-ALERTS.md`
- `docs/UPGRADE-CHECKLIST.md`
- `docs/SHARING.md`

## Attribution
Chart rendering now uses **Trade Avata Native v3.2 Full Native**. Trade Avata owns the chart surface, axes, coordinates, candles, indicators, oscillator panes, crosshair, pan/zoom and rendering pipeline.

## Indicator pane controls in v8.0.3
RSI, Stochastic and other oscillators use dedicated lower panes with draggable separators. Indicator legend tags include eye controls for instant hide/show; hidden indicators stay as compact tags. Double-click empty space in the main chart to temporarily hide or restore all oscillator panes without affecting price overlays such as EMA. Pane heights are remembered locally.


## Master Recovery build (2026-10-07)

This package includes the Master Recovery compatibility layer requested after v8.0.4. It preserves the approved Supreme chart shell while restoring/repairing indicator management, modern panels/themes, pointer/mobile drawing behavior, risk/reward placement, oscillator persistence/levels, lower navigation, replay mobility/trading controls, AI permission gating, private-indicator build-gate UI, and the bundled Native Chart v2.7 baseline. See `docs/MASTER-RECOVERY-CHANGELOG.md`.
