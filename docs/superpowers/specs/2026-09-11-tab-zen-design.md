# Tab Zen — Design Spec

## Purpose

A Chrome extension (Manifest V3) that declutters open browser tabs with one
click: an AI pass groups tabs into named clusters, animates them collapsing
into a saved "session," and lets the user restore or delete sessions later.
The single differentiator versus existing tab managers (OneTab, Toby) is
visual polish — a satisfying, animated, well-designed UI on top of a
commodity feature.

Goal: build in 1–2 weeks, launch via Chrome Web Store organic search (no
existing audience required), reach ~$1k MRR, and end up with Stripe-verified
revenue suitable for a future listing on TrustMRR.com.

## Non-goals

- No user accounts / auth system beyond an email-keyed license lookup.
- No team/collaboration features.
- No support for browsers other than Chrome (Manifest V3) at v1.
- No mobile app / RevenueCat integration.

## Architecture

```
┌─────────────────────────┐        ┌──────────────────────────┐
│ Chrome Extension (MV3)  │        │ Cloudflare Worker (API)  │
│                          │        │                          │
│ Popup (React + Vite)    │──HTTP─▶│ /api/group               │
│  - Tidy Up button        │        │  - rate limit (KV)        │
│  - Session cards / anim  │        │  - calls LLM              │
│  - Upgrade button        │        │  - fallback heuristic     │
│                          │        │                          │
│ Background service worker│──HTTP─▶│ /api/license/check        │
│  - chrome.tabs query     │        │  - reads KV license record│
│  - orchestrates calls    │        │                          │
│                          │        │ /api/stripe-webhook       │
│ chrome.storage.local     │        │  - marks license paid (KV)│
│  - sessions              │        │                          │
│  - license cache         │        └──────────────────────────┘
└─────────────────────────┘                    │
                                                 ▼
                                          Stripe Checkout
```

## Components

- `extension/manifest.json` — MV3 manifest, permissions: `tabs`, `storage`.
- `extension/popup/` — React app (Vite + `vite-plugin-web-extension`):
  tab count, Tidy Up button, animated session cards, upgrade CTA, license
  email entry.
- `extension/background/` — service worker: reads tabs via
  `chrome.tabs.query`, calls the Worker API, writes sessions to
  `chrome.storage.local`, caches license status.
- `worker/api/group.ts` — accepts `{ tabs: [{title, url}], licenseKey? }`,
  checks KV rate limit for free tier (1/day), calls the LLM to cluster tabs,
  returns `{ groups: [{ name, tabs }] }`. On LLM failure or timeout, falls
  back to a pure-function heuristic (group by domain).
- `worker/api/stripe-webhook.ts` — verifies Stripe signature, on
  `checkout.session.completed` writes `{ email, status: "paid" }` to KV.
  Idempotent: keyed by Stripe event id, ignores duplicates.
- `worker/api/license-check.ts` — accepts `{ email }`, returns license
  status from KV.
- `worker/lib/grouping-fallback.ts` — pure function, domain-based grouping,
  unit tested independently of the LLM call.

## Data flow

1. User opens popup → background reports current tab count.
2. Click "Tidy Up" → background collects `{title, url}` for all tabs in the
   current window → POSTs to `/api/group` with cached license key (if any).
3. Worker checks KV rate limit; free tier past its daily quota gets
   `{ error: "rate_limited" }` → popup shows inline upgrade prompt instead of
   an error.
4. Otherwise Worker calls the LLM with tab titles/URLs, parses the response
   into groups; on any LLM error/timeout, uses the domain-grouping fallback
   so the feature always returns *something*.
5. Popup animates the flat tab list collapsing into grouped cards; the
   session (groups + tab list) is saved to `chrome.storage.local`.
6. "Restore" on a session reopens all its tabs (`chrome.tabs.create` per
   tab); "Delete" removes it from storage.
7. "Upgrade" opens Stripe Checkout in a new tab. On success, the Stripe
   webhook marks the license paid in KV. Back in the extension, the user
   enters the checkout email; the extension calls `/api/license/check`,
   caches the paid status locally, and future `/api/group` calls skip the
   rate limit.

## Error handling

- LLM call fails/times out → domain-grouping fallback (never a hard error
  state for the core feature).
- Rate limit exceeded → inline upgrade prompt, not a toast/error.
- Stripe webhook retries → idempotent via Stripe event id dedupe in KV.
- Zero or one tab open → "Tidy Up" button disabled with an empty-state
  message.
- License check fails (network error) → extension keeps last cached
  license status rather than silently downgrading the user.

## Testing

- Unit tests for `grouping-fallback.ts` (pure function, easy to cover
  thoroughly).
- Worker endpoint tests with a mocked LLM client and mocked Stripe webhook
  payloads/signatures.
- Manual QA checklist: load unpacked extension in Chrome, walk free-tier
  flow (grouping, rate limit, restore/delete), walk paid flow (Checkout →
  webhook → license activation → unlimited use).

## Tech choices

- Extension UI: React + Vite, bundled via `vite-plugin-web-extension`.
- Backend: Cloudflare Workers + Workers KV (cheap, fast cold start, no
  server to manage).
- Payments: Stripe Checkout (hosted page) + webhooks.
- LLM: a low-cost/fast model called from the Worker (key stays
  server-side).

## Open questions for implementation planning

- Exact LLM provider/model to call from the Worker (cost vs. quality
  trade-off) — to be decided when writing the implementation plan.
- Visual/animation approach for the popup (CSS transitions vs. a small
  animation library) — to be decided during UI implementation.
