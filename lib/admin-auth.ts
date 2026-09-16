import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
function scrypt(password: string, salt: Buffer, length: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCallback(password, salt, length, options, (error, derived) => error ? reject(error) : resolve(derived)));
}
export const ADMIN_SESSION_COOKIE = "vcobs_admin_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const HASH_LENGTH = 64, MAX_LOGIN_ATTEMPTS = 5, MAX_GLOBAL_LOGIN_ATTEMPTS = 50, LOGIN_WINDOW_MS = 15 * 60 * 1000;
const attempts = new Map<string, { count: number; resetAt: number }>();
let globalAttempts: { count: number; resetAt: number } | undefined;
type PasswordHash = { cost: number; blockSize: number; parallelization: number; salt: Buffer; hash: Buffer };
function decodeBase64(value: string): Buffer | null { if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null; const decoded = Buffer.from(value, "base64"); return decoded.length ? decoded : null; }
function parsePasswordHash(value: string | undefined): PasswordHash | null {
  const match = value && /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([^$]+)\$([^$]+)$/.exec(value); if (!match) return null;
  const [, costText, blockSizeText, parallelizationText, saltText, hashText] = match; const cost = Number(costText), blockSize = Number(blockSizeText), parallelization = Number(parallelizationText);
  if (!Number.isInteger(cost) || cost < 16384 || cost > 262144 || (cost & (cost - 1)) !== 0 || !Number.isInteger(blockSize) || blockSize < 1 || blockSize > 32 || !Number.isInteger(parallelization) || parallelization < 1 || parallelization > 16) return null;
  const salt = decodeBase64(saltText), hash = decodeBase64(hashText); if (!salt || salt.length < 16 || !hash || hash.length !== HASH_LENGTH) return null;
  return { cost, blockSize, parallelization, salt, hash };
}
function sessionSecret(): Buffer | null { const value = process.env.VCOBS_ADMIN_SESSION_SECRET; return value && Buffer.byteLength(value, "utf8") >= 32 ? Buffer.from(value, "utf8") : null; }
export function adminAuthConfigured(): boolean { return parsePasswordHash(process.env.VCOBS_ADMIN_PASSWORD_HASH) !== null && sessionSecret() !== null; }
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const configured = parsePasswordHash(process.env.VCOBS_ADMIN_PASSWORD_HASH); if (!configured || !sessionSecret()) return false;
  const derived = Buffer.from(await scrypt(password, configured.salt, HASH_LENGTH, { N: configured.cost, r: configured.blockSize, p: configured.parallelization, maxmem: 128 * configured.cost * configured.blockSize + 1024 * 1024 }));
  return timingSafeEqual(derived, configured.hash);
}
function sign(value: string, secret: Buffer): string { return createHmac("sha256", secret).update(value).digest("base64url"); }
export function createAdminSession(now = Date.now()): string | null { const secret = sessionSecret(); if (!secret) return null; const expiresAt = Math.floor(now / 1000) + SESSION_TTL_SECONDS; const payload = `v1.${expiresAt}.${randomBytes(18).toString("base64url")}`; return `${payload}.${sign(payload, secret)}`; }
export function validateAdminSession(token: string | undefined, now = Date.now()): boolean {
  const secret = sessionSecret(); if (!secret || !token) return false; const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || !/^\d+$/.test(parts[1]) || !/^[A-Za-z0-9_-]{20,}$/.test(parts[2]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[3])) return false;
  const expiresAt = Number(parts[1]); if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  const expected = Buffer.from(sign(parts.slice(0, 3).join("."), secret)), received = Buffer.from(parts[3]); return expected.length === received.length && timingSafeEqual(expected, received);
}
export function adminSessionCookie(value: string) { return { name: ADMIN_SESSION_COOKIE, value, httpOnly: true, sameSite: "strict" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: SESSION_TTL_SECONDS }; }
export function expiredAdminSessionCookie() { return { ...adminSessionCookie(""), maxAge: 0 }; }
function trustedProxyHeaders(): boolean { return process.env.VCOBS_TRUST_PROXY_HEADERS === "true"; }
function requestOrigin(request: Request): string | null {
  try {
    if (!trustedProxyHeaders()) return new URL(request.url).origin;
    const proto = request.headers.get("x-forwarded-proto"), host = request.headers.get("x-forwarded-host");
    if (!proto || !host || !/^(https?|HTTPS?)$/.test(proto) || host.includes(",") || /[\s/\\@]/.test(host)) return null;
    return new URL(`${proto.toLowerCase()}://${host}`).origin;
  } catch { return null; }
}
export function originIsSameSite(request: Request): boolean { const origin = request.headers.get("origin"), expected = requestOrigin(request); if (!origin || !expected) return false; try { return new URL(origin).origin === expected; } catch { return false; } }
function activeCount(entry: { count: number; resetAt: number } | undefined, now: number): number { return entry && entry.resetAt > now ? entry.count : 0; }
export function loginAllowed(clientId: string, now = Date.now()): boolean { return activeCount(attempts.get(clientId), now) < MAX_LOGIN_ATTEMPTS && activeCount(globalAttempts, now) < MAX_GLOBAL_LOGIN_ATTEMPTS; }
export function recordFailedLogin(clientId: string, now = Date.now()): void { const clientAttempt = attempts.get(clientId), resetAt = clientAttempt && clientAttempt.resetAt > now ? clientAttempt.resetAt : now + LOGIN_WINDOW_MS; attempts.set(clientId, { count: activeCount(clientAttempt, now) + 1, resetAt }); const globalResetAt = globalAttempts?.resetAt && globalAttempts.resetAt > now ? globalAttempts.resetAt : now + LOGIN_WINDOW_MS; globalAttempts = { count: activeCount(globalAttempts, now) + 1, resetAt: globalResetAt }; }
export function clearLoginAttempts(clientId: string): void { attempts.delete(clientId); }
export function loginClientId(request: Request): string { const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(); return trustedProxyHeaders() && forwarded && isIP(forwarded) ? `proxy:${forwarded}` : "shared"; }
export function resetLoginRateLimitsForTests(): void { attempts.clear(); globalAttempts = undefined; }
