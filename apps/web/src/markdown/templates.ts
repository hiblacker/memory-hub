import type { MemoryType, RenderStyle } from '@memory-hub/contracts'

function heading(emoji: string, text: string, enabled: boolean) {
  return enabled ? `${emoji} ${text}` : text
}

export function buildMemoryTemplate(input: {
  title: string
  memoryType: MemoryType
  renderStyle: RenderStyle
  emojiEnabled: boolean
  existingBody?: string
}): string {
  const title = input.title.trim() || '未命名记忆'
  const existing = input.existingBody?.trim()
  const seed = existing || '在这里补充细节…'
  const e = input.emojiEnabled

  if (input.renderStyle === 'tech_clean') {
    switch (input.memoryType) {
      case 'decision':
        return [
          `# ${heading('🧩', title, e)}`,
          '',
          `> ${heading('✅', '结论：', e)}补充决策结论`,
          '',
          `## ${heading('📌', '背景', e)}`,
          seed,
          '',
          `## ${heading('🔍', '关键细节', e)}`,
          '- 细节 1',
          '- 细节 2',
          '',
          `## ${heading('⚠️', '约束与影响', e)}`,
          '- 影响点',
        ].join('\n')
      case 'todo':
        return [
          `# ${heading('🧩', title, e)}`,
          '',
          `> ${heading('✅', '目标：', e)}补充目标`,
          '',
          `## ${heading('📌', '步骤', e)}`,
          '- [ ] 步骤 1',
          '- [ ] 步骤 2',
          '',
          `## ${heading('⚠️', '风险与阻塞', e)}`,
          seed,
        ].join('\n')
      default:
        return [
          `# ${heading('🧩', title, e)}`,
          '',
          `> ${heading('✅', '结论：', e)}一句话说明`,
          '',
          `## ${heading('📌', '背景', e)}`,
          seed,
          '',
          `## ${heading('🔍', '关键细节', e)}`,
          '- 要点 1',
          '- 要点 2',
          '',
          `## ${heading('⚠️', '约束与影响', e)}`,
          '- 需要注意的点',
        ].join('\n')
    }
  }

  switch (input.memoryType) {
    case 'preference':
      return [
        `# ${heading('🌟', title, e)}`,
        '',
        `> ${heading('💡', '一句话：', e)}补充偏好结论`,
        '',
        `## ${heading('📌', '适用场景', e)}`,
        seed,
        '',
        `## ${heading('🧠', '为什么重要', e)}`,
        '- 原因 1',
        '',
        `## ${heading('✅', '后续可执行', e)}`,
        '- [ ] 保持该偏好并在相关项目应用',
      ].join('\n')
    case 'decision':
      return [
        `# ${heading('🌟', title, e)}`,
        '',
        `> ${heading('💡', '一句话：', e)}补充决策结论`,
        '',
        `## ${heading('📌', '关键点', e)}`,
        seed,
        '',
        `## ${heading('🧠', '取舍与原因', e)}`,
        '- 选择 A 的原因',
        '',
        `## ${heading('✅', '后续可执行', e)}`,
        '- [ ] 同步相关方',
      ].join('\n')
    case 'todo':
      return [
        `# ${heading('🌟', title, e)}`,
        '',
        `> ${heading('💡', '一句话：', e)}补充目标`,
        '',
        `## ${heading('📌', '关键点', e)}`,
        seed,
        '',
        `## ${heading('✅', '后续可执行', e)}`,
        '- [ ] 第一步',
        '- [ ] 第二步',
      ].join('\n')
    default:
      return [
        `# ${heading('🌟', title, e)}`,
        '',
        `> ${heading('💡', '一句话：', e)}用一句话概括这条记忆`,
        '',
        `## ${heading('📌', '关键点', e)}`,
        seed,
        '',
        `## ${heading('🧠', '为什么重要', e)}`,
        '- 补充背景或影响',
        '',
        `## ${heading('✅', '后续可执行', e)}`,
        '- [ ] 可选行动项',
      ].join('\n')
  }
}

export const QUICK_EMOJIS = ['🌟', '💡', '📌', '🧠', '✅', '⚠️', '🧩', '🔍'] as const
