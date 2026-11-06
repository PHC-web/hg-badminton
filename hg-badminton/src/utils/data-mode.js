import { USE_LOCAL_SIM, DATA_MODE_KEY } from '@/utils/constants'

/**
 * 数据运行模式
 * - cloud（默认）：全部走 uniCloud，不写本地业务库
 * - local：全部走本地 storage（service + guest-catalog），用于离线/模拟调试
 *
 * 切换方式：
 * 1. 改 constants.js 里 USE_LOCAL_SIM = true（编译期强制本地）
 * 2. 运行时 setDataMode('local'|'cloud')（设置页开关，写入 storage）
 */

/**
 * 研发环境：微信开发版，或非小程序的 development 构建。
 * 体验版、正式版不暴露运行模式，并固定走云端。
 */
export function isDevEnv() {
  try {
    const env = uni.getAccountInfoSync?.()?.miniProgram?.envVersion
    if (env) return env === 'develop'
  } catch (e) {
    /* ignore */
  }
  return process.env.NODE_ENV !== 'production'
}

export function getDataMode() {
  if (USE_LOCAL_SIM) return 'local'
  if (!isDevEnv()) return 'cloud'
  try {
    const m = uni.getStorageSync(DATA_MODE_KEY)
    if (m === 'local' || m === 'cloud') return m
  } catch (e) {
    /* ignore */
  }
  return 'cloud'
}

export function isLocalSim() {
  return getDataMode() === 'local'
}

export function isCloudMode() {
  return getDataMode() === 'cloud'
}

/** @param {'cloud'|'local'} mode */
export function setDataMode(mode) {
  if (!isDevEnv() && !USE_LOCAL_SIM) {
    throw new Error('正式环境不可切换运行模式')
  }
  if (USE_LOCAL_SIM && mode !== 'local') {
    throw new Error('已开启编译期本地模拟（USE_LOCAL_SIM），无法切回云端')
  }
  if (mode !== 'cloud' && mode !== 'local') {
    throw new Error('无效模式')
  }
  uni.setStorageSync(DATA_MODE_KEY, mode)
  return mode
}
