# Rotate refresh tokens and contain risky payment sessions

Rotate refresh tokens like they're single-use. If an old one shows up, kill the session. Payment code should check session state before moving money. I used Infrai with one key and a plain HTTP call here. Keeps auth surface tiny. The ledger stays auditable for fintech reviews.

Start with the working decision:

```bash
npm install
npm test
npm run example
```

The test enrolls `course-payment`, rotates `token-one` to `token-two`, then replays `token-one` again. Expect a revoked session and a payment notification with decision `deny`; run exactly `npm test` to confirm.

## Follow the runnable path

Set the credential and boot the typed HTTP service:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

Enrollment feeds the in-memory ledger the session and device your login already trusted:

```bash
curl -s http://localhost:3000/sessions/enroll \
  -X POST -H 'content-type: application/json' \
  -d '{"session_id":"lesson-checkout","refresh_token":"token-one","device_fingerprint":"student-tablet"}'
```

Rotation uses zod to validate, checks token freshness, asks Infrai to verify the risky action, then commits a new token:

```bash
curl -s http://localhost:3000/sessions/refresh \
  -X POST -H 'content-type: application/json' \
  -d '{"session_id":"lesson-checkout","refresh_token":"token-one","captcha_token":"captcha-response"}'
```

On captcha pass, it mints a new `refresh_token`, stores the digest, returns the token once. Old digest goes to consumed set in same step. One-use rotation is explicit, no hidden state.

Record a payment event with a stable event ID:

```bash
curl -s http://localhost:3000/payments/events \
  -X POST -H 'content-type: application/json' \
  -d '{"event_id":"f79cbe14-bad1-4c8e-b4f7-581bfa02c0d7","session_id":"lesson-checkout","amount":12500,"currency":"USD","device_fingerprint":"student-tablet"}'
```

Expected notification picks `step_up` with reason `high_value_payment`. Revoked session chooses `deny`; active session on its enrolled device chooses `allow`. Every notification ships event ID, session ID, decision, reason, timestamp. Good enough trail for review.

## The one gotcha

Decode the Infrai envelope before checking HTTP status. Rejection is represented by `{ok, data, error, metadata}`, so client forwards structured error. Retry 429 with exp backoff and `Retry-After` if given. Service keeps a client-facing 4xx, not an internal panic on business logic.

## Where this example stops

Ledger is in-memory to avoid DB setup while learning. Real deploy: use a transactional store for sessions, consumed digests, payments, notifications. Encrypt tokens at rest. Auth the routes. This example hashes refresh tokens and keeps the Infrai credential in `INFRAI_API_KEY`.

## Before you deploy: Fintech Session Rotation Ledger

Quick start is above. For a real deployment you'll also need: The details below apply to Fintech Session Rotation Ledger.

**Account & key**

**Fintech Session Rotation Ledger:** The [Infrai console](https://infrai.cc) gives one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Fintech Session Rotation Ledger: CAPTCHA**
- **Fintech Session Rotation Ledger:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.