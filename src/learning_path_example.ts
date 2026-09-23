import { randomUUID } from "node:crypto";
import { SessionLedger } from "./session_ledger.js";

const ledger = new SessionLedger();
ledger.enroll("lesson-checkout-session", "first-refresh-token", "classroom-laptop");

const result = ledger.assessPayment({
  event_id: randomUUID(),
  session_id: "lesson-checkout-session",
  amount: 12_500,
  currency: "USD",
  device_fingerprint: "classroom-laptop"
});

console.log(JSON.stringify(result, null, 2));
