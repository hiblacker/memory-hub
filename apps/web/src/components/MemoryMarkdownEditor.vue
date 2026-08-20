<script setup lang="ts">
import type { MemoryType, RenderStyle } from '@memory-hub/contracts'
import { Maximize2, Minimize2 } from 'lucide-vue-next'
import {
  NAlert,
  NButton,
  NButtonGroup,
  NEmpty,
  NInput,
  NSelect,
  NSwitch,
  useDialog,
} from 'naive-ui'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { renderMarkdownPreview } from '../markdown/render'
import { buildMemoryTemplate, QUICK_EMOJIS } from '../markdown/templates'

const props = withDefaults(
  defineProps<{
    modelValue: string
    renderStyle: RenderStyle
    emojiEnabled: boolean
    memoryType: MemoryType
    title?: string
    readonly?: boolean
  }>(),
  {
    title: '',
    readonly: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:renderStyle': [value: RenderStyle]
  'update:emojiEnabled': [value: boolean]
}>()

const dialog = useDialog()
const mode = ref<'preview' | 'edit' | 'split'>('preview')
const isFullscreen = ref(false)

const styleOptions = [
  { label: '小红书笔记风', value: 'xhs_note' },
  { label: '简洁技术风', value: 'tech_clean' },
]

const preview = computed(() => renderMarkdownPreview(props.modelValue || ''))
const isEmpty = computed(() => props.modelValue.trim().length === 0)
const charCount = computed(() => props.modelValue.length)
const isReadonly = computed(() => props.readonly === true)

watch(
  isReadonly,
  (readonly) => {
    if (readonly) mode.value = 'preview'
  },
  { immediate: true },
)

watch(isFullscreen, (fullscreen) => {
  document.body.classList.toggle('md-fullscreen-open', fullscreen)
})

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isFullscreen.value) {
    event.preventDefault()
    isFullscreen.value = false
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  document.body.classList.remove('md-fullscreen-open')
})

function setMode(next: 'preview' | 'edit' | 'split') {
  if (isReadonly.value && next !== 'preview') return
  mode.value = next
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
}

function updateBody(value: string) {
  emit('update:modelValue', value)
}

function appendSnippet(snippet: string) {
  if (isReadonly.value) return
  const base = props.modelValue
  const next = base
    ? base.endsWith('\n')
      ? `${base}${snippet}`
      : `${base}\n${snippet}`
    : snippet
  updateBody(next)
  if (mode.value === 'preview') mode.value = 'edit'
}

function applyTemplate() {
  if (isReadonly.value) return
  const next = () => {
    emit(
      'update:modelValue',
      buildMemoryTemplate({
        title: props.title,
        memoryType: props.memoryType,
        renderStyle: props.renderStyle,
        emojiEnabled: props.emojiEnabled,
        existingBody: props.modelValue,
      }),
    )
    if (mode.value === 'preview') mode.value = 'edit'
  }

  if (!props.modelValue.trim()) {
    next()
    return
  }

  dialog.warning({
    title: '套用模板？',
    content:
      '将按当前风格重排结构，可继续手改。现有正文会作为模板中的内容种子保留。',
    positiveText: '套用模板',
    negativeText: '取消',
    onPositiveClick: () => {
      next()
    },
  })
}

function insertEmoji(emoji: string) {
  if (isReadonly.value) return
  updateBody(`${props.modelValue}${emoji}`)
  if (mode.value === 'preview') mode.value = 'edit'
}
</script>

<template>
  <div
    class="md-editor"
    :class="[
      `style-${renderStyle}`,
      {
        readonly: isReadonly,
        'is-fullscreen': isFullscreen,
      },
    ]"
  >
    <div class="md-toolbar">
      <div class="md-toolbar-left">
        <NButtonGroup size="small">
          <NButton
            :type="mode === 'preview' ? 'primary' : 'default'"
            @click="setMode('preview')"
          >
            仅预览
          </NButton>
          <NButton
            :disabled="isReadonly"
            :type="mode === 'edit' ? 'primary' : 'default'"
            @click="setMode('edit')"
          >
            编辑
          </NButton>
          <NButton
            :disabled="isReadonly"
            :type="mode === 'split' ? 'primary' : 'default'"
            @click="setMode('split')"
          >
            分屏
          </NButton>
        </NButtonGroup>
      </div>

      <div class="md-toolbar-controls">
        <NSelect
          size="small"
          class="md-style-select"
          :value="renderStyle"
          :options="styleOptions"
          :disabled="isReadonly"
          @update:value="(v: RenderStyle) => emit('update:renderStyle', v)"
        />
        <label class="md-switch">
          <span>Emoji</span>
          <NSwitch
            size="small"
            :value="emojiEnabled"
            :disabled="isReadonly"
            @update:value="(v: boolean) => emit('update:emojiEnabled', v)"
          />
        </label>
        <NButton size="small" :disabled="isReadonly" @click="applyTemplate">
          套用模板
        </NButton>
        <NButton size="small" secondary @click="toggleFullscreen">
          <template #icon>
            <Minimize2 v-if="isFullscreen" :size="15" />
            <Maximize2 v-else :size="15" />
          </template>
          {{ isFullscreen ? '退出全屏' : '全屏' }}
        </NButton>
      </div>
    </div>

    <div v-if="!isReadonly && mode !== 'preview'" class="md-format-bar">
      <NButton size="tiny" quaternary @click="appendSnippet('**重点**')">
        加粗
      </NButton>
      <NButton size="tiny" quaternary @click="appendSnippet('## 小节标题')">
        标题
      </NButton>
      <NButton size="tiny" quaternary @click="appendSnippet('- 列表项')">
        列表
      </NButton>
      <NButton size="tiny" quaternary @click="appendSnippet('> 一句话总结')">
        引用
      </NButton>
      <NButton size="tiny" quaternary @click="appendSnippet('`code`')">
        代码
      </NButton>
      <NButton size="tiny" quaternary @click="appendSnippet('---')">
        分割线
      </NButton>
      <span class="md-emoji-label">Emoji</span>
      <button
        v-for="emoji in QUICK_EMOJIS"
        :key="emoji"
        type="button"
        class="md-emoji-btn"
        @click="insertEmoji(emoji)"
      >
        {{ emoji }}
      </button>
    </div>

    <NAlert
      v-if="preview.hasUnsupportedImages"
      type="warning"
      class="md-image-alert"
    >
      V1 暂不支持图片 Markdown，预览与归档都不会渲染图片。
    </NAlert>

    <div class="md-panes" :class="[`mode-${mode}`]">
      <div v-if="mode !== 'preview'" class="md-edit-pane">
        <NInput
          type="textarea"
          class="md-textarea-input"
          :value="modelValue"
          :disabled="isReadonly"
          :autosize="false"
          :rows="18"
          maxlength="20000"
          show-count
          placeholder="使用 Markdown 编写记忆正文"
          @update:value="updateBody"
        />
      </div>

      <div v-if="mode !== 'edit'" class="md-preview-pane">
        <div v-if="isEmpty" class="md-preview-empty">
          <NEmpty description="还没有正文">
            <template #extra>
              <p>切换到编辑开始写记忆，或先套用模板。</p>
              <NButton
                v-if="!isReadonly"
                size="small"
                type="primary"
                @click="setMode('edit')"
              >
                去编辑
              </NButton>
            </template>
          </NEmpty>
        </div>
        <div
          v-else
          class="md-preview-card"
          :class="renderStyle"
          v-html="preview.html"
        />
      </div>
    </div>

    <div class="md-footer">
      <span>{{ charCount }} / 20000</span>
      <span>
        {{
          mode === 'preview'
            ? '预览模式'
            : mode === 'edit'
              ? '编辑模式'
              : '分屏模式'
        }}
        <template v-if="isFullscreen"> · 全屏中，按 Esc 退出</template>
      </span>
    </div>
  </div>
</template>
