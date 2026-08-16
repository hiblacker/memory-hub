import {
  ArchiveDeliveryListSchema,
  ArchiveDeliverySchema,
  CandidateListSchema,
  SiyuanSettingsSchema,
  ConnectorListSchema,
  CreateConnectorResponseSchema,
  ConnectorSummarySchema,
  CandidateSummarySchema,
  HomeSummarySchema,
  LoginResponseSchema,
  type CandidateList,
  type CandidateSummary,
  type CreateCandidateRequest,
  type HomeSummary,
  type LoginRequest,
  type RejectCandidateRequest,
  type ArchiveDelivery,
  type SiyuanSettings,
  type UpdateSiyuanSettings,
  type UpdateCandidateRequest,
  type ConnectorSummary,
  type CreateConnectorRequest,
  type User,
} from '@memory-hub/contracts'

import { showApiErrorToast } from './feedback'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? ''

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

function toApiError(
  status: number,
  code: string,
  message: string,
): ApiError {
  const error = new ApiError(status, code, message)
  showApiErrorToast(error.message)
  return error
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const headers = new Headers(init?.headers)
  // Fastify rejects empty bodies when Content-Type is application/json.
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers,
    })
  } catch {
    throw toApiError(0, 'NETWORK_ERROR', '网络异常，请检查连接后重试。')
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      | { error?: { code?: string; message?: string } }
      | undefined
    throw toApiError(
      response.status,
      payload?.error?.code ?? 'REQUEST_FAILED',
      payload?.error?.message ?? '请求失败，请稍后重试。',
    )
  }

  if (response.status === 204) return undefined
  return response.json()
}

export async function login(input: LoginRequest): Promise<User> {
  return LoginResponseSchema.parse(
    await request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  ).user
}

export async function getCurrentUser(): Promise<User> {
  return LoginResponseSchema.parse(await request('/api/v1/auth/me')).user
}

export async function logout(): Promise<void> {
  await request('/api/v1/auth/logout', {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function getHomeSummary(): Promise<HomeSummary> {
  return HomeSummarySchema.parse(await request('/api/v1/home'))
}

export async function listCandidates(): Promise<CandidateList> {
  return CandidateListSchema.parse(await request('/api/v1/candidates'))
}

export async function getCandidate(
  candidateId: string,
): Promise<CandidateSummary> {
  return CandidateSummarySchema.parse(
    await request(`/api/v1/candidates/${candidateId}`),
  )
}

export async function createCandidate(
  input: CreateCandidateRequest,
): Promise<CandidateSummary> {
  return CandidateSummarySchema.parse(
    await request('/api/v1/candidates', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )
}

export async function updateCandidate(
  candidateId: string,
  input: UpdateCandidateRequest,
): Promise<CandidateSummary> {
  return CandidateSummarySchema.parse(
    await request(`/api/v1/candidates/${candidateId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  )
}

export async function approveCandidate(
  candidateId: string,
): Promise<CandidateSummary> {
  return CandidateSummarySchema.parse(
    await request(`/api/v1/candidates/${candidateId}/approve`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  )
}

export async function rejectCandidate(
  candidateId: string,
  input: RejectCandidateRequest = {},
): Promise<CandidateSummary> {
  return CandidateSummarySchema.parse(
    await request(`/api/v1/candidates/${candidateId}/reject`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )
}

export async function getSiyuanSettings(): Promise<SiyuanSettings> {
  return SiyuanSettingsSchema.parse(await request('/api/v1/settings/siyuan'))
}

export async function updateSiyuanSettings(
  input: UpdateSiyuanSettings,
): Promise<SiyuanSettings> {
  return SiyuanSettingsSchema.parse(
    await request('/api/v1/settings/siyuan', {
      method: 'PUT',
      body: JSON.stringify(input),
    }),
  )
}

export async function testSiyuanSettings(
  input?: UpdateSiyuanSettings,
): Promise<SiyuanSettings> {
  return SiyuanSettingsSchema.parse(
    await request('/api/v1/settings/siyuan/test', {
      method: 'POST',
      body: JSON.stringify(input ?? {}),
    }),
  )
}

export async function listCandidateDeliveries(
  candidateId: string,
): Promise<ArchiveDelivery[]> {
  return ArchiveDeliveryListSchema.parse(
    await request(`/api/v1/candidates/${candidateId}/deliveries`),
  ).items
}

export async function retryDelivery(deliveryId: string): Promise<ArchiveDelivery> {
  return ArchiveDeliverySchema.parse(
    await request(`/api/v1/deliveries/${deliveryId}/retry`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),
  )
}

export async function listArchives(): Promise<CandidateList> {
  return CandidateListSchema.parse(await request('/api/v1/archives'))
}
export async function listConnectors(): Promise<ConnectorSummary[]> {
  return ConnectorListSchema.parse(await request('/api/v1/connectors')).items
}

export async function createConnector(
  input: CreateConnectorRequest,
): Promise<{ connector: ConnectorSummary; apiKey: string }> {
  return CreateConnectorResponseSchema.parse(
    await request('/api/v1/connectors', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  )
}

export async function setConnectorEnabled(
  connectorId: string,
  enabled: boolean,
): Promise<ConnectorSummary> {
  const path = enabled
    ? `/api/v1/connectors/${connectorId}/enable`
    : `/api/v1/connectors/${connectorId}/disable`
  return ConnectorSummarySchema.parse(
    await request(path, { method: 'POST', body: JSON.stringify({}) }),
  )
}