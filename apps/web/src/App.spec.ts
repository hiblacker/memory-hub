import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import App from './App.vue'

describe('App', () => {
  it('通过 Naive UI 展示已确认的前端基线', () => {
    const wrapper = mount(App)

    expect(wrapper.text()).toContain('方案已确认')
    expect(wrapper.text()).toContain('Vue 3 + Vite + TypeScript')
    expect(wrapper.text()).toContain('Naive UI')
    expect(wrapper.find('.n-card').exists()).toBe(true)
    expect(wrapper.find('.n-tag').exists()).toBe(true)
  })
})
