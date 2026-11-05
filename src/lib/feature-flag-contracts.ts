import { z } from 'zod';

export const adminFeatureFlagSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean(),
  description: z.string().nullable(),
  updated_at: z.string().refine(value => Number.isFinite(Date.parse(value))),
});
export const adminFeatureFlagsSchema = z.array(adminFeatureFlagSchema)
  .refine(flags => new Set(flags.map(flag => flag.name)).size === flags.length && new Set(flags.map(flag => flag.id)).size === flags.length);
export type AdminFeatureFlag = z.infer<typeof adminFeatureFlagSchema>;
