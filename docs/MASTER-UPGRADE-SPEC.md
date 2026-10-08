# Trade Avata Chart v8.0 — Master Upgrade Specification

## Release principle

The v8 release **does not redesign the approved Trade Avata interface**. The top toolbar, left drawing rail, right utility rail, bottom terminal strip, compact dark layout and general information architecture remain the approved shell. v8 upgrades the behaviour, chart engine integration, drawing model, periods, replay, analytics, settings and reliability inside that shell.

## Chart engine and navigation

1. Initialize the rendering engine only after a pane is mounted and has a measurable size.
2. New charts must open in a safe, readable Home View. Candles must never require a refresh or random click to appear.
3. RESET means **Home View**: recent readable bars, normal bar spacing, right-side breathing room, latest market visible, Auto price scale.
4. `View All Data` is separate from RESET and may use fit-to-content intentionally.
5. Horizontal zoom changes time/bar density. Vertical price scaling remains independent.
6. Horizontal chart movement is free.
7. Dragging the right price scale releases protected AUTO into MANUAL/FREE vertical mode.
8. MANUAL/FREE must not snap back while the trader is manipulating the chart.
9. AUTO returns to intelligent visible-price scaling.
10. LIVE returns to the latest market area.
11. Future whitespace must be usable for planning and drawings.
12. The chart should keep a compact right price scale and thin time scale.
13. Optional grid/round-level lines remain configurable.
14. Price-scale modes: Normal, Logarithmic, Percent and Indexed-to-100 foundations.
15. Optional bid line, ask line, last price line and bar countdown.
16. Optional Data Window for the bar under the crosshair.

## Candles and chart appearance

17. Candles use the Lightweight Charts rendering core with high-DPI rendering.
18. Candle visual styling has three independent layers: **Body, Border, Wick**.
19. Bull and bear colours are separately configurable for all three layers.
20. Border and wick visibility are independently configurable.
21. Provide twenty professional preset palettes and custom colour controls.
22. Candle appearance must remain readable over a wide useful zoom range.
23. Platform theme and chart appearance are different systems.
24. Platform Theme: Dark / Light / System.
25. Chart appearance controls background, grid, candle colours, crosshair and scale visuals without recolouring the entire application.

## Chart styles and bar construction

26. Preserve the existing chart styles for users who want them: Candles, Bars, Line, Area, Heikin-Ashi and legacy transformed views.
27. Bar construction/period selection is separate from chart style.
28. Period categories: **Time, Ticks, Renko Pips, Renko Time, Range Pips**.
29. Period values can be favorited and promoted to the compact top toolbar.
30. Renko Pips follows a cTrader-inspired one-brick continuation / two-brick reversal rule.
31. Exact production Renko should use live/historical ticks where available.
32. OHLC-only Renko reconstruction must be treated as approximate.
33. Renko Time is a distinct Trade Avata construction mode and must not be falsely presented as cTrader-native Renko.
34. Range Pips remains distinct from Renko.

## Indicators

35. Indicators button opens a searchable indicator browser, not only the indicators already attached.
36. Core built-ins include EMA, SMA, WMA, Bollinger Bands, VWAP, RSI, MACD, Stochastic, ATR, ADX, CCI, Momentum, ROC and Volume.
37. Indicators can be favorited.
38. Each indicator has its own settings and parameter editor.
39. Overlay indicators and lower-pane oscillators are supported.
40. Indicator timestamps and chart data must stay synchronized.
41. Replay may use historical warm-up bars, but no future bars may enter indicator calculations after the replay cursor.
42. Private/third-party indicator execution remains behind the Indicator Security Engine.

## Drawings and object interaction

43. Basic drawing set includes Cursor, Crosshair, Cross Line, Trend, Horizontal, Vertical, Ray, Fibonacci, Rectangle, Long/Short Position, Measure, Text, Brush, Highlighter, Channel and Arrow.
44. Cursor/Arrow is the guaranteed way to free the mouse.
45. Crosshair is a tracking cursor, not a permanent drawing.
46. Cross Line is a drawing object.
47. Keep Drawing is OFF by default; completing one drawing returns to Cursor.
48. Escape cancels a draft and returns to Cursor.
49. No permanent click-to-delete drawing mode.
50. Delete/Backspace removes selected objects only.
51. Blank-chart click deselects; it does not delete.
52. Selected/hovered objects show a compact floating editing toolbar.
53. Double-click/double-tap opens full object settings.
54. Drawing settings use **Style / Coordinates / Visibility** tabs.
55. Fibonacci supports per-level enable/value/colour, line styling, extension and background controls.
56. Long/Short Position entry is placed at the exact clicked chart coordinate.
57. Entry, target and stop handles are independently draggable.
58. The whole position object can be moved together.
59. Position stats include risk, quantity/size, stop/target distance, expected P/L and R:R.
60. Position details appear on hover/selection and become visually quiet when deselected.
61. Plan Mode remains separate from broker execution; deliberate Use Setup/Create Order is required.
62. Weak Magnet and Strong Magnet modes.
63. Multi-select, copy/paste and duplicate drawings.
64. Undo/Redo is for chart-object editing; it must not undo symbol/timeframe/chart-period/navigation changes.
65. Drawings store chart/logical coordinates so they can extend beyond the latest candle into future planning space.
66. Object visibility can be constrained by period/timeframe.
67. Object Tree supports selection and management foundations.

## Replay / backtesting

68. Replay begins directly on the chart.
69. Clicking Replay activates a vertical start selector; scrolling backward and clicking chooses the start bar.
70. Replay controls live on the chart and must not require the bottom panel to shrink the chart.
71. Future candles disappear at the replay cursor.
72. Future indicator values/signals also disappear at the replay cursor.
73. Indicator warm-up may use earlier history only.
74. Playback controls include restart/back/step/play-pause/speed/date-time/follow/exit.
75. Replay active bar should sit in a comfortable viewport position with future whitespace.
76. Manual chart movement disables forced following; Follow Replay restores the anchor.
77. Online Replay is primary and requests historical data through the secure market-data gateway.
78. Offline replay packages can be downloaded and replayed without network access.
79. Replay trading is isolated from live broker execution.
80. Replay sessions can be persisted as the backend/workspace layer matures.
81. Architecture should ultimately support Time, Renko Pips, Renko Time and Range Pips replay when suitable historical source data exists.

## Analytics

82. Analytics should provide more than a handful of cards.
83. cTrader-inspired sections: Summary, Performance, Trades, Symbols and profitability/behaviour views.
84. Metrics include total trades, win rate, net P/L, profit factor, expectancy, average winner/loser, maximum drawdown, long/short results, volume and duration.
85. Include an equity curve.
86. Include breakdowns by symbol and time bucket.
87. Add Trade Avata behaviour insights that help the trader identify recurring strengths and mistakes.
88. Analytics architecture supports both broker history and replay-session history.

## Snapshot, context menu and settings

89. Snapshot opens a menu first: Save Image, Copy Image, Share, Copy Chart Link.
90. Snapshot image includes symbol, period, chart style, relevant visible study context, timestamp/timezone and Trade Avata branding.
91. Permanent public snapshot-image links require server/storage infrastructure and must not be faked in a static build.
92. Right-click chart context menu includes Reset/Home, View All Data, Copy Price, Add Alert, Object Tree, Templates, Detach, drawing removal and Settings.
93. Price-aware broker actions are shown only when appropriate and must respect Demo/Replay/Live safety boundaries.
94. Single-content dialogs use the full modal width; only Settings uses the split navigation layout.
95. Current visual Settings design is preserved while its content is completed.

## Templates, workspaces and multi-monitor

96. Chart Templates save reusable chart/indicator appearance without binding to a symbol by default.
97. Named Workspaces save the broader multi-chart layout/configuration and drawings.
98. Auto-save/current-session recovery remains available.
99. Account/cloud cross-device workspace sync belongs to Firebase/backend production infrastructure.
100. Active charts can open in detached synchronized browser windows for multi-monitor setups.
101. Detaching preserves symbol, period, chart style and chart state rather than creating a blank unrelated chart.
102. Detached browser windows communicate through the workspace sync layer and can be reattached/closed.

## Broker/account and security

103. Trade Avata account identity and broker OAuth identity remain separate.
104. Connected broker status/account replaces the generic “Sign in / Broker” appearance after successful connection.
105. Broker passwords are never entered into the browser frontend.
106. Live tokens/secrets/order routing stay on the secure backend/VPS.
107. Demo data must disappear cleanly once a real feed is connected.
108. Stale real data must show an explicit stale/reconnecting state instead of silently falling back to fake prices.
109. Indicator JavaScript remains restricted; no arbitrary untrusted script execution in the authenticated trading page.
110. Owner-only AI, alert-server, branding and advertising foundations remain separated from broker execution.

## Performance and deployment

111. Preserve mobile responsiveness and the approved mobile dock/top-scroll model.
112. Lazy-load/avoid unnecessary heavy work where practical.
113. GitHub Pages remains the static frontend.
114. Backend/server functionality remains separately deployable.
115. GitHub workflow must run tests and integrity verification before Pages deployment.
116. Workflow must use current Node-24-compatible GitHub actions.
117. No dead buttons should pretend a production service is connected when it is not.
118. The release package must be one complete ZIP with files at repository root after extraction.


## v8.0.1 Organic Share Engine
- Preserve the approved v8 interface; add sharing behavior only.
- Local-only generated chart/share images; no Firebase image archive.
- Universal Share Center: Share, Copy Link, Copy Image, Download Card, Copy Summary.
- Chart, selected trade/drawing, replay and analytics share entry points.
- LIVE/DEMO/REPLAY/BACKTEST/UNCONFIRMED verification labels.
- Compact stateless URL payloads plus referral-attribution foundation.
- Local share-event hooks for future centralized admin analytics.
- Future dynamic social preview endpoint generates previews on request and discards/short-caches them.

## v8.0.4 Market Intelligence and controlled AI additions
- Preserve every approved chart/workspace control; Market Intelligence is additive.
- Market Center: Overview, Heat Map, Screener, Sentiment, AI Alerts.
- AI Insights: automated market summary, bias, trend strength, momentum, volatility, support/resistance, risk state, setup quality and likely scenario.
- Public/free users: automated AI outputs only; no open-ended AI prompt interface.
- Owner/admin/explicitly entitled users: private conversational Market AI and Indicator AI.
- Existing Indicator AI remains separate from Market AI and can understand indicator profiles/signals.
- Both private AI conversations support microphone dictation where the browser supports speech recognition.
- Every AI reply/market summary can be played aloud through browser speech synthesis; Trade Avata stores no generated audio file.
- Production AI prompt access must be verified server-side; frontend hiding is never treated as security.
- AI API keys, model credentials and private indicator logic remain backend-only.
- Market previews must never be mislabeled live. The live cTrader/normalized feed replaces the demo provider when connected.
