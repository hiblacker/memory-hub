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

export const MemoryTypeSchema = z.enum([
  'permanent_fact',
  'preference',
  'project_context',
  'decision',
  'temporary_state',
  'todo',
  'sensitive',
])

export const CandidateStatusSchema = z.enum([
  'pending',
  'approved',
  'queued',
  'archived',
  'rejected',
  'conflict',
])

export const SensitivitySchema = z.enum(['normal', 'private', 'strict'])

const optionalProjectSchema = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((value) => (value ? value : undefined))

export const CreateCandidateRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  memoryType: MemoryTypeSchema,
  project: optionalProjectSchema,
  captureTime: z.string().datetime().optional(),
})

export const UpdateCandidateRequestSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  memoryType: MemoryTypeSchema,
  project: optionalProjectSchema,
})

export const RejectCandidateRequestSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((value) => (value ? value : undefined)),
})

export const CandidateSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  memoryType: MemoryTypeSchema,
  source: z.string(),
  project: z.string().nullable(),
  status: CandidateStatusSchema,
  sensitivity: SensitivitySchema,
  confidence: z.number().int().min(0).max(100),
  rejectionReason: z.string().nullable(),
  captureTime: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const CandidateListSchema = z.object({
  items: z.array(CandidateSummarySchema),
})

export type LoginRequest = z.infer<typeof LoginRequestSchema>
export type User = z.infer<typeof UserSchema>
export type HomeSummary = z.infer<typeof HomeSummarySchema>
export type MemoryType = z.infer<typeof MemoryTypeSchema>
export type CandidateStatus = z.infer<typeof CandidateStatusSchema>
export type Sensitivity = z.infer<typeof SensitivitySchema>
export type CreateCandidateRequest = z.infer<
  typeof CreateCandidateRequestSchema
>
export type UpdateCandidateRequest = z.infer<
  typeof UpdateCandidateRequestSchema
>
export type RejectCandidateRequest = z.infer<
  typeof RejectCandidateRequestSchema
>
export type CandidateSummary = z.infer<typeof CandidateSummarySchema>
export type CandidateList = z.infer<typeof CandidateListSchema>
