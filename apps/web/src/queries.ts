import { useMutation, useQueryClient } from '@tanstack/vue-query'

import { login, logout } from './api'

export const authQueryKey = ['auth', 'current-user'] as const
export const homeQueryKey = ['home', 'summary'] as const

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
