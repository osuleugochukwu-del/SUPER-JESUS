
## v10.2.0 — Full Native state isolation + approved layout restoration
- Isolated SUPER-SUPREME browser state from the older shared github.io Trade Avata state key.
- Added one-time safe migration that preserves the user's layout, panes, drawings, indicators and preferences while discarding stale engine viewport internals.
- Restored the approved old shell price-axis footprint (42px mobile / 46px desktop) so the Full Native chart no longer changes the established layout proportions.
- Added compact axis-label fitting for Bid / Ask / Last / crosshair labels inside the restored price-axis width.
- Removed null construction-menu labels and hardened invalid saved layout/period/chart values.
- Bumped the service-worker cache to force browsers to receive the corrected state/layout build.
# Trade Avata Chart v8.0

v8 is a functionality-focused upgrade that preserves the approved Trade Avata interface while rebuilding the chart interaction model underneath it.

## v8.0.4 — Market Intelligence, owner AI voice and read-aloud
- Preserves the approved V8 chart/layout and adds new Market/AI surfaces only.
- Adds Market Intelligence tabs: Overview, Heat Map, Screener, Sentiment and AI Alerts.
- Adds a dedicated AI Insights side panel with automated market summary, bias, trend strength, momentum, volatility, support/resistance, risk state, setup quality and likely scenario.
- Public users receive automated outputs only; conversational prompts are hidden unless the account is owner/admin or has the secure AI-chat entitlement.
- Existing Indicator AI stays separate and now includes a private conversation area for indicator/signal questions.
- Both permitted AI conversations support microphone dictation through browser speech recognition and Play/Listen read-aloud through browser text-to-speech.
- Adds AI settings for voice input, read-aloud and optional automatic playback of replies.
- Adds a secure AI gateway client seam; API keys/models remain backend-only.
- Market previews are explicitly labeled DEMO until the real normalized market-data gateway is connected.
- Adds a periodic Market Intelligence refresh loop without modifying chart behavior, candles, drawings, replay, sharing or existing controls.

## v8.0.3 — Oscillator pane and indicator visibility controls
- RSI, Stochastic, MACD, ATR, ADX, CCI, Momentum, ROC and Volume now open in their own independently resizable lower panes rather than all being forced into one shared oscillator pane.
- Lower panes use Lightweight Charts pane separators with drag resizing and remember each indicator pane height locally.
- Every indicator legend tag now includes an eye control. Hidden indicators remain as compact muted tags so they can be restored without reopening the indicator browser.
- Eye controls work for both price overlays (EMA, SMA, Bollinger, VWAP, etc.) and lower oscillators.
- Double-clicking empty space in the main chart toggles all oscillator panes off/on while preserving the trader's previous per-oscillator visibility selection. Double-clicks on candle/series geometry, drawings and the right price scale do not trigger the oscillator toggle.
- Existing V8 layout, candle styling, sharing, replay, drawings and backend seams were preserved.

## Chart
- renderer starts only after pane mount;
- TradingView-like Home View reset rather than fitting all history;
- separate View All Data command;
- freer horizontal navigation and manual vertical mode;
- future planning whitespace;
- realistic demo-data movement;
- bid/ask/last-price/countdown foundations.

## Candles and appearance
- independent body, border and wick bull/bear colours;
- border/wick toggles;
- twenty preset candle palettes;
- platform Dark/Light/System theme separate from chart appearance.

## Periods
- Time;
- Ticks;
- Renko Pips;
- Renko Time;
- Range Pips;
- favorite periods on the existing compact top bar;
- legacy chart styles preserved.

## Indicators
- searchable professional built-in library;
- favorites and configurable parameters;
- lower-pane oscillators;
- replay-aware indicator truncation to stop future-data leakage.

## Drawings
- Cursor/Crosshair/Cross Line separation;
- no click-to-delete mode;
- drawing-only undo/redo;
- multi-select/copy/paste/duplicate;
- weak/strong magnet;
- future-space drawing coordinates;
- floating object toolbar;
- Style/Coordinates/Visibility editor;
- richer Fibonacci and Long/Short Position behavior.

## Replay
- chart-based replay start selector;
- on-chart playback toolbar;
- comfortable replay viewport anchor and Follow mode;
- price and indicators advance together;
- online replay seam and offline replay package download.

## Analytics
- expanded cTrader-inspired Summary/Performance/Trades/Symbols/Behaviour views;
- equity curve, drawdown, expectancy, long/short, time/symbol breakdowns and behavior insights.

## Workflow and workspace
- snapshot menu with Save/Copy/Share/Link actions;
- chart right-click menu;
- named Chart Templates and Workspaces;
- detached synchronized browser-window chart foundation for multi-monitor use;
- modal-width bug repaired without redesigning the interface;
- connected broker account/status control;
- Node-24-compatible GitHub Pages workflow.

## v8.0.2 — Organic Share Engine patch
- Preserves the approved v8 interface; the release adds sharing and frontend readiness fixes without redesigning the chart.
- Adds a universal Trade Avata Share Center for chart, selected trade/drawing, replay and analytics sharing.
- Existing Snapshot actions remain intact; new branded sharing actions are added underneath them.
- Branded social cards are rendered locally in the browser and are never uploaded or stored by Trade Avata.
- Adds Copy link, Copy image, Download card, Share and Copy summary actions.
- Adds clear LIVE / DEMO / REPLAY / BACKTEST / UNCONFIRMED share labels.
- Adds stateless compact share links using URL metadata rather than stored screenshot files.
- Adds a stable referral-attribution ID to share links plus local share-event hooks for future admin conversion analytics.
- Selected drawings/Long-Short objects can be shared from their existing floating toolbar.
- Replay gets a Share action on the existing on-chart replay toolbar.
- Analytics gets a Share analytics action; the current demo analytics source is always labelled DEMO.
- Incoming stateless Trade Avata share links can reopen the chart configuration and selected shared drawing without image storage.
- Dynamic WhatsApp/Telegram/X rich preview images remain a future backend function: generate on request, optionally cache briefly, then discard rather than permanently storing screenshots.

## v8.0.2 Frontend readiness verification
- Share cards and chart screenshots carry Trade Avata branding; marketing cards include `Trade Avata Chart`, `Trade Simple`, and `Created with Trade Avata · Trade Simple`.
- Orders tab now renders simulated/pending orders instead of an empty placeholder.
- Quick Buy/Sell and chart-price order actions open a complete frontend order ticket. Demo/Replay orders work locally; LIVE submission is wired to the secure broker-gateway endpoint seam.
- Position Modify and Close actions now have working frontend flows; LIVE actions wait for the secure broker gateway.
- Right-side Tools panel now uses the existing drawing favorites instead of a future-placeholder message.
- Previously no-op Events and Fibonacci trend-line controls now persist/work at the frontend level.
- Raw chart screenshots also include `Trade Avata · Trade Simple` branding.
- Service-worker cache version bumped so deployment does not retain the earlier cached build.

## Master Recovery v9.1.0 — Native v2.7 + Chart Quality AI
- Trade Avata Native v2.7 now actively paints the default chart candles inside Supreme panes.
- Existing Supreme coordinate/axis/oscillator layer remains as compatibility scaffolding and TradingView fallback.
- Native timeframe switching preserves candle spacing/future space and applies the approved v2.7 max zoom-out rule.
- Owner-only Chart Quality AI added as the third AI surface with automatic diagnostic prompts and lightweight monitoring.
- Chart Quality AI monitors FPS bursts, native paint time, timeframe switching, series rebuilds, overlay redraws, long tasks, runtime errors and oscillator layout drift.
- Quality AI works with a local diagnostic fallback when the secure AI provider is not configured.

## Full Native v10

Production chart rendering is now Trade Avata Native v3.2 Full Native. See `FULL-NATIVE-V10-RELEASE.md`.

## Full Native v10.1 — Final parity pass
- Current/Bid/Ask price lines now have native right-axis labels with editable colour, width and style.
- Candle countdown is rendered directly beneath the current-price label for fixed-time charts and remains user-toggleable.
- Major round-number levels now drive the primary horizontal grid and receive stronger axis emphasis.
- RSI/Stochastic/ADX fixed ranges and oscillator guide levels are native; oscillator axes can be scaled/reset independently.
- Crosshair price/time labels and OHLC magnet support are native.
- Indicator Source, line style and opacity are honoured by calculations/rendering; Stochastic %D warm-up no longer averages synthetic zeros.
- Regular/Log/Percent/Indexed-to-100 scale labels use their proper native semantics.
- Visible-range bounding prevents pan/zoom/sync from leaving the chart completely blank.
- Live-edge follow, Return Live, kinetic pan, min bar spacing, bottom-axis zoom/reset and exact small-pane geometry were completed.
- Timezone and larger-period separator rendering are native.
- Area gradients, last-value visibility and price-line visibility are implemented natively.
- Final preservation audit confirms zero missing files from the current repository baseline.
- Final validation: 75/75 tests + 100,000 transition/Renko + 100,000 full-native + 100,000 native-core + 1,000 parity stress scenarios.
