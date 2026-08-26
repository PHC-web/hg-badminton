import { service } from '@/cloud/service'
import { loadDb } from '@/cloud/db'
import { USER_KEY, LOCAL_MIGRATED_KEY } from '@/utils/constants'

/**
 * 客户端方法 → 网关路由
 * 游客相关列表仍走本地 guest-catalog（见 call 内判断）
 */
const CLOUD_ROUTES = {
  wxLogin: ['base', 'wxLogin'],
  getProfile: ['base', 'getProfile'],
  updateProfile: ['base', 'updateProfile'],
  addContact: ['base', 'addContact'],
  listUsers: ['base', 'listUsers'],
  listPendingUsers: ['base', 'listPendingUsers'],
  approveUser: ['base', 'approveUser'],
  setUserRoles: ['base', 'setUserRoles'],
  setUserGroups: ['base', 'setUserGroups'],
  listGroups: ['base', 'listGroups'],
  getDefaultGroup: ['base', 'getDefaultGroup'],
  createGroup: ['base', 'createGroup'],
  updateGroup: ['base', 'updateGroup'],
  setDefaultGroup: ['base', 'setDefaultGroup'],
  deleteGroup: ['base', 'deleteGroup'],
  deleteUser: ['base', 'deleteUser'],
  importGroups: ['base', 'importGroups'],
  listNotifications: ['base', 'listNotifications'],

  listActivities: ['activity', 'listActivities'],
  getActivity: ['activity', 'getActivity'],
  createActivity: ['activity', 'createActivity'],
  updateActivity: ['activity', 'updateActivity'],
  deleteActivity: ['activity', 'deleteActivity'],
  registerActivity: ['activity', 'registerActivity'],
  cancelActivityRegistration: ['activity', 'cancelActivityRegistration'],
  getMyStats: ['activity', 'getMyStats'],
  importActivityBundle: ['activity', 'importBundle']
}

const SYNC_USER_ACTIONS = new Set([
  'wxLogin',
  'getProfile',
  'updateProfile',
  'setUserRoles',
  'setUserGroups',
  'addContact',
  'approveUser'
])

/** 游客仍走本地（体验目录） */
const GUEST_LOCAL_METHODS = new Set([
  'listActivities',
  'getActivity',
  'listMatches',
  'getMatch',
  'listFixtures',
  'getResults',
  'getFixture'
])

function ctx() {
  return { user: uni.getStorageSync(USER_KEY) || null }
}

function cloudReady() {
  try {
    return typeof uniCloud !== 'undefined' && typeof uniCloud.importObject === 'function'
  } catch (e) {
    return false
  }
}

function pickClientErr(e) {
  if (!e) return '操作失败'
  if (typeof e === 'string') return e
  const raw = e.errMsg || e.message || e.error?.message || e.error?.errMsg || ''
  const text = String(raw).trim()
  if (!text) return '操作失败'
  const lines = text.split(/[\n\r]+/).map((s) => s.trim()).filter(Boolean)
  return lines[lines.length - 1] || text
}

function toastErr(e) {
  uni.showToast({ title: pickClientErr(e).slice(0, 48), icon: 'none', duration: 2800 })
}

async function invokeGateway(serviceName, action, data) {
  const gateway = uniCloud.importObject('hg-gateway', { customUI: true })
  const user = ctx().user
  try {
    return await gateway.invoke({
      service: serviceName,
      action,
      data: data === undefined ? {} : data,
      _userId: user?._id || ''
    })
  } catch (e) {
    const msg = pickClientErr(e)
    const err = new Error(msg)
    err.raw = e
    throw err
  }
}

async function call(method, data) {
  const payload = data === undefined ? {} : data
  const route = CLOUD_ROUTES[method]
  const user = ctx().user
  const isGuest = !!(user && user.isGuest)

  if (
    route &&
    cloudReady() &&
    !(isGuest && method !== 'wxLogin') &&
    !(isGuest && GUEST_LOCAL_METHODS.has(method))
  ) {
    const [svc, action] = route
    try {
      const res = await invokeGateway(svc, action, payload)
      if (SYNC_USER_ACTIONS.has(method) && res && (res._id || res.openid)) {
        service.syncUser(res)
      }
      if (method === 'listUsers' && Array.isArray(res)) {
        res.forEach((u) => service.syncUser(u))
      }
      return res
    } catch (e) {
      toastErr(e)
      throw e
    }
  }

  try {
    const fn = service[method]
    if (!fn) throw new Error(`未知方法 ${method}`)
    return fn(payload, ctx())
  } catch (e) {
    toastErr(e)
    throw e
  }
}

/** 将本机本地库中的组别/活动/报名一次性导入云端（管理员） */
async function migrateLocalToCloud() {
  if (!cloudReady()) return { skipped: true, reason: 'cloud_unavailable' }
  if (uni.getStorageSync(LOCAL_MIGRATED_KEY)) return { skipped: true, reason: 'already' }
  const user = ctx().user
  if (!user || user.isGuest) return { skipped: true, reason: 'not_login' }

  const local = loadDb()
  const groups = local.groups || []
  const activities = (local.activities || []).filter((a) => a && !a.guestOnly)
  const registrations = local.activity_registrations || []

  try {
    if (groups.length) {
      await invokeGateway('base', 'importGroups', { groups })
    }
    if (activities.length || registrations.length) {
      await invokeGateway('activity', 'importBundle', { activities, registrations })
    }
    uni.setStorageSync(LOCAL_MIGRATED_KEY, Date.now())
    return {
      ok: true,
      groups: groups.length,
      activities: activities.length,
      registrations: registrations.length
    }
  } catch (e) {
    // 迁移失败不阻断使用；下次冷启动可再试
    return { ok: false, message: pickClientErr(e) }
  }
}

export const api = {
  init() {
    service.init()
  },
  cloudReady,
  call,
  migrateLocalToCloud,
  /** 直接走网关（调试/扩展用） */
  invoke: (serviceName, action, data) => invokeGateway(serviceName, action, data),

  login: () => {
    const e = new Error('请使用微信登录')
    toastErr(e)
    return Promise.reject(e)
  },
  wxLogin: (d) => call('wxLogin', d),
  getProfile: () => call('getProfile'),
  updateProfile: (d) => call('updateProfile', d),
  addContact: (d) => call('addContact', d),
  listUsers: () => call('listUsers'),
  listPendingUsers: () => call('listPendingUsers'),
  approveUser: (d) => call('approveUser', d),
  setUserRoles: (d) => call('setUserRoles', d),
  setUserGroups: (d) => call('setUserGroups', d),
  listGroups: () => call('listGroups'),
  getDefaultGroup: () => call('getDefaultGroup'),
  createGroup: (d) => call('createGroup', d),
  updateGroup: (d) => call('updateGroup', d),
  setDefaultGroup: (d) => call('setDefaultGroup', d),
  deleteGroup: (d) => call('deleteGroup', d),
  deleteUser: (d) => call('deleteUser', d),

  listActivities: (d) => call('listActivities', d),
  getActivity: (id) => call('getActivity', id),
  createActivity: (d) => call('createActivity', d),
  updateActivity: (d) => call('updateActivity', d),
  deleteActivity: (d) => call('deleteActivity', d),
  registerActivity: (d) => call('registerActivity', d),
  cancelActivityRegistration: (d) => call('cancelActivityRegistration', d),
  listNotifications: () => call('listNotifications'),
  getMyStats: () => call('getMyStats'),

  listMatches: (d) => call('listMatches', d),
  getMatch: (id) => call('getMatch', id),
  createMatch: (d) => call('createMatch', d),
  updateMatch: (d) => call('updateMatch', d),
  deleteMatch: (d) => call('deleteMatch', d),
  saveTeam: (d) => call('saveTeam', d),
  applyJoinTeam: (d) => call('applyJoinTeam', d),
  reviewTeamMember: (d) => call('reviewTeamMember', d),
  requestLeaveTeam: (d) => call('requestLeaveTeam', d),
  listTeams: (matchId) => call('listTeams', matchId),
  getMyTeam: (matchId) => call('getMyTeam', matchId),
  generateFixtures: (matchId) => call('generateFixtures', matchId),
  listFixtures: (matchId) => call('listFixtures', matchId),
  getFixture: (id) => call('getFixture', id),
  assignReferee: (d) => call('assignReferee', d),
  applySpectator: (d) => call('applySpectator', d),
  listSpectators: (d) => call('listSpectators', d),
  reviewSpectator: (d) => call('reviewSpectator', d),
  startSubFixture: (id) => call('startSubFixture', id),
  getSubFixture: (id) => call('getSubFixture', id),
  addPoint: (d) => call('addPoint', d),
  undoPoint: (id) => call('undoPoint', id),
  confirmSubFixture: (id) => call('confirmSubFixture', id),
  getResults: (matchId) => call('getResults', matchId),
  listReferees: () => call('listReferees'),
  myRefereeFixtures: () => call('myRefereeFixtures'),
  seedDemo: (force) => call('seedDemo', force)
}
