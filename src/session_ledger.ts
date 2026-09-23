import { createHash, randomUUID } from "node:crypto";

export type PaymentEvent = {
  event_id: string;
  session_id: string;
  amount: number;
  currency: string;
  device_fingerprint: string;
};

export type AuditNotification = {
  notification_id: string;
  event_id: string;
  session_id: string;
  decision: "allow" | "step_up" | "deny";
  reason: string;
  recorded_at: string;
};

type Session = {
  tokenDigest: string;
  trustedDevice: string;
  revokedAt?: string;
};

export class SessionLedger {
  private readonly sessions = new Map<string, Session>();
  private readonly consumedTokens = new Set<string>();
  private readonly notifications: AuditNotification[] = [];

  enroll(sessionId: string, refreshToken: string, trustedDevice: string): void {
    this.sessions.set(sessionId, { tokenDigest: digest(refreshToken), trustedDevice });
  }

  assertRefreshAllowed(sessionId: string, refreshToken: string): void {
    const session = this.sessions.get(sessionId);
    const candidate = digest(refreshToken);
    if (!session || session.revokedAt) throw new SessionDecisionError("session_revoked", 403);
    if (this.consumedTokens.has(candidate) || session.tokenDigest !== candidate) {
      this.revoke(sessionId);
      throw new SessionDecisionError("refresh_token_reuse", 401);
    }
  }

  recordRotation(sessionId: string, oldToken: string, newToken: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new SessionDecisionError("session_revoked", 403);
    this.consumedTokens.add(digest(oldToken));
    session.tokenDigest = digest(newToken);
  }

  revoke(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.revokedAt = new Date().toISOString();
    return true;
  }

  assessPayment(event: PaymentEvent): AuditNotification {
    const session = this.sessions.get(event.session_id);
    let decision: AuditNotification["decision"] = "allow";
    let reason = "trusted_session";

    if (!session || session.revokedAt) {
      decision = "deny";
      reason = "inactive_session";
    } else if (event.amount >= 10_000 || event.device_fingerprint !== session.trustedDevice) {
      decision = "step_up";
      reason = event.amount >= 10_000 ? "high_value_payment" : "new_device";
    }

    const notification = {
      notification_id: randomUUID(),
      event_id: event.event_id,
      session_id: event.session_id,
      decision,
      reason,
      recorded_at: new Date().toISOString()
    };
    this.notifications.push(notification);
    return notification;
  }

  auditTrail(): readonly AuditNotification[] {
    return this.notifications;
  }
}

export class SessionDecisionError extends Error {
  readonly reason: string;
  readonly status: number;

  constructor(reason: string, status: number) {
    super(reason);
    this.reason = reason;
    this.status = status;
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
