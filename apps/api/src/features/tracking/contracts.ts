import { z } from "zod";

export const coordinatesSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

export const locationPing = coordinatesSchema.extend({
  accuracyMeters: z.number().min(0).max(5000),
  capturedAt: z.iso.datetime(),
});

export const demoPing = z.strictObject({ step: z.int().min(0).max(3) });
export type Coordinates = z.infer<typeof coordinatesSchema>;
export type LocationPing = z.infer<typeof locationPing>;
