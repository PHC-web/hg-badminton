/**
 * 网页后台环境：
 * - npm run dev:h5 → 开发，允许账号密码
 * - npm run build:h5 / 正式托管 → 仅微信扫码
 */
export function isDevWebAdmin() {
  return import.meta.env.DEV === true
}

export function localWebLoginToken() {
  if (!import.meta.env.DEV) return ''
  return 'hg-dev-web-admin-v1'
}

export function withLocalWebToken(data = {}) {
  const localToken = localWebLoginToken()
  if (!localToken) return data
  return { ...data, localToken }
}
