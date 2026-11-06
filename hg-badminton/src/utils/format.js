import {
  MATCH_STATUS,
  ACTIVITY_STATUS,
  REG_STATUS,
  FIXTURE_STATUS,
  MEMBER_STATUS,
  SPECTATOR_STATUS,
  ROLES,
  SUPER_ASSIGNABLE,
  ADMIN_ASSIGNABLE
} from './constants'

export function nid(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function formatDate(ts, withTime = false) {
  if (!ts) return ''
  const d = new Date(ts)
  const mm = `${d.getMonth() + 1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  if (!withTime) return `${mm}.${dd}`
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mi = `${d.getMinutes()}`.padStart(2, '0')
  return `${mm}.${dd} ${hh}:${mi}`
}

export function formatRange(start, end) {
  if (!start) return ''
  const a = formatDate(start)
  const b = end ? formatDate(end) : ''
  return b && b !== a ? `${a} - ${b}` : a
}

export function maskPhone(phone) {
  if (!phone) return ''
  return String(phone).replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
}

export function initial(name) {
  return (name || '?').slice(0, 1)
}

export function statusMeta(map, key) {
  return map[key] || { key, label: key || '未知', chip: 'gray' }
}

export function matchStatus(s) {
  return statusMeta(MATCH_STATUS, s)
}

export function activityStatus(s) {
  return statusMeta(ACTIVITY_STATUS, s)
}

function timeMs(value) {
  if (!value) return NaN
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? NaN : t
}

/** 展示用状态：报名截止、活动结束后覆盖库里的 open */
export function activityDisplayStatus(a) {
  if (!a || typeof a !== 'object') return activityStatus(a)
  const base = activityStatus(a.status)
  if (a.status && a.status !== 'open') return base
  const now = Date.now()
  const end = timeMs(a.endTime || a.startTime)
  if (!Number.isNaN(end) && now > end) {
    return { key: 'finished', label: '已结束', chip: 'gray' }
  }
  const regEnd = timeMs(a.registerEnd)
  if (!Number.isNaN(regEnd) && now > regEnd) {
    return { key: 'reg_ended', label: '已结束报名', chip: 'gray' }
  }
  return base
}

export function regStatus(s) {
  return statusMeta(REG_STATUS, s)
}

export function fixtureStatus(s) {
  return statusMeta(FIXTURE_STATUS, s)
}

export function memberStatus(s) {
  return statusMeta(MEMBER_STATUS, s)
}

export function spectatorStatus(s) {
  return statusMeta(SPECTATOR_STATUS, s)
}

export function roleLabel(key) {
  return ROLES[key]?.label || key
}

export function toast(title, icon = 'none') {
  uni.showToast({ title, icon, duration: 1800 })
}

export function confirm(content, title = '提示') {
  return new Promise((resolve) => {
    uni.showModal({
      title,
      content,
      success: (res) => resolve(!!res.confirm)
    })
  })
}

export function hasAnyRole(user, roles = []) {
  if (!user) return false
  return roles.some((r) => (user.roles || []).includes(r))
}

export function isAdmin(user) {
  return hasAnyRole(user, ['super_admin', 'admin'])
}

export function isSuper(user) {
  return hasAnyRole(user, ['super_admin'])
}

/** 是否已通过超管审核（可进入主功能） */
export function isUserApproved(user) {
  if (!user || user.isGuest) return false
  if (isSuper(user)) return true
  if (user.approveStatus === 'approved') return true
  // 兼容旧数据：已有姓名手机且从未进入审核流
  if (!user.approveStatus && user.phone && user.realName) return true
  return false
}

export function isCaptain(user) {
  return hasAnyRole(user, ['super_admin', 'admin', 'captain'])
}

export function isReferee(user) {
  return hasAnyRole(user, ['super_admin', 'admin', 'referee'])
}

export function assignableRoles(user) {
  if (isSuper(user)) return SUPER_ASSIGNABLE
  if (isAdmin(user)) return ADMIN_ASSIGNABLE
  return []
}

export function daysUntil(ts) {
  if (!ts) return null
  return Math.ceil((new Date(ts).getTime() - Date.now()) / 86400000)
}

export function genderCount(members = [], gender) {
  return members.filter((m) => m.status === 'active' && m.gender === gender).length
}
