import { z } from 'zod'

export const PROJECT_PHASE = 'runtime' as const

export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1).max(80),
  password: z.string().min(1).max(256),
})

export const UserSchema = z.object({
  id: z.string(),
  username: z.string(),
})

export const LoginResponseSchema = z.object({
  user: UserSchema,
})

export const HomeSummarySchema = z.object({
  user: UserSchema,
  counts: z.object({
    pendingCandidates: z.number().int().nonnegative(),
    queuedDeliveries: z.number().int().nonnegative(),
    archivedMemories: z.number().int().nonnegative(),
  }),
})

export type LoginRequest = z.infer<typeof LoginRequestSchema>
export type User = z.infer<typeof UserSchema>
export type HomeSummary = z.infer<typeof HomeSummarySchema>
