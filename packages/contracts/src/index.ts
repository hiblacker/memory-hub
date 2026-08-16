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

export const RenderStyleSchema = z.enum(['xhs_note', 'tech_clean'])

const optionalProjectSchema = z
  .string()
  .trim()
  .max(120)
  .optional()
  .transform((value) => (value ? value : undefined))

const candidateBodyFields = {
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  memoryType: MemoryTypeSchema,
  project: optionalProjectSchema,
  renderStyle: RenderStyleSchema.default('xhs_note'),
  emojiEnabled: z.boolean().default(true),
}

export const CreateCandidateRequestSchema = z.object({
  ...candidateBodyFields,
  captureTime: z.string().datetime().optional(),
})

export const UpdateCandidateRequestSchema = z.object(candidateBodyFields)

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
  renderStyle: RenderStyleSchema,
  emojiEnabled: z.boolean(),
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
export type RenderStyle = z.infer<typeof RenderStyleSchema>
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

export const DeliveryStatusSchema = z.enum([
  'queued',
  'processing',
  'succeeded',
  'retrying',
  'dead_letter',
  'blocked',
])

export const ArchiveDeliverySchema = z.object({
  id: z.string(),
  candidateId: z.string(),
  memoryVersionId: z.string(),
  targetId: z.string(),
  status: DeliveryStatusSchema,
  attemptCount: z.number().int().nonnegative(),
  documentId: z.string().nullable(),
  blockId: z.string().nullable(),
  path: z.string().nullable(),
  requestFingerprint: z.string().nullable(),
  lastErrorCode: z.string().nullable(),
  lastErrorMessage: z.string().nullable(),
  nextAttemptAt: z.string().datetime().nullable(),
  succeededAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export const ArchiveDeliveryListSchema = z.object({
  items: z.array(ArchiveDeliverySchema),
})

export const SiyuanSettingsSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  baseUrl: z.string().url(),
  authHeader: z.string(),
  notebookId: z.string().nullable(),
  notebookName: z.string().nullable(),
  pathTemplate: z.string().min(1).max(300),
  allowedHosts: z.string().nullable(),
  lastTestStatus: z.string().nullable(),
  lastTestMessage: z.string().nullable(),
  lastTestedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  tokenConfigured: z.boolean(),
})

export const UpdateSiyuanSettingsSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  baseUrl: z.string().url(),
  authHeader: z.string().trim().min(1).max(80).optional(),
  notebookId: z.string().trim().min(1).max(120).nullable().optional(),
  notebookName: z.string().trim().max(200).nullable().optional(),
  pathTemplate: z.string().trim().min(1).max(300).optional(),
  allowedHosts: z.string().trim().max(500).nullable().optional(),
})

export type DeliveryStatus = z.infer<typeof DeliveryStatusSchema>
export type ArchiveDelivery = z.infer<typeof ArchiveDeliverySchema>
export type SiyuanSettings = z.infer<typeof SiyuanSettingsSchema>
export type UpdateSiyuanSettings = z.infer<typeof UpdateSiyuanSettingsSchema>

export const SourceTypeSchema = z.enum([
  'claude_code',
  'chatgpt_export',
  'chatgpt_extension',
  'rest',
  'manual',
])

export const SourceEventSchema = z.object({
  schemaVersion: z.literal(1),
  source: SourceTypeSchema,
  eventType: z.string().trim().min(1).max(80),
  externalConversationId: z.string().trim().min(1).max(200),
  externalEventId: z.string().trim().min(1).max(200),
  occurredAt: z.string().datetime(),
  project: z
    .object({
      name: z.string().trim().min(1).max(120).optional(),
      repository: z.string().trim().max(300).optional(),
      branch: z.string().trim().max(120).optional(),
    })
    .optional(),
  content: z.object({
    title: z.string().trim().min(1).max(200),
    text: z.string().trim().min(1).max(50_000),
  }),
  metadata: z.record(z.unknown()).default({}),
})

export const IngestEventResponseSchema = z.object({
  accepted: z.boolean(),
  duplicate: z.boolean(),
  eventId: z.string(),
  status: z.enum(['received', 'duplicate', 'processed', 'failed']),
  candidateId: z.string().nullable(),
})

export const ConnectorTypeSchema = z.enum([
  'claude_code',
  'chatgpt_export',
  'chatgpt_extension',
  'rest',
])

export const ConnectorSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  type: ConnectorTypeSchema,
  enabled: z.boolean(),
  keyPrefix: z.string(),
  lastUsedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
})

export const CreateConnectorRequestSchema = z.object({
  name: z.string().trim().min(1).max(80),
  type: ConnectorTypeSchema,
})

export const CreateConnectorResponseSchema = z.object({
  connector: ConnectorSummarySchema,
  apiKey: z.string(),
})

export const ConnectorListSchema = z.object({
  items: z.array(ConnectorSummarySchema),
})

export type SourceEvent = z.infer<typeof SourceEventSchema>
export type IngestEventResponse = z.infer<typeof IngestEventResponseSchema>
export type ConnectorSummary = z.infer<typeof ConnectorSummarySchema>
export type CreateConnectorRequest = z.infer<typeof CreateConnectorRequestSchema>
export type ConnectorType = z.infer<typeof ConnectorTypeSchema>
export type SourceType = z.infer<typeof SourceTypeSchema>
