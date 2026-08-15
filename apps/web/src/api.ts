import {
  CandidateListSchema,
  CandidateSummarySchema,
  HomeSummarySchema,
  LoginResponseSchema,
  type CandidateList,
  type CandidateSummary,
  type CreateCandidateRequest,
  type HomeSummary,
  type LoginRequest,
  type User,
} from '@memory-hub/contracts'

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

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as
      { error?: { code?: string; message?: string } } | undefined
    throw new ApiError(
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
  await request('/api/v1/auth/logout', { method: 'POST' })
}

export async function getHomeSummary(): Promise<HomeSummary> {
  return HomeSummarySchema.parse(await request('/api/v1/home'))
}

export async function listCandidates(): Promise<CandidateList> {
  return CandidateListSchema.parse(await request('/api/v1/candidates'))
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
