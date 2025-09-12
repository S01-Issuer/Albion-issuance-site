import { env } from "$env/dynamic/private";
import crypto from "crypto";

export const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

export function validateCredentials(
  username: string,
  password: string,
): boolean {
  const expectedUser = env.BASIC_AUTH_USER || "";
  const expectedPass = env.BASIC_AUTH_PASS || "";

  if (!expectedUser || !expectedPass) {
    console.warn("[auth] Missing BASIC_AUTH_USER or BASIC_AUTH_PASS env vars");
    return false;
  }

  return username === expectedUser && password === expectedPass;
}

export function createSessionToken(timestamp: number): string {
  const secret =
    env.AUTH_SECRET || "albion-default-secret-change-in-production";
  const data = `${timestamp}:${secret}`;
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function verifySessionToken(token: string, timestamp: number): boolean {
  if (!token || !Number.isFinite(timestamp)) return false;

  const now = Date.now();
  if (now - timestamp > SESSION_DURATION_MS) return false;

  const expectedToken = createSessionToken(timestamp);
  return token === expectedToken;
}
