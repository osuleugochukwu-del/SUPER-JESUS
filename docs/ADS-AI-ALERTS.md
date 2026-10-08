# Ads, AI and Alerts

## Advertising

The package includes a tiny dismissible house-ad surface for non-owner accounts. Owner mode is ad-free. A real AdSense deployment requires the production publisher ID, approved site and Google-compliant placement; the repository does not ship a fake publisher ID.

## AI

Trade Avata now has two deliberately separate AI experiences:

1. **Indicator AI** — conversational for the owner / explicitly entitled accounts. It can receive indicator profiles, chart context and later private server-side indicator outputs.
2. **Market Intelligence AI** — automated market output for all eligible viewers (bias, trend, momentum, volatility, support/resistance, heat-map/screener findings and alerts). Public users do not receive a general prompt box. Owner/admin/entitled accounts may additionally open a private market conversation.

Both private AI conversations include browser microphone dictation and browser text-to-speech playback. Audio is not stored by Trade Avata. The browser may rely on its own speech service depending on platform/browser.

**Security rule:** hiding a chat box is not sufficient. Production backend endpoints must verify authenticated role/entitlement (`owner`, `admin`, or explicit `ai_chat`) before forwarding any prompt to the AI provider. API keys and private indicator source never belong in GitHub Pages.

The frontend calls secure `/api/ai/indicator` and `/api/ai/market` seams. A real model/backend is deliberately not embedded into GitHub Pages.

## Alerts

The frontend supports local in-app/sound/browser test notifications and stores a notification history. The secure FastAPI gateway includes capability reporting plus protected test delivery seams for SMTP email and Telegram when server secrets are configured.

For real alerts that continue while the browser is closed, the backend must evaluate alert conditions against fresh server-side market data.
