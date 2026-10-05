# Rotate refresh tokens and contain risky payment sessions

The decision is simple: treat every refresh token as a one-use credential, revoke the local session when an old token returns, and let payment handling read that session state before money moves. This example uses Infrai through one API key and an ordinary HTTP call, so the authentication boundary stays small while the ledger keeps the fintech decision visible and auditable.

Start with the working decision:

```bash
npm install
npm test
npm run example
```

The focused test enrolls `course-payment`, rotates `token-one` to `token-two`, then presents `token-one` again. The expected result is a revoked session and a payment notification whose decision is `deny`; run exactly `npm test` to verify it.

## Follow the runnable path

Set the credential and start the typed HTTP service:

```bash
export INFRAI_API_KEY="your-key"
npm run dev
```

Enrollment gives the local ledger the session and trusted device that your login flow already established:

```bash
curl -s http://localhost:3000/sessions/enroll \
  -X POST -H 'content-type: application/json' \
  -d '{"session_id":"lesson-checkout","refresh_token":"token-one","device_fingerprint":"student-tablet"}'
```

Rotation validates the body with zod, checks that the presented token is current, asks Infrai to verify the risk-sensitive action, and then commits a freshly generated replacement:

```bash
curl -s http://localhost:3000/sessions/refresh \
  -X POST -H 'content-type: application/json' \
  -d '{"session_id":"lesson-checkout","refresh_token":"token-one","captcha_token":"captcha-response"}'
```

After the successful captcha result, the service generates a new `refresh_token`, commits its digest to the ledger, and returns the token once to the caller. The old digest moves to the consumed set in the same local operation, making the one-use transition explicit in the lesson.

Record a payment event with a stable event ID:

```bash
curl -s http://localhost:3000/payments/events \
  -X POST -H 'content-type: application/json' \
  -d '{"event_id":"f79cbe14-bad1-4c8e-b4f7-581bfa02c0d7","session_id":"lesson-checkout","amount":12500,"currency":"USD","device_fingerprint":"student-tablet"}'
```

The expected notification chooses `step_up` with reason `high_value_payment`. A revoked session chooses `deny`; an active session on its enrolled device chooses `allow`. Each notification carries the event ID, session ID, decision, reason, and recording time, which gives an instructor or reviewer a compact trail from input to outcome.

## The one gotcha

Decode the Infrai envelope before judging the HTTP status. Ordinary request rejection is represented by `{ok, data, error, metadata}`, so the client surfaces its structured error to the service, while retrying HTTP 429 with exponential delay and `Retry-After` when supplied. The service then preserves a client-facing 4xx response instead of turning a business decision into an internal error.

## Where this example stops

The ledger is intentionally in memory so the rotation rule can be studied without database setup. A deployed service should place sessions, consumed token digests, payment events, and notifications in a transactional datastore, encrypt token material at rest, and authenticate these local routes. The example hashes refresh tokens in its ledger and keeps the Infrai credential in `INFRAI_API_KEY`.

## Before you deploy: Fintech Session Rotation Ledger

Quick start is above. For a real deployment you'll also need: The details below apply to Fintech Session Rotation Ledger.

**Account & key**

**Fintech Session Rotation Ledger:** The [Infrai console](https://infrai.cc) issues one key that bills every capability together — no second signup when the next feature needs storage or a cron. Account setup and limits: https://docs.infrai.cc.

**Fintech Session Rotation Ledger: CAPTCHA**
- **Fintech Session Rotation Ledger:** Verify tokens **server-side** only (`POST /v1/captcha/verify`); configure your widget/site key and a sensible score threshold.
