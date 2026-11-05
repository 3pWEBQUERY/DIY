import "server-only";
import { connect, type ClientHttp2Session } from "node:http2";
import { createPrivateKey, sign } from "node:crypto";

/**
 * Apple Push Notification service (HTTP/2, tokenbasiert mit .p8-Schlüssel).
 * Konfiguration über Umgebungsvariablen – ohne sie ist der Versand still deaktiviert:
 *   APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (PKCS#8, Zeilenumbrüche als \n), APNS_BUNDLE_ID
 */

export type ApnsEnvironment = "sandbox" | "production";
export type ApnsPayload = {
  aps: { alert?: { title?: string; body: string }; badge?: number; sound?: string; "thread-id"?: string; "mutable-content"?: 1 };
  [key: string]: unknown;
};
export type ApnsResult = { ok: true } | { ok: false; status: number; reason: string; invalidToken: boolean };

export function apnsConfigured() {
  return !!(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_BUNDLE_ID);
}

let jwt: { token: string; at: number } | null = null;

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

/** Provider-Token (ES256) bauen – getrennt für Tests. */
export function buildProviderToken(keyId: string, teamId: string, pem: string, issuedAt = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = b64url(JSON.stringify({ iss: teamId, iat: issuedAt }));
  const key = createPrivateKey(pem.replace(/\\n/g, "\n"));
  const sig = sign("sha256", Buffer.from(`${header}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${b64url(sig)}`;
}

/** Von Apple bis 60 Min. akzeptiert – wir erneuern nach 50 Min. */
function providerToken() {
  if (jwt && Date.now() - jwt.at < 50 * 60_000) return jwt.token;
  jwt = { token: buildProviderToken(process.env.APNS_KEY_ID!, process.env.APNS_TEAM_ID!, process.env.APNS_PRIVATE_KEY!), at: Date.now() };
  return jwt.token;
}

const sessions = new Map<ApnsEnvironment, ClientHttp2Session>();

function session(env: ApnsEnvironment) {
  const existing = sessions.get(env);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const s = connect(env === "production" ? "https://api.push.apple.com" : "https://api.sandbox.push.apple.com");
  s.on("error", () => sessions.delete(env));
  s.on("close", () => sessions.delete(env));
  s.setTimeout(5 * 60_000, () => s.close());
  sessions.set(env, s);
  return s;
}

export function sendApns(deviceToken: string, payload: ApnsPayload, env: ApnsEnvironment, opts: { collapseId?: string } = {}): Promise<ApnsResult> {
  return new Promise((resolve) => {
    let req;
    try {
      req = session(env).request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        authorization: `bearer ${providerToken()}`,
        "apns-topic": process.env.APNS_BUNDLE_ID!,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "apns-expiration": String(Math.floor(Date.now() / 1000) + 86_400),
        ...(opts.collapseId ? { "apns-collapse-id": opts.collapseId.slice(0, 64) } : {}),
      });
    } catch (e) {
      resolve({ ok: false, status: 0, reason: e instanceof Error ? e.message : String(e), invalidToken: false });
      return;
    }
    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.setTimeout(10_000, () => req.close());
    req.on("response", (h) => (status = Number(h[":status"]) || 0));
    req.on("data", (c: string) => (body += c));
    req.on("error", (e) => resolve({ ok: false, status, reason: e.message, invalidToken: false }));
    req.on("end", () => {
      if (status === 200) return resolve({ ok: true });
      let reason = "Unknown";
      try {
        reason = (JSON.parse(body) as { reason?: string }).reason ?? reason;
      } catch {
        /* leerer Body */
      }
      resolve({ ok: false, status, reason, invalidToken: status === 410 || reason === "BadDeviceToken" || reason === "Unregistered" || reason === "DeviceTokenNotForTopic" });
    });
    req.end(JSON.stringify(payload));
  });
}
