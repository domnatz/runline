import { z } from "zod";

export const roleSchema = z.enum(["ADMIN", "DISPATCHER", "TECHNICIAN"]);

export const demoLoginSchema = z.strictObject({
  tenantSlug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80),
  persona: roleSchema.default("DISPATCHER"),
});

export const identitySchema = z.object({
  userId: z.uuid(),
  tenantId: z.uuid(),
  role: roleSchema,
});

export const sessionSchema = identitySchema.extend({
  userName: z.string(),
  tenantSlug: z.string(),
  tenantName: z.string(),
});

export const demoTenantsSchema = z.object({
  tenants: z.array(z.object({ slug: z.string(), name: z.string() })),
});

export type Session = z.infer<typeof sessionSchema>;
