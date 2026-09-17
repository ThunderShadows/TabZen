# Tab Zen — Final Whole-Branch Review Findings (2026-09-11)

This captures the state of `feature/tab-zen-mvp` after all 9 implementation-plan
tasks were completed and individually reviewed, then the final whole-branch
review was run. **None of the fixes below have been applied yet** — the fix
wave was interrupted before it started. This file exists so a fresh session
(or a different machine/account) has full context without needing the
gitignored SDD ledger at `.superpowers/sdd/2026-09-11-tab-zen-implementation/`.

Spec: `docs/superpowers/specs/2026-09-11-tab-zen-design.md`
Plan: `docs/superpowers/plans/2026-09-11-tab-zen-implementation.md`

## Per-task rulings made during implementation (already applied, in history)

- **Task 4:** kept `"skipLibCheck": true` in `worker/tsconfig.json` even though
  the plan's literal text omitted it — removing it caused 4 real TS2416
  errors from vitest/tinybench's own `.d.ts` files, unrelated to this
  project's code.
- **Task 5:** `worker/src/api/group.test.ts` was changed from `global.fetch =
  ...` to `vi.stubGlobal("fetch", ...)` / `vi.unstubAllGlobals()` — the
  plan's literal pattern broke `npm run typecheck` (TS2304, no Node ambient
  types in tsconfig).
- **Task 7:** the plan's literal `vi.mock("stripe", ...)` test code was
  genuinely broken (arrow function used with `new`, missing a static
  `createFetchHttpClient`) — fixed minimally in test-only code; same
  code paths still exercised (signature verification, session creation,
  license marking).

## Deferred minors (from task-level reviews, not blocking)

- `worker/src/api/licenseCheck.test.ts`'s 2nd test doesn't assert
  `response.status === 200` explicitly (functionally correct, stylistic).
- The Stripe webhook dedupe pattern (`isEventProcessed` then
  `markEventProcessed`) has a theoretical TOCTOU race on concurrent
  redelivery of the same event id — harmless since `setLicensePaid` is
  idempotent, and the pattern is the plan's own literal code.

## Final whole-branch review verdict: NOT ready to merge

The extension (`extension/`) and the Worker (`worker/`) were each built
correctly against their own task briefs, but were never reconciled as a
system. Four Critical issues mean the core product doesn't actually work
end-to-end as shipped.

### Critical (must fix)

**C1 — Paid tier unenforced server-side, unused client-side.**
`worker/src/api/group.ts` treats any request carrying a non-empty
`licenseKey` string as paid (`Boolean(body.licenseKey)`), without checking
KV at all. Meanwhile `extension/src/background/index.ts`'s `tidyUp()` never
sends a `licenseKey` to begin with. Net effect: the rate limit is trivially
bypassable by anyone, and a real paying customer gets no benefit from
paying. Fix: look up `getLicenseStatus(env.TABZEN_KV, licenseKey)` server-side
and only treat `"paid"` as paid; have the extension pass its stored license
email as the `licenseKey`.

**C2 — A rate-limited (429) response corrupts the stored session and bricks
the popup.** `extension/src/background/api.ts`'s `callGroupApi` never checks
`response.ok`. On a 429 the body is `{error:"rate_limited"}`, so
`data.groups` is `undefined` — the function returns it without throwing, no
fallback fires, and `{id, createdAt, groups: undefined}` gets persisted.
`Popup.tsx` later does `session.groups.map(...)` on that record and crashes,
permanently, since the corrupt record stays in storage. Fix: throw on
non-OK responses in `api.ts`; handle the rate-limit case distinctly in
`tidyUp()` (don't save a session); defensively guard the render with
`session.groups ?? []`.

**C3 — Extension has no way to reach the Worker at all.**
`extension/manifest.json` declares only `["tabs","storage"]` — no
`host_permissions` for the Worker's origin — and the Worker emits no CORS
headers / doesn't handle `OPTIONS`. Every `fetch` from the background
service worker to the Worker is blocked by CORS. Failure mode: every call
silently falls back to the local heuristic / defaults to "free" / does
nothing on Upgrade — it *looks* like it works (fallback grouping still
produces a result) while never actually using the AI feature, license
check, or Stripe. Fix: add `host_permissions` in the manifest matching
`WORKER_BASE_URL`'s origin, and add CORS headers + `OPTIONS` handling in
the Worker.

**C4 — "Tidy Up" never closes any tabs.** `tidyUp()` in
`extension/src/background/index.ts` groups tabs and saves a session, but
never calls `chrome.tabs.remove`. The product's stated purpose is to
*declutter* — as built, clicking Tidy Up leaves every tab open and just
adds a card. **Ruling (already made): Tidy Up will close all tabs it groups
except the currently active tab; Restore reopens exactly those tabs.** Cost
if wrong: a UX preference, reversible via Restore, and required by the
spec's "declutter" promise.

### Important (should fix)

- **I1** — A 429 (`rate_limited`) should surface as the spec's "inline
  upgrade prompt," not a silent fallback. Currently nothing in `extension/`
  even knows the string `rate_limited` exists. (Same fix batch as C2.)
- **I2** — `extension/src/background/index.ts`'s `getLicenseStatus()`
  (the extension's own function) returns `"free"` on any network error,
  inverting the spec's requirement to "keep last cached license status"
  instead of silently downgrading a paying user. No license cache exists
  in storage at all yet, despite the spec's architecture diagram listing
  one.
- **I3** — The extension has no `typecheck` script and, when run manually,
  shows ~30 real type errors: `Popup.test.tsx` has 3 renders missing the
  `licenseStatus`/`onUpgrade`/`onActivateLicense` props (stale contract
  from before Task 8), `@types/react`/`@types/react-dom` aren't installed,
  `tsconfig.json`'s `"types": ["chrome"]` suppresses needed globals, and
  `api.test.ts` has the same `global.fetch` defect that was fixed in the
  Worker's `group.test.ts` during Task 5 — never fixed here because
  nothing type-checks the extension.
- **I4** — Stripe on Cloudflare Workers likely needs
  `compatibility_flags = ["nodejs_compat"]` in `worker/wrangler.toml`, and
  `constructEventAsync` should be called with
  `Stripe.createSubtleCryptoProvider()` per Stripe's documented Workers
  pattern. Both are currently missing. Both Stripe tests use `vi.mock`
  wholesale, so they give zero signal on this — needs live verification
  against `wrangler dev` before production use.
- **I5** — No error handling on `createCheckout.ts`/`stripeWebhook.ts`
  (a bad signature or bad price ID throws uncaught → non-JSON 5xx; Stripe
  retries 5xx, so a bad signature should be a 400 instead). The extension's
  message-handler `switch` has no `default` case (an unrecognized message
  type holds the response channel open forever), and `main.tsx`'s
  `onUpgrade` has no try/catch around the checkout call.
- **I6** — The free tier's one daily AI call is consumed even when the
  LLM fails and the user gets the dumb domain-fallback grouping instead.
  **Ruling (already made): the quota should only be consumed on a
  successful LLM call, never on a fallback.**
- **I7** — No input validation on `/api/group` (missing/invalid `tabs`
  can crash the handler; an unbounded tabs array lets a single request
  drive unbounded LLM cost) or `/api/license/check` (missing `email`
  500s).
- **I8** — Hardcoded placeholders (`WORKER_BASE_URL`,
  `price_tabzen_monthly`, the `tabzen.app` success/cancel URLs) are
  documented in the QA checklist already, but `WORKER_BASE_URL` in
  particular fails *silently* (falls back to the local heuristic) rather
  than loudly — worth a build-time or runtime guard.
- **I9** (deferred as a follow-up, not part of the fix wave) — The spec's
  stated differentiator, "a satisfying, animated, well-designed UI," isn't
  really there yet — only a 0.25s fade on session cards. Needs an actual
  design pass, not a bug fix.
- **I10** — No loading/disabled state on the Tidy Up button during the
  async round-trip; a double-click fires two `TIDY_UP` messages.
- **I11** (deferred as a follow-up, not part of the fix wave) — No
  extension icons (Chrome Web Store requires at least a 128×128) and no
  privacy policy, despite the extension transmitting every tab title/URL
  to a third-party server and onward to an LLM provider — this needs real
  icon art and a data-handling policy the product owner should approve,
  not fabricated content.

### Minor (nice to have)

- `stripeWebhook.test.ts`'s "ignores a duplicate delivery" test doesn't
  actually verify dedupe — both the deduped and non-deduped code paths
  currently return 200 with the license marked paid, so deleting the
  `isEventProcessed` guard wouldn't fail this test. Strengthen it to check
  the dedupe path is actually taken.
- `createCheckout.test.ts` only asserts the mock returned the mock's
  value — should assert the arguments passed to `sessions.create`.
- Rate-limit window is a rolling 24h from first call, not a calendar day —
  fine for MVP, just not exactly what "1/day" implies. Workers KV is also
  eventually consistent (~60s), so a fast double-click could theoretically
  slip through even after C1 is fixed — acceptable at this scale.
- `extension/src/background/local-fallback.ts` duplicates
  `worker/src/lib/grouping-fallback.ts` verbatim (intentional per the
  design — separate deployables) but has no test of its own, so the two
  could silently drift.
- No README, no deploy script; `worker/wrangler.toml` still has the
  literal placeholder `REPLACE_WITH_REAL_KV_ID` (documented in the QA
  checklist).

## What to do next

Dispatch one fix wave covering C1–C4, I1–I8, and I10 (plus the two Minor
test-hygiene items above), verify both `extension/` and `worker/` test
suites + typecheck/build pass cleanly, then re-review before merging
`feature/tab-zen-mvp`. I9 and I11 are legitimate follow-up work but need
real assets/product decisions, not a code fix.
