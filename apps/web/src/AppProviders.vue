<script setup lang="ts">
import type { GlobalThemeOverrides } from 'naive-ui'
import {
  NConfigProvider,
  NDialogProvider,
  NMessageProvider,
  NNotificationProvider,
} from 'naive-ui'

const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#24704d',
    primaryColorHover: '#2d825d',
    primaryColorPressed: '#1d5c3f',
    primaryColorSuppl: '#24704d',
    borderRadius: '6px',
  },
}
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides">
    <NDialogProvider>
      <NMessageProvider placement="top" :duration="2000" :max="3">
        <NNotificationProvider>
          <slot />
        </NNotificationProvider>
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>
