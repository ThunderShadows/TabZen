# Tab Zen — Manual QA Checklist

## One-time setup (outside this repo)
- [ ] Create a Cloudflare Workers KV namespace, update `worker/wrangler.toml`'s
      `id` with the real namespace id.
- [ ] Set Worker secrets: `wrangler secret put ANTHROPIC_API_KEY`,
      `wrangler secret put STRIPE_SECRET_KEY`, `wrangler secret put STRIPE_WEBHOOK_SECRET`.
- [ ] Create a $4-6/mo recurring Price in the Stripe dashboard; replace the
      placeholder `price_tabzen_monthly` in `worker/src/api/createCheckout.ts`.
- [ ] Deploy the worker: `cd worker && npx wrangler deploy`; update
      `WORKER_BASE_URL` in `extension/src/background/api.ts` to the deployed URL.
- [ ] Register the Stripe webhook endpoint (`/api/stripe-webhook`) in the
      Stripe dashboard pointed at the deployed Worker URL.

## Loading the unpacked extension
- [ ] `cd extension && npm run build`
- [ ] Open `chrome://extensions`, enable Developer mode, "Load unpacked",
      select `extension/dist`.
- [ ] Confirm the Tab Zen icon appears in the toolbar.

## Free-tier flow
- [ ] Open 3+ tabs, click the Tab Zen icon — tab count shown matches.
- [ ] With 0 or 1 tab open, confirm "Tidy Up" is disabled.
- [ ] Click "Tidy Up" — tabs animate into named session cards.
- [ ] Click "Tidy Up" a second time same day — confirm the inline upgrade
      prompt appears instead of a new AI grouping (rate limit hit).
- [ ] Click "Restore" on a saved session — all its tabs reopen.
- [ ] Click "Delete" on a saved session — it disappears from the list.

## Paid flow
- [ ] Click "Upgrade" — Stripe Checkout opens in a new tab.
- [ ] Complete checkout with a Stripe test card.
- [ ] Back in the extension, enter the checkout email and click "Activate".
- [ ] Confirm the Upgrade block disappears (license shows as paid).
- [ ] Click "Tidy Up" multiple times in the same day — confirm no rate
      limit prompt appears for the paid account.

## Resilience
- [ ] Temporarily break `ANTHROPIC_API_KEY` (wrong value) and redeploy —
      confirm "Tidy Up" still groups tabs (via the domain fallback) instead
      of failing.
