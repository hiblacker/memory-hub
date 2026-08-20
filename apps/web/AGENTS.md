# Web frontend notes

- Global product styles live in `src/styles/*.less`. Do not add new `.css` files.
- Vue SFC component styles must use `<style lang="less" scoped>`.
- Import tokens with `@import '@styles/tokens.less';` or a relative path to `src/styles/tokens.less`.
- Theme colors come from Less variables in `tokens.less`, which also emit `--mh-*` CSS custom properties.
- Nest at most 3 levels. Prefer class prefixes (`.md-`, `.detail-`, `.nav-`) over deep nesting.
- Do not hard-code theme colors in Vue templates or new Less files; use `@mh-*` or `var(--mh-*)`.
