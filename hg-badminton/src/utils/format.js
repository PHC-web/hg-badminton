import { MATCH_STATUS, TEAM_STATUS, FIXTURE_STATUS, APPLY_STATUS, ROLES } from './constants'

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

export function teamStatus(s) {
  return statusMeta(TEAM_STATUS, s)
}

export function fixtureStatus(s) {
  return statusMeta(FIXTURE_STATUS, s)
}

export function applyStatus(s) {
  return statusMeta(APPLY_STATUS, s)
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
  const list = user.viewRole ? [user.viewRole] : user.roles || []
  return roles.some((r) => list.includes(r))
}

export function isAdmin(user) {
  return hasAnyRole(user, ['super_admin', 'admin'])
}

export function isSuper(user) {
  return hasAnyRole(user, ['super_admin'])
}

export function daysUntil(ts) {
  if (!ts) return null
  const diff = new Date(ts).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}
