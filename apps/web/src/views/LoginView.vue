<script setup lang="ts">
import { LogIn, ShieldCheck } from 'lucide-vue-next'
import { NButton, NForm, NFormItem, NInput } from 'naive-ui'
import { reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useLoginMutation } from '../queries'

const router = useRouter()
const route = useRoute()
const loginMutation = useLoginMutation()
const form = reactive({ username: '', password: '' })

async function submitLogin() {
  if (!form.username.trim() || !form.password) return
  try {
    await loginMutation.mutateAsync({
      username: form.username.trim(),
      password: form.password,
    })
    const redirect =
      typeof route.query.redirect === 'string' ? route.query.redirect : '/inbox'
    await router.replace(redirect)
  } catch {
    // API errors are toasted by the shared request layer.
  }
}
</script>

<template>
  <main class="login-page">
    <section class="login-panel" aria-labelledby="login-title">
      <div class="brand-lockup">
        <span class="brand-mark" aria-hidden="true">M</span>
        <span>MemoryHub</span>
      </div>

      <div class="login-heading">
        <h1 id="login-title">登录管理端</h1>
        <p>审核来自 ChatGPT 和 Claude Code 的候选记忆，并同步到思源笔记。</p>
      </div>

      <NForm :model="form" label-placement="top" @submit.prevent="submitLogin">
        <NFormItem label="用户名">
          <NInput
            v-model:value="form.username"
            autocomplete="username"
            placeholder="请输入用户名"
            size="large"
          />
        </NFormItem>
        <NFormItem label="密码">
          <NInput
            v-model:value="form.password"
            type="password"
            autocomplete="current-password"
            placeholder="请输入密码"
            show-password-on="click"
            size="large"
          />
        </NFormItem>
        <NButton
          attr-type="submit"
          type="primary"
          size="large"
          block
          :loading="loginMutation.isPending.value"
          :disabled="!form.username.trim() || !form.password"
        >
          <template #icon><LogIn :size="18" /></template>
          登录
        </NButton>
      </NForm>

      <div class="security-note">
        <ShieldCheck :size="16" aria-hidden="true" />
        <span>凭据只发送到你的 MemoryHub 服务，会话保存在安全 Cookie 中。</span>
      </div>
    </section>
  </main>
</template>
