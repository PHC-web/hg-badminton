let cloudInstance = null

function readH5Space() {
  const spaceId = import.meta.env.VITE_UNICLOUD_SPACE_ID
  const clientSecret = import.meta.env.VITE_UNICLOUD_CLIENT_SECRET
  const endpoint = import.meta.env.VITE_UNICLOUD_ENDPOINT || 'https://api.next.bspapp.com'
  if (!spaceId || !clientSecret) return null
  return {
    provider: 'aliyun',
    spaceId,
    clientSecret,
    endpoint
  }
}

/** CLI 跑 H5 时默认 uniCloud 未关联空间，需 init 后再 importObject */
export function getUniCloud() {
  if (cloudInstance) return cloudInstance
  // #ifdef H5
  try {
    const space = readH5Space()
    if (space && typeof uniCloud !== 'undefined' && typeof uniCloud.init === 'function') {
      cloudInstance = uniCloud.init(space)
      return cloudInstance
    }
  } catch (e) {
    console.warn('[unicloud] H5 init failed', e)
  }
  // #endif
  cloudInstance = typeof uniCloud !== 'undefined' ? uniCloud : null
  return cloudInstance
}

export function hasCloudClient() {
  try {
    const cloud = getUniCloud()
    return !!(cloud && typeof cloud.importObject === 'function')
  } catch (e) {
    return false
  }
}

export function isHxCliCloudError(e) {
  const text = String(e?.errMsg || e?.message || e || '')
  return text.includes('HBuilderX的运行菜单') || text.includes('关联服务空间')
}

export function spaceMissingMessage() {
  return '网页未连接云服务。请配置项目根目录 .env.local 后重新运行 npm run dev:h5'
}
