import { jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { HttpError } from "../../http-error.js";
import type { InvoiceScope } from "./queries.js";

const issuer = "runline";
const audience = "runline-track";
export type JobScope = { tenantId: string; jobId: string };
const scopeSchema = z.union([
  z.object({ tenantId: z.uuid(), jobId: z.uuid(), invoiceId: z.never().optional(), exp: z.number() }),
  z.object({ tenantId: z.uuid(), invoiceId: z.uuid(), jobId: z.never().optional(), exp: z.number() }),
]);

export async function createCustomerLink(scope: InvoiceScope | JobScope, key: Uint8Array) {
  const token = await new SignJWT(scope).setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime("7d").sign(key);
  return { path: `/track/${token}` };
}

export async function customerScope(token: unknown, key: Uint8Array) {
  if (typeof token !== "string" || token.length > 800) throw new HttpError(404, "This customer link is invalid or expired");
  const verified = await jwtVerify(token, key, {
    algorithms: ["HS256"], issuer, audience, requiredClaims: ["exp"],
  }).catch(() => null);
  const scope = scopeSchema.safeParse(verified?.payload);
  if (!scope.success) throw new HttpError(404, "This customer link is invalid or expired");
  return { ...scope.data, role: "CUSTOMER" as const };
}
