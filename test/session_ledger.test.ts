import assert from "node:assert/strict";
import test from "node:test";
import { SessionDecisionError, SessionLedger } from "../src/session_ledger.js";
import { InfraiCaptchaClient } from "../src/infrai_refresh_client.js";

test("captcha verification sends both required fields", async () => {
  let sent: unknown;
  const fetcher = (async (_url: string, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ ok: true, data: { valid: true } }), { status: 200 });
  }) as typeof fetch;

  await new InfraiCaptchaClient("test-key", fetcher).verify("widget-123", "captcha-response");
  assert.deepEqual(sent, {
    widget_record_id: "widget-123",
    token: "captcha-response",
    action: "session_refresh"
  });
});

test("reusing a rotated token revokes its session and denies the next payment", () => {
  const ledger = new SessionLedger();
  ledger.enroll("course-payment", "token-one", "student-tablet");
  ledger.assertRefreshAllowed("course-payment", "token-one");
  ledger.recordRotation("course-payment", "token-one", "token-two");

  assert.throws(
    () => ledger.assertRefreshAllowed("course-payment", "token-one"),
    (error) => error instanceof SessionDecisionError && error.reason === "refresh_token_reuse"
  );

  const notice = ledger.assessPayment({
    event_id: "f79cbe14-bad1-4c8e-b4f7-581bfa02c0d7",
    session_id: "course-payment",
    amount: 49,
    currency: "USD",
    device_fingerprint: "student-tablet"
  });
  assert.equal(notice.decision, "deny");
  assert.equal(notice.reason, "inactive_session");
  assert.equal(ledger.auditTrail().length, 1);
});
