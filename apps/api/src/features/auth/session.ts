import { parse } from "cookie";
import { jwtVerify, SignJWT } from "jose";
import type { Pool } from "pg";
import { withTenant } from "../../db/tenant-transaction.js";
import { identitySchema, type Session } from "./contracts.js";

export const sessionCookie = "runline_session";
export const sessionLifetime = 15 * 60;
const issuer = "runline";
const audience = "runline-web";

export function findSession(pool: Pool, tenantId: string, userId: string) {
  return withTenant(pool, { tenantId }, async (client) => {
    const { rows } = await client.query<Session>(`
      SELECT m.id AS "userId", m.name AS "userName", m.role,
             t.id AS "tenantId", t.slug AS "tenantSlug", t.name AS "tenantName"
      FROM runline.tenant_members m
      JOIN runline.tenants t ON t.id = m.tenant_id
      WHERE m.tenant_id = $1 AND m.id = $2
    `, [tenantId, userId]);
    return rows[0];
  });
}

export function signSession(session: Session, key: Uint8Array) {
  return new SignJWT(identitySchema.parse(session))
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(`${sessionLifetime}s`)
    .sign(key);
}

export async function readSession(pool: Pool, key: Uint8Array, cookieHeader = "") {
  const token = parse(cookieHeader)[sessionCookie];
  if (!token) return null;

  const verified = await jwtVerify(token, key, {
    algorithms: ["HS256"], issuer, audience, requiredClaims: ["exp"],
  }).catch(() => null);
  const identity = identitySchema.safeParse(verified?.payload);
  if (!identity.success || typeof verified?.payload.exp !== "number") return null;

  const { tenantId, userId, role } = identity.data;
  const session = await findSession(pool, tenantId, userId);
  return session?.role === role ? { ...session, expiresAt: verified.payload.exp * 1000 } : null;
}
