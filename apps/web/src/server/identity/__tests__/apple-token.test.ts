import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, createPublicKey, generateKeyPairSync, sign, verify } from "node:crypto";

process.env.SESSION_SECRET = "x".repeat(40);

// Apple-Signaturschlüssel (RS256) und Sign-in-with-Apple-Schlüssel des Teams (ES256, .p8)
const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...rsa.publicKey.export({ format: "jwk" }), kid: "k1", alg: "RS256", use: "sig" };
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const p8 = ec.privateKey.export({ format: "pem", type: "pkcs8" }).toString();

vi.mock("@/server/env", () => ({ env: () => ({ APPLE_TEAM_ID: "TEAM123", APPLE_KEY_ID: "KEY123", APPLE_PRIVATE_KEY: p8, APPLE_CLIENT_ID: "ch.werkuno.web" }) }));
type Row = { id: string; userId: string; provider: string; refreshToken: string | null; tokenClientId: string | null };
const rows: Row[] = [];
vi.mock("@/server/db", () => ({
  db: {
    authAccount: {
      findMany: async ({ where }: { where: { userId: string } }) => rows.filter((r) => r.userId === where.userId && r.refreshToken),
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) if (rows[i]!.userId === where.userId) rows.splice(i, 1);
        return { count: before - rows.length };
      },
    },
  },
}));

const { appleClientSecret, nonceMatches, revokeAppleTokensForUser, verifyAppleIdentityToken } = await import("../apple-token");
const { encryptSecret } = await import("@/server/auth/totp");

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
function idToken(claims: Record<string, unknown>) {
  const input = `${b64({ alg: "RS256", kid: "k1" })}.${b64(claims)}`;
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), rsa.privateKey).toString("base64url")}`;
}
const now = () => Math.floor(Date.now() / 1000);
const base = () => ({ iss: "https://appleid.apple.com", aud: "ch.werkuno.app", sub: "apple-sub-1", iat: now(), exp: now() + 600 });

const fetchMock = vi.fn(async (url: string | URL, _init?: RequestInit) => {
  if (String(url).endsWith("/auth/keys")) return Response.json({ keys: [jwk] });
  return new Response("{}", { status: 200 });
});
vi.stubGlobal("fetch", fetchMock);
afterEach(() => fetchMock.mockClear());

describe("Apple: Nonce", () => {
  it("akzeptiert nur SHA-256 (hex) der Roh-Nonce", () => {
    const raw = "a1b2c3-zufall";
    const hashed = createHash("sha256").update(raw).digest("hex");
    expect(nonceMatches(raw, hashed)).toBe(true);
    expect(nonceMatches(raw, hashed.toUpperCase())).toBe(true);
    expect(nonceMatches(raw, raw)).toBe(false);
    expect(nonceMatches(raw, undefined)).toBe(false);
    expect(nonceMatches("", hashed)).toBe(false);
  });

  it("identityToken: ohne Nonce wie bisher, mit Nonce nur bei passendem Claim", async () => {
    const raw = "nonce-123";
    const hashed = createHash("sha256").update(raw).digest("hex");
    const t = idToken({ ...base(), nonce: hashed });
    await expect(verifyAppleIdentityToken(t, { audience: "ch.werkuno.app" })).resolves.toMatchObject({ sub: "apple-sub-1" });
    await expect(verifyAppleIdentityToken(t, { audience: "ch.werkuno.app", nonce: raw })).resolves.toMatchObject({ sub: "apple-sub-1" });
    await expect(verifyAppleIdentityToken(t, { audience: "ch.werkuno.app", nonce: "andere" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(verifyAppleIdentityToken(idToken(base()), { audience: "ch.werkuno.app", nonce: raw })).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("lehnt fremde Audience und abgelaufene Tokens ab", async () => {
    await expect(verifyAppleIdentityToken(idToken({ ...base(), aud: "x" }), { audience: "ch.werkuno.app" })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(verifyAppleIdentityToken(idToken({ ...base(), exp: now() - 10 }), { audience: "ch.werkuno.app" })).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("Apple: Client-Secret", () => {
  it("ist ein gültiges ES256-JWT mit sub = Client-ID", () => {
    const jwt = appleClientSecret("ch.werkuno.app");
    const [h, p, s] = jwt.split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(h, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(p, "base64url").toString());
    expect(claims).toMatchObject({ iss: "TEAM123", sub: "ch.werkuno.app", aud: "https://appleid.apple.com" });
    expect(claims.exp - claims.iat).toBe(300);
    const ok = verify("sha256", Buffer.from(`${h}.${p}`), { key: createPublicKey(p8), dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
  });
});

describe("Apple: Widerruf bei Kontolöschung", () => {
  it("widerruft gespeicherte Tokens mit der passenden Client-ID und entfernt die Verknüpfungen", async () => {
    rows.push(
      { id: "a1", userId: "u1", provider: "apple-revoke", refreshToken: encryptSecret("rt-app"), tokenClientId: "ch.werkuno.app" },
      { id: "a2", userId: "u1", provider: "apple", refreshToken: encryptSecret("rt-web"), tokenClientId: null },
      { id: "a3", userId: "u2", provider: "apple", refreshToken: encryptSecret("fremd"), tokenClientId: "ch.werkuno.app" },
    );
    const r = await revokeAppleTokensForUser("u1");
    expect(r).toEqual({ revoked: 2, total: 2 });
    const bodies = fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/auth/revoke")).map(([, init]) => new URLSearchParams(String(init?.body)));
    expect(bodies.map((b) => [b.get("token"), b.get("client_id"), b.get("token_type_hint")])).toEqual([
      ["rt-app", "ch.werkuno.app", "refresh_token"],
      ["rt-web", "ch.werkuno.web", "refresh_token"],
    ]);
    expect(rows.map((x) => x.id)).toEqual(["a3"]);
  });

  it("Fehler bei Apple brechen nicht ab (best effort)", async () => {
    rows.push({ id: "b1", userId: "u3", provider: "apple-revoke", refreshToken: encryptSecret("rt"), tokenClientId: "ch.werkuno.app" });
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: "invalid_client" }), { status: 400 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(revokeAppleTokensForUser("u3")).resolves.toEqual({ revoked: 0, total: 1 });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
