import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type {
  CreateCandidateRequest,
  RejectCandidateRequest,
  UpdateCandidateRequest,
} from '@memory-hub/contracts'

import {
  approveCandidate,
  createCandidate,
  login,
  logout,
  rejectCandidate,
  updateCandidate,
} from './api'

export const authQueryKey = ['auth', 'current-user'] as const
export const homeQueryKey = ['home', 'summary'] as const
export const candidatesQueryKey = ['candidates', 'list'] as const
export function candidateQueryKey(candidateId: string) {
  return ['candidates', 'detail', candidateId] as const
}

export function useLoginMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: login,
    onSuccess(user) {
      queryClient.setQueryData(authQueryKey, user)
    },
  })
}

export function useLogoutMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: logout,
    async onSuccess() {
      queryClient.removeQueries()
    },
  })
}

export function useCreateCandidateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCandidateRequest) => createCandidate(input),
    async onSuccess() {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: candidatesQueryKey }),
        queryClient.invalidateQueries({ queryKey: homeQueryKey }),
      ])
    },
  })
}

async function invalidateCandidateViews(
  queryClient: ReturnType<typeof useQueryClient>,
  candidateId: string,
) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: candidatesQueryKey }),
    queryClient.invalidateQueries({ queryKey: candidateQueryKey(candidateId) }),
    queryClient.invalidateQueries({ queryKey: homeQueryKey }),
  ])
}

export function useUpdateCandidateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      candidateId,
      input,
    }: {
      candidateId: string
      input: UpdateCandidateRequest
    }) => updateCandidate(candidateId, input),
    async onSuccess(_data, variables) {
      await invalidateCandidateViews(queryClient, variables.candidateId)
    },
  })
}

export function useApproveCandidateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (candidateId: string) => approveCandidate(candidateId),
    async onSuccess(_data, candidateId) {
      await invalidateCandidateViews(queryClient, candidateId)
    },
  })
}

export function useRejectCandidateMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      candidateId,
      input = {},
    }: {
      candidateId: string
      input?: RejectCandidateRequest
    }) => rejectCandidate(candidateId, input),
    async onSuccess(_data, variables) {
      await invalidateCandidateViews(queryClient, variables.candidateId)
    },
  })
}
