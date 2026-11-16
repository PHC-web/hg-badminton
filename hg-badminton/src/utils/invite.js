import { INVITE_RETURN_KEY } from '@/utils/constants'

export function decodeScene(raw) {
  let s = String(raw || '')
  for (let i = 0; i < 2; i++) {
    try {
      const next = decodeURIComponent(s)
      if (next === s) break
      s = next
    } catch (e) {
      break
    }
  }
  return s.trim()
}

export function activityIdFromQuery(q = {}) {
  if (q.id) return String(q.id)
  if (q.scene) return decodeScene(q.scene)
  return ''
}

export function isInviteEntry(q = {}) {
  return q.from === 'invite' || !!q.scene
}

export function saveInviteReturn(activityId) {
  if (!activityId) return
  uni.setStorageSync(INVITE_RETURN_KEY, activityId)
}

export function takeInviteReturn() {
  const id = uni.getStorageSync(INVITE_RETURN_KEY) || ''
  if (id) uni.removeStorageSync(INVITE_RETURN_KEY)
  return id
}

export function captureInviteLaunch(options) {
  const path = String(options?.path || '')
  const scene = options?.query?.scene
  if (!scene || path.indexOf('activity/register') < 0) return
  saveInviteReturn(decodeScene(scene))
}

export function mpEnvVersion() {
  try {
    const v = uni.getAccountInfoSync?.().miniProgram?.envVersion
    if (v === 'develop' || v === 'trial' || v === 'release') return v
  } catch (e) {
    /* 非微信环境 */
  }
  return 'release'
}
