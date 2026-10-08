# Trade Avata Master Recovery v9.1

This recovery layer is designed for the current `AVATA-CHART-SUPREME` shell. It does **not** redesign the approved thin top/side chart interface. It fixes and restores behavior inside it and modernizes only menus, settings, panels and secondary surfaces.

## Implemented in this recovery package

- Explicit **Mouse / Pointer** return tool; Escape is force-wired back to Pointer.
- Mobile drawing safety: active drawings own the touch gesture, preventing the chart from panning underneath a two-tap drawing.
- Hardcoded Buy/Sell chart badges hidden; EMA is the only clean-workspace default study.
- Separate chart-type selector removed from the top toolbar; one organized **Chart** dropdown handles Candlestick, Heiken Ashi, Renko Time, Renko Pips and Miscellaneous.
- Seconds remain supported and custom intervals / custom Renko values are available.
- Indicator browser starts with **all indicators already on the chart**.
- Every attached indicator exposes **Eye (hide/show), Edit, Remove**.
- Indicator settings add parameters, source where relevant, line width, line style, opacity, reusable palette, recent colours, custom colour and oscillator levels.
- RSI / Stochastic / MACD / ADX / CCI / Momentum / ROC guide levels are rendered in oscillator panes.
- Oscillator pane heights are captured before timeframe changes and reapplied after rebuilds.
- Broad chart double-click oscillator hide/show behavior is disabled.
- Real-time drawing overlay refresh while price scale / chart gestures are in progress, eliminating the visible “chart moves first, trend line catches up” lag.
- Long/Short risk-reward tool becomes **one-click placement**, opens at 1:1 with chart-aware initial distance, shows six editing handles, locks entry-price movement during horizontal resizing, and supports horizontal body movement without changing entry price.
- Compact lower chart navigation: zoom out/in, one bar back/forward, Home. It is translucent at rest and brightens on hover.
- Separate Return-to-Live pill appears at the lower-right only after leaving the live area.
- Replay toolbar gets a drag handle and **SELL / BUY** simulation buttons.
- Six platform themes: Trade Avata, Midnight, Graphite, Navy, Slate and Light. Platform themes do not overwrite chart/candle colours.
- Opened panels/settings receive a compact 2026 Trade Avata visual treatment without changing the approved chart shell.
- AI chat gate changed to Owner or explicitly entitled account; `admin` alone is not enough.
- Owner-only **Private Indicator Vault** restored at the frontend workflow level: paste/upload JS/TS, Build & Validate static gate, build ID/hash report and activation state. Arbitrary private source is not executed in the browser; production execution remains server-sandboxed.
- Owner Ops receives a TradingView fallback enable/disable control foundation.
- Trade Avata Native Chart **v2.7** is bundled under `engines/` and its HiDPI candle renderer is now actively integrated as the default visible chart renderer inside Supreme panes.
- A fallback engine switch preserves the existing TradingView Lightweight Charts renderer; Owner Operations can disable that fallback.
- Owner-only **Chart Quality AI** is added as the third AI surface beside Indicator AI and Market AI. It samples chart performance lightly, records technical errors/layout drift, generates automatic recommendations, and provides built-in diagnostic questions.

## Preserved from Supreme

Market Intelligence, Market AI, Indicator AI, Share Engine, analytics, replay architecture, workspaces/templates, drawing tools, object tree, broker gateway seams, alerts, mobile dock and the existing approved chart shell are not removed by this recovery layer.

## Important architecture note

The default visible candles are now rendered by Trade Avata Native v2.7 on a HiDPI canvas inside each Supreme pane. To avoid breaking working drawings, crosshair mapping, indicators, oscillator panes and replay, the existing Lightweight Charts infrastructure remains underneath as coordinate/axis/pane scaffolding and as the switchable fallback renderer. This is an intentional compatibility bridge: Trade Avata owns the visible default candle renderer today while the remaining axis/pane infrastructure can be replaced incrementally without another destructive rewrite.
