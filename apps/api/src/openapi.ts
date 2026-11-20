import { z } from "zod";
import { demoLoginSchema, demoTenantsSchema, sessionSchema } from "./features/auth/contracts.js";
import { sessionCookie } from "./features/auth/session.js";
import { checkoutInput } from "./features/billing/checkout.js";
import { checklistKey, idempotencyKey, syncBatch } from "./features/field/contracts.js";
import { advanceJobSchema, cancelJobSchema, createJobSchema, daySchema, editJobSchema, jobEventAction, scheduleJobSchema, statusSchema } from "./features/jobs/contracts.js";
import { coordinatesSchema, demoPing, locationPing } from "./features/tracking/contracts.js";

const errorSchema = z.object({ error: z.string() });

function jsonResponse(description: string, schema: z.ZodType) {
  return { description, content: { "application/json": { schema: z.toJSONSchema(schema) } } };
}

function jsonBody(schema: z.ZodType) {
  return { required: true, content: { "application/json": { schema: z.toJSONSchema(schema, { io: "input" }) } } };
}

const jobId = z.uuid();
const assignment = {
  technicianName: z.string().nullable(),
  serviceDate: daySchema.nullable(),
  startMinute: z.int().nullable(),
  durationMinutes: z.int().nullable(),
};
const job = createJobSchema.omit({ destination: true, requiredSkills: true }).extend({
  ...assignment,
  id: jobId,
  destination: coordinatesSchema.nullable(),
  requiredSkills: z.array(z.string()),
  technicianId: jobId.nullable(),
  status: statusSchema,
  version: z.int(),
  createdAt: z.iso.datetime(),
});
const jobList = z.object({ jobs: z.array(job) });
const dayRoute = jobList.extend({ date: daySchema, today: daySchema, timeZone: z.string() });
const detail = z.object({
  job,
  timeZone: z.string(),
  events: z.array(z.object({
    ...assignment,
    version: z.int(),
    action: jobEventAction,
    actorName: z.string().nullable(),
    previousStatus: statusSchema.nullable(),
    status: statusSchema,
    occurredAt: z.iso.datetime(),
    arrivalSource: z.enum(["manual", "geofence"]).nullable(),
    reason: z.string().nullable(),
  })),
});
const security = [{ session: [] }];
const idParameter = { name: "id", in: "path", required: true, schema: z.toJSONSchema(jobId) };
const dateParameter = { name: "date", in: "query", schema: z.toJSONSchema(daySchema) };
const created = jsonResponse("Work order created", z.object({ id: jobId }));
const authorizationErrors = {
  "401": jsonResponse("Sign-in required", errorSchema),
  "403": jsonResponse("Role is not allowed", errorSchema),
};
const writeResponses = {
  ...authorizationErrors,
  "204": { description: "Work order updated" },
  "400": jsonResponse("Invalid data", errorSchema),
  "404": jsonResponse("Work order unavailable", errorSchema),
  "409": jsonResponse("Scheduling conflict, invalid transition, or stale version", errorSchema),
};
const stockPart = z.object({ sku: z.string(), name: z.string(), quantity: z.int() });
const inventory = z.object({ stock: z.array(stockPart.extend({ locationId: jobId, locationName: z.string() })) });
const syncOutcome = z.object({
  id: jobId, state: z.enum(["applied", "rejected", "blocked"]),
  message: z.string().optional(), remaining: z.int().optional(),
});
const amount = z.int().nonnegative();
const billing = z.object({
  invoice: z.object({
    id: jobId, jobId, tenantName: z.string(), jobTitle: z.string(), customerName: z.string(), address: z.string(),
    currency: z.string(), totalMinor: amount, issuedAt: z.iso.datetime(), paidAt: z.iso.datetime().nullable(),
  }),
  lines: z.array(z.object({ description: z.string(), quantity: z.int().positive(), unitMinor: amount })),
  documents: z.object({ invoice: z.boolean(), receipt: z.boolean() }),
});
const journal = z.object({
  outstandingMinor: amount, settledMinor: amount,
  entries: z.array(z.object({
    invoiceId: jobId, jobId, event: z.enum(["ISSUED", "SETTLED"]), debitAccount: z.string(),
    creditAccount: z.string(), amountMinor: amount, postedAt: z.iso.datetime(),
  })),
});
const tokenParameter = { name: "token", in: "path", required: true, schema: { type: "string" } };
const kindParameter = { name: "kind", in: "path", required: true, schema: z.toJSONSchema(z.enum(["invoice", "receipt"])) };
const trackLink = jsonResponse("Customer portal path", z.object({ path: z.string() }));
const linkUnavailable = jsonResponse("Link invalid, expired, or out of scope", errorSchema);
const documentResponses = {
  "200": { description: "PDF download", content: { "application/pdf": {} } },
  "404": jsonResponse("Document unavailable or link invalid", errorSchema),
  "503": jsonResponse("Document storage temporarily unavailable", errorSchema),
};
const trackingTrip = z.object({
  jobId, title: z.string(), technicianName: z.string(), position: coordinatesSchema,
  destination: coordinatesSchema.nullable(), etaMinutes: z.int().positive().nullable(),
  capturedAt: z.iso.datetime({ offset: true }), source: z.enum(["device", "demo"]),
  route: z.array(z.tuple([z.number(), z.number()])).nullable(),
});
const trackingCustomer = z.object({
  jobId, tenantName: z.string(), title: z.string(), customerName: z.string(), address: z.string(),
  status: statusSchema, trip: trackingTrip.nullable(),
});
const trackingDispatch = z.object({ jobs: z.array(z.object({ id: jobId, version: z.int() })), trips: z.array(trackingTrip) });
function snapshotStream(schema: z.ZodType) {
  return {
    description: "Server-sent events. Every connection starts with a fresh snapshot; expired credentials close the stream.",
    content: { "text/event-stream": { schema: { type: "string" }, "x-snapshot-data-schema": z.toJSONSchema(schema) } },
  };
}
const pingResponses = {
  ...authorizationErrors,
  "200": jsonResponse("Location receipt", z.object({ accepted: z.boolean(), arrived: z.boolean() })),
  "400": jsonResponse("Invalid or outdated ping", errorSchema),
  "404": jsonResponse("Work order or replay unavailable", errorSchema),
  "409": jsonResponse("Work order is not en route or has no replay destination", errorSchema),
};

export const openapi = {
  openapi: "3.1.0",
  info: { title: "Runline API", version: "0.1.0" },
  components: {
    securitySchemes: { session: { type: "apiKey", in: "cookie", name: sessionCookie } },
  },
  paths: {
    "/api/health": {
      get: {
        summary: "Check database readiness",
        responses: {
          "200": jsonResponse("Ready", z.object({ status: z.literal("ok") })),
          "503": jsonResponse("Database unavailable", errorSchema),
        },
      },
    },
    "/api/demo/tenants": {
      get: {
        summary: "List organizations available for sign-in",
        responses: { "200": jsonResponse("Organizations", demoTenantsSchema) },
      },
    },
    "/api/demo/session": {
      post: {
        summary: "Sign in as a seeded team member",
        requestBody: jsonBody(demoLoginSchema),
        responses: {
          "204": { description: "Session cookie issued" },
          "400": jsonResponse("Invalid tenant selection", errorSchema),
          "404": jsonResponse("Organization unavailable", errorSchema),
          "503": jsonResponse("Account unavailable", errorSchema),
        },
      },
    },
    "/api/session": {
      get: {
        summary: "Read the signed-in workspace",
        security: [{ session: [] }],
        responses: {
          "200": jsonResponse("Current session", sessionSchema),
          "401": jsonResponse("Sign-in required", errorSchema),
        },
      },
      delete: {
        summary: "Clear the session cookie",
        responses: { "204": { description: "Signed out" } },
      },
    },
    "/api/dispatch": {
      get: {
        summary: "Read the dispatch board for a day", security, parameters: [dateParameter],
        responses: { ...authorizationErrors, "200": jsonResponse("Dispatch board", dayRoute.extend({
          technicians: z.array(z.object({ id: jobId, name: z.string() })), demoMode: z.boolean(),
        })) },
      },
    },
    "/api/tech/route": {
      get: {
        summary: "Read the signed-in technician's assignments", security, parameters: [dateParameter],
        responses: { ...authorizationErrors, "200": jsonResponse("Daily route", dayRoute) },
      },
    },
    "/api/tech/manifest": {
      get: {
        summary: "Download assigned work orders and van stock", security,
        parameters: [dateParameter, { name: "jobId", in: "query", schema: z.toJSONSchema(jobId) }],
        responses: { ...authorizationErrors, "200": jsonResponse("Offline route data", z.object({
          date: daySchema, today: daySchema, timeZone: z.string(),
          profile: sessionSchema.pick({ tenantId: true, userId: true, tenantName: true, userName: true })
            .extend({ datasetId: syncBatch.shape.datasetId }),
          jobs: z.array(detail.omit({ timeZone: true }).extend({
            checklist: z.partialRecord(checklistKey, z.boolean()),
            parts: z.array(stockPart.extend({ id: jobId })),
          })),
          stock: z.array(stockPart),
        })) },
      },
    },
    "/api/sync/batch": {
      post: {
        summary: "Replay ordered technician changes", security,
        parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: z.toJSONSchema(idempotencyKey) }],
        requestBody: jsonBody(syncBatch),
        responses: { ...authorizationErrors,
          "200": jsonResponse("Result of each mutation", z.object({ outcomes: z.array(syncOutcome) })),
          "400": jsonResponse("Invalid key or batch", errorSchema),
          "409": jsonResponse("Batch key reused with a different payload", errorSchema) },
      },
    },
    "/api/inventory": {
      get: {
        summary: "Read warehouse and van quantities for dispatch staff", security,
        responses: { ...authorizationErrors, "200": jsonResponse("Inventory", inventory) },
      },
    },
    "/api/inventory/stream": {
      get: {
        summary: "Stream committed stock quantities for dispatch staff", security,
        responses: { ...authorizationErrors, "200": snapshotStream(inventory) },
      },
    },
    "/api/jobs": {
      get: {
        summary: "List work orders for dispatch staff", security,
        responses: { ...authorizationErrors, "200": jsonResponse("Work orders", jobList) },
      },
      post: {
        summary: "Create an unassigned work order", security, requestBody: jsonBody(createJobSchema),
        responses: { ...authorizationErrors, "201": created, "400": jsonResponse("Invalid data", errorSchema) },
      },
    },
    "/api/jobs/emergency-demo": {
      post: {
        summary: "Create a preset emergency work order", security,
        responses: { ...authorizationErrors, "201": created, "404": jsonResponse("Preset unavailable", errorSchema) },
      },
    },
    "/api/jobs/{id}": {
      parameters: [idParameter],
      get: {
        summary: "Read a visible work order and its audit history", security,
        responses: { ...authorizationErrors, "200": jsonResponse("Work order", detail),
          "404": jsonResponse("Work order unavailable", errorSchema) },
      },
      patch: {
        summary: "Edit an unassigned or scheduled work order", security,
        requestBody: jsonBody(editJobSchema), responses: writeResponses,
      },
    },
    "/api/jobs/{id}/cancel": {
      parameters: [idParameter],
      post: {
        summary: "Cancel an unassigned or scheduled work order and record a reason", security,
        requestBody: jsonBody(cancelJobSchema), responses: writeResponses,
      },
    },
    "/api/jobs/{id}/schedule": {
      parameters: [idParameter],
      put: {
        summary: "Assign or reschedule a work order", security,
        requestBody: jsonBody(scheduleJobSchema), responses: writeResponses,
      },
    },
    "/api/jobs/{id}/status": {
      parameters: [idParameter],
      patch: {
        summary: "Advance a technician's assigned work order", security,
        requestBody: jsonBody(advanceJobSchema), responses: writeResponses,
      },
    },
    "/api/billing/jobs/{id}": {
      parameters: [idParameter],
      get: {
        summary: "Read billing for a visible work order", security,
        responses: { ...authorizationErrors, "200": jsonResponse("Work order billing", z.object({ billing: billing.nullable() })) },
      },
    },
    "/api/billing/invoices/{id}/link": {
      parameters: [idParameter],
      post: {
        summary: "Create a signed customer link valid for seven days", security,
        responses: { ...authorizationErrors, "200": trackLink, "404": jsonResponse("Invoice unavailable", errorSchema) },
      },
    },
    "/api/billing/invoices/{id}/documents/{kind}": {
      parameters: [idParameter, kindParameter],
      get: { summary: "Download a tenant invoice or receipt", security, responses: { ...authorizationErrors, ...documentResponses } },
    },
    "/api/billing/ledger": {
      get: {
        summary: "Read a tenant administrator's billing ledger", security,
        responses: { ...authorizationErrors, "200": jsonResponse("Ledger totals and recent postings", journal) },
      },
    },
    "/api/demo/customer-link": {
      post: {
        summary: "Open the customer portal for a seeded invoice", requestBody: jsonBody(z.strictObject({ tenantSlug: z.string() })),
        responses: { "200": trackLink, "400": jsonResponse("Invalid organization", errorSchema),
          "404": jsonResponse("Invoice unavailable", errorSchema) },
      },
    },
    "/api/customer/{token}": {
      parameters: [tokenParameter],
      get: { summary: "Read the invoice scoped to a customer link",
        responses: { "200": jsonResponse("Customer invoice", billing), "404": linkUnavailable } },
    },
    "/api/customer/{token}/checkout": {
      parameters: [tokenParameter],
      post: {
        summary: "Record a checkout outcome without collecting funds", requestBody: jsonBody(checkoutInput),
        parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: z.toJSONSchema(idempotencyKey) }],
        responses: {
          "200": jsonResponse("Recorded outcome", z.object({ outcome: z.enum(["PAID", "DECLINED"]) })),
          "400": jsonResponse("Invalid scenario or payment key", errorSchema),
          "404": linkUnavailable,
          "409": jsonResponse("Payment key reused with a different scenario", errorSchema),
          "504": jsonResponse("Confirmation pending. Retry with the same payment key.", errorSchema),
        },
      },
    },
    "/api/customer/{token}/documents/{kind}": {
      parameters: [tokenParameter, kindParameter],
      get: { summary: "Download a PDF scoped to a customer link", responses: documentResponses },
    },
    "/api/tracking/jobs/{id}/link": {
      parameters: [idParameter],
      post: { summary: "Create a customer link for one work order", security,
        responses: { ...authorizationErrors, "200": trackLink, "404": jsonResponse("Work order unavailable", errorSchema) } },
    },
    "/api/tracking/dispatch/stream": {
      get: { summary: "Stream tenant-scoped dispatch snapshots", security, parameters: [dateParameter],
        responses: { ...authorizationErrors, "200": snapshotStream(trackingDispatch),
          "400": jsonResponse("Invalid dispatch date", errorSchema) } },
    },
    "/api/tracking/tech/jobs/{id}": {
      parameters: [idParameter],
      get: { summary: "Check replay availability for an assigned technician", security,
        responses: { ...authorizationErrors, "200": jsonResponse("Replay availability", z.object({ demoReplay: z.boolean() })),
          "404": jsonResponse("Work order unavailable", errorSchema) } },
    },
    "/api/tracking/tech/jobs/{id}/location": {
      parameters: [idParameter],
      post: { summary: "Record GPS for an assigned, en route technician", security,
        requestBody: jsonBody(locationPing), responses: pingResponses },
      delete: { summary: "Stop sharing the current position for an assigned work order", security,
        responses: { ...authorizationErrors, "204": { description: "Position removed" },
          "404": jsonResponse("Work order unavailable", errorSchema) } },
    },
    "/api/tracking/tech/jobs/{id}/replay": {
      parameters: [idParameter],
      post: { summary: "Replay route positions for an assigned, en route technician", security,
        requestBody: jsonBody(demoPing), responses: pingResponses },
    },
    "/api/tracking/customer/{token}": {
      parameters: [tokenParameter],
      get: { summary: "Read tracking scoped to one customer work order",
        responses: { "200": jsonResponse("Work order tracking", trackingCustomer), "404": linkUnavailable } },
    },
    "/api/tracking/customer/{token}/stream": {
      parameters: [tokenParameter],
      get: { summary: "Stream updates scoped to one customer work order",
        responses: { "200": snapshotStream(trackingCustomer), "404": linkUnavailable } },
    },
    "/api/dispatch/jobs/{id}/matches": {
      parameters: [idParameter],
      get: { summary: "Rank tenant technicians by availability, required skills, and proximity", security,
        parameters: [dateParameter, { name: "startMinute", in: "query", schema: { type: "integer" } },
          { name: "durationMinutes", in: "query", schema: { type: "integer" } }],
        responses: { ...authorizationErrors, "200": jsonResponse("Technician matches", z.object({
          requiredSkills: z.array(z.string()),
          matches: z.array(z.object({ id: jobId, name: z.string(), missingSkills: z.array(z.string()),
            distanceMeters: amount.nullable(), nearby: z.boolean().nullable(), available: z.boolean() })),
        })), "400": jsonResponse("Invalid appointment", errorSchema), "404": jsonResponse("Work order unavailable", errorSchema) } },
    },
    "/api/dispatch/jobs/{id}/drive-time": {
      parameters: [idParameter],
      post: { summary: "Preview road travel between consecutive appointments", security, requestBody: jsonBody(scheduleJobSchema),
        responses: { ...authorizationErrors, "200": jsonResponse("Drive-time legs", z.object({ legs: z.array(z.object({
          direction: z.enum(["before", "after"]), title: z.string(), gapMinutes: z.int(), driveMinutes: amount.nullable(),
          status: z.enum(["OVERLAP", "UNAVAILABLE", "SHORT_GAP", "ENOUGH_TIME"]),
        })) })), "400": jsonResponse("Invalid appointment", errorSchema), "404": jsonResponse("Work order unavailable", errorSchema) } },
    },
    "/api/demo/notifications": {
      get: { summary: "Read the administrator's notification log", security,
        responses: { ...authorizationErrors, "200": jsonResponse("Notification outbox", z.object({
          enabled: z.boolean(), notifications: z.array(z.object({
            jobId, title: z.string(), version: z.int(), kind: z.enum([
              "APPOINTMENT_CONFIRMED", "APPOINTMENT_CHANGED", "TECHNICIAN_EN_ROUTE", "TECHNICIAN_ARRIVED",
            ]), deliveryStatus: z.literal("SIMULATED"), createdAt: z.iso.datetime(),
          })),
        })) } },
    },
  },
};
