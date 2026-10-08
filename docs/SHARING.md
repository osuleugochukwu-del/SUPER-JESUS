# Trade Avata Chart — Zero-Image-Storage Sharing

v8.0.3 retains the chart-side organic sharing foundation without redesigning the approved interface.

## Core rule
Generated chart/share PNG files are created in the trader's own browser and are **not uploaded to Firebase or Trade Avata storage**.

## Current static/frontend sharing
- Save chart image: local browser download.
- Copy chart image: local clipboard.
- Share chart image: native device/browser share sheet when supported.
- Share Center: branded local social card with Share / Copy Link / Copy Image / Download Card / Copy Summary.
- Selected Long/Short/drawing: share from the existing floating object toolbar.
- Replay: share from the existing on-chart replay controls.
- Analytics: share a compact selected performance summary.

## Stateless share links
The current GitHub/static package can generate a compact URL containing only safe share metadata in the URL hash. It can include:
- symbol;
- bar period/construction;
- chart type;
- selected visible indicator specifications;
- selected drawing/trade coordinates;
- verification status;
- replay progress or selected analytics summary;
- referral-attribution ID.

It does **not** contain a screenshot file and does not require Firebase image storage.

## Verification labels
Every share is labelled as one of:
- LIVE
- DEMO
- REPLAY
- BACKTEST
- UNCONFIRMED

Simulation status overrides broker status so replay/backtest content cannot be presented as live results.

## Referral foundation
Each installation receives a small stable referral/share ID. It is carried inside share metadata. Opening a shared link records the inbound ref locally and emits a `tradeavata:share-event` browser event. A future Firebase/admin backend can consume equivalent events for centralized conversion analytics without changing the chart sharing UX.

## Future rich social previews without permanent image storage
WhatsApp, Telegram, Discord and social crawlers need a public image URL for a rich preview. Production architecture should use:

`share metadata -> temporary preview endpoint -> generate PNG on request -> return PNG -> discard / short CDN cache`

Do not create a permanent screenshot archive. The durable record can remain small structured metadata only.

## Privacy
Sharing is always deliberate. No journal note, account credential, broker password, follower account or private infrastructure is included automatically. The user chooses to share.
