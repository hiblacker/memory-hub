import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { CreateCandidateRequest } from '@memory-hub/contracts'

import { createCandidate, login, logout } from './api'

export const authQueryKey = ['auth', 'current-user'] as const
export const homeQueryKey = ['home', 'summary'] as const
export const candidatesQueryKey = ['candidates', 'list'] as const

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
