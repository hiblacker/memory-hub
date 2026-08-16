import type { GlobalThemeOverrides } from 'naive-ui'
import { createDiscreteApi } from 'naive-ui'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#24704d',
    primaryColorHover: '#2d825d',
    primaryColorPressed: '#1d5c3f',
    primaryColorSuppl: '#24704d',
    borderRadius: '6px',
  },
}

const TOAST_DURATION_MS = 2000

const { message } = createDiscreteApi(['message'], {
  configProviderProps: {
    themeOverrides,
  },
  messageProviderProps: {
    placement: 'top',
    duration: TOAST_DURATION_MS,
    max: 3,
    keepAliveOnHover: false,
  },
})

/** Global API error toast. Prefer calling from the shared request layer only. */
export function showApiErrorToast(content: string): void {
  const text = content.trim() || '请求失败，请稍后重试。'
  message.error(text, {
    duration: TOAST_DURATION_MS,
    closable: false,
  })
}

export function showSuccessToast(content: string): void {
  const text = content.trim()
  if (!text) return
  message.success(text, {
    duration: TOAST_DURATION_MS,
    closable: false,
  })
}
