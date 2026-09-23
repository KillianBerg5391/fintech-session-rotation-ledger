import { createServer, type ServerResponse } from "node:http";
import { randomBytes } from "node:crypto";
import { z, ZodError } from "zod";
import { InfraiCaptchaClient, InfraiError } from "./infrai_refresh_client.js";
import { SessionDecisionError, SessionLedger } from "./session_ledger.js";

const enrollBody = z.object({
  session_id: z.string().min(1),
  refresh_token: z.string().min(1),
  device_fingerprint: z.string().min(1)
}).strict();
const refreshBody = z.object({
  session_id: z.string().min(1),
  refresh_token: z.string().min(1),
  widget_record_id: z.string().min(1),
  captcha_token: z.string().min(1)
}).strict();
const paymentBody = z.object({
  event_id: z.string().uuid(),
  session_id: z.string().min(1),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  device_fingerprint: z.string().min(1)
}).strict();

export function buildService(apiKey: string, fetcher: typeof fetch = fetch) {
  const ledger = new SessionLedger();
  const captcha = new InfraiCaptchaClient(apiKey, fetcher);

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "POST" && url.pathname === "/sessions/enroll") {
        const body = enrollBody.parse(await readJson(request));
        ledger.enroll(body.session_id, body.refresh_token, body.device_fingerprint);
        return json(response, 201, { session_id: body.session_id, state: "active" });
      }
      if (request.method === "POST" && url.pathname === "/sessions/refresh") {
        const body = refreshBody.parse(await readJson(request));
        ledger.assertRefreshAllowed(body.session_id, body.refresh_token);
        await captcha.verify(body.widget_record_id, body.captcha_token);
        const refreshToken = randomBytes(32).toString("base64url");
        ledger.recordRotation(body.session_id, body.refresh_token, refreshToken);
        return json(response, 200, { session_id: body.session_id, state: "rotated", refresh_token: refreshToken });
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/sessions/")) {
        const sessionId = decodeURIComponent(url.pathname.slice("/sessions/".length));
        return json(response, ledger.revoke(sessionId) ? 200 : 404, { session_id: sessionId, state: "revoked" });
      }
      if (request.method === "POST" && url.pathname === "/payments/events") {
        const event = paymentBody.parse(await readJson(request));
        return json(response, 200, ledger.assessPayment(event));
      }
      return json(response, 404, { error: "route_not_found" });
    } catch (error) {
      if (error instanceof ZodError) return json(response, 400, { error: "invalid_request", issues: error.issues });
      if (error instanceof SessionDecisionError) return json(response, error.status, { error: error.reason });
      if (error instanceof InfraiError) return json(response, clientStatus(error.status), { error: error.code });
      return json(response, 500, { error: "service_error" });
    }
  });
}

async function readJson(request: AsyncIterable<Uint8Array>): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function clientStatus(status: number): number {
  return status >= 400 && status < 500 ? status : 502;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

if (process.argv[1]?.endsWith("fintech_session_service.ts")) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");
  buildService(apiKey).listen(3000, () => console.log("Fintech session service listening on http://localhost:3000"));
}
