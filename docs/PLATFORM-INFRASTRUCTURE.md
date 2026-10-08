# Trade Avata — Infrastructure Roadmap for a Broker-Onboarding Platform

## Short investor answer

To fully own the platform rather than only display another platform’s feed, Trade Avata needs its own broker-neutral market-data and trading infrastructure: quote ingestion, symbol normalization, candle/tick/history storage, real-time WebSocket distribution, broker adapters, order routing, account reconciliation, risk controls, alerts, security, monitoring, replay and broker onboarding APIs.

## Layer 1 — Client products

- Web/PWA chart
- Mobile-focused web app
- Future native/desktop shells if justified
- Trader workspace, drawing tools, indicators, replay and analytics

## Layer 2 — Identity and product backend

- Authentication
- Roles/entitlements
- Subscriptions
- Workspace preferences
- Indicator permissions
- Audit logs
- Branding/admin controls

## Layer 3 — Market-data platform

- Broker/provider ingestion adapters
- Tick normalizer
- Symbol master
- Candle engine from seconds upward
- Tick-driven Renko/Range engines
- Historical store
- Caching
- Real-time WebSocket fan-out
- Stale-price/latency monitoring

## Layer 4 — Trading platform

- Broker adapters
- OAuth/API credential vault
- Order Management System
- Position/order/account reconciliation
- Risk controls
- Execution audit trail
- Circuit breakers for stale/disconnected feeds

## Layer 5 — Compute services

- Server alerts
- Private indicator sandbox
- Replay/backtest engine
- Analytics
- AI assistant services

## Layer 6 — Broker onboarding

A broker should eventually receive a controlled onboarding flow rather than requiring hard-coded work each time:

- Organization registration and verification
- API/FIX/cTrader/proprietary adapter selection
- Sandbox certification
- Symbol/contract mapping
- Rate limits
- API keys/certificates
- Health/status dashboard
- Production approval
- Billing/usage records

## Reliability

- Primary production region/server pool
- Standby/failover environment
- Database backups
- Encrypted secret store
- Metrics/logs/traces
- Synthetic health checks
- Incident response and rollback

## Important boundary

A charting UI alone is not a broker platform. Direct broker onboarding becomes realistic only when the data, execution, security, contractual and operational layers above exist and have been tested under real load.

## Market Intelligence / AI routing
The frontend now expects one shared market-intelligence layer that can feed Chart, the main Trade Avata website, alerts and future mobile clients. Production flow should be:

`cTrader / licensed market feed -> normalization gateway -> candle/tick history -> Market Intelligence Engine -> Heat Map / Screener / Alerts / AI context`

The AI layer should consume structured context rather than raw screenshots/ticks whenever possible. Conversational routes are privileged and must enforce owner/admin/explicit entitlement on the server. Automated market outputs can be cached/rate-limited separately from owner conversations.

Voice input is a browser UX feature that produces text before the privileged AI request. Read-aloud uses browser speech synthesis and should not create permanent audio files.
