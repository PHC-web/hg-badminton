import { service } from '@/cloud/service'
import { loadDb } from '@/cloud/db'
import { getUniCloud, hasCloudClient, isHxCliCloudError, spaceMissingMessage } from '@/cloud/unicloud'
import { USER_KEY, LOCAL_MIGRATED_KEY, LOCAL_MATCH_MIGRATED_KEY } from '@/utils/constants'
import { getDataMode, isLocalSim, isCloudMode, setDataMode } from '@/utils/data-mode'
import { isDevWebAdmin, withLocalWebToken } from '@/utils/web-env'

/**
 * 客户端方法 → 网关路由
 * 默认全部上云；仅本地模拟模式（USE_LOCAL_SIM / DATA_MODE_KEY=local）走本地 service
 */
const CLOUD_ROUTES = {
  wxLogin: ['base', 'wxLogin'],
  webPasswordLogin: ['base', 'webPasswordLogin'],
  createWebLoginTicket: ['base', 'createWebLoginTicket'],
  pollWebLoginTicket: ['base', 'pollWebLoginTicket'],
  confirmWebLogin: ['base', 'confirmWebLogin'],
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
  importActivityBundle: ['activity', 'importBundle'],

  listMatches: ['match', 'listMatches'],
  getMatch: ['match', 'getMatch'],
  createMatch: ['match', 'createMatch'],
  updateMatch: ['match', 'updateMatch'],
  deleteMatch: ['match', 'deleteMatch'],
  saveTeam: ['match', 'saveTeam'],
  importMatchTeams: ['match', 'importMatchTeams'],
  importTeamMembers: ['match', 'importTeamMembers'],
  deleteTeam: ['match', 'deleteTeam'],
  applyJoinTeam: ['match', 'applyJoinTeam'],
  reviewTeamMember: ['match', 'reviewTeamMember'],
  requestLeaveTeam: ['match', 'requestLeaveTeam'],
  listTeams: ['match', 'listTeams'],
  getMyTeam: ['match', 'getMyTeam'],
  generateFixtures: ['match', 'generateFixtures'],
  listScheduleSlots: ['match', 'listScheduleSlots'],
  saveScheduleSlot: ['match', 'saveScheduleSlot'],
  deleteScheduleSlot: ['match', 'deleteScheduleSlot'],
  listAssignableGames: ['match', 'listAssignableGames'],
  listFixtures: ['match', 'listFixtures'],
  getFixture: ['match', 'getFixture'],
  assignReferee: ['match', 'assignReferee'],
  assignSubFixture: ['match', 'assignSubFixture'],
  updateFixtureSchedule: ['match', 'updateFixtureSchedule'],
  submitSubLineup: ['match', 'submitSubLineup'],
  clearSubLineup: ['match', 'clearSubLineup'],
  getBracketTable: ['match', 'getBracketTable'],
  applySpectator: ['match', 'applySpectator'],
  listSpectators: ['match', 'listSpectators'],
  reviewSpectator: ['match', 'reviewSpectator'],
  startSubFixture: ['match', 'startSubFixture'],
  getSubFixture: ['match', 'getSubFixture'],
  addPoint: ['match', 'addPoint'],
  undoPoint: ['match', 'undoPoint'],
  confirmSubFixture: ['match', 'confirmSubFixture'],
  getResults: ['match', 'getResults'],
  listReferees: ['match', 'listReferees'],
  myRefereeFixtures: ['match', 'myRefereeFixtures'],
  setMatchReferees: ['match', 'setMatchReferees'],
  importMatchBundle: ['match', 'importBundle']
}

function ctx() {
  return { user: uni.getStorageSync(USER_KEY) || null }
}

function cloudReady() {
  return hasCloudClient()
}

function stripCloudFnName(text) {
  let s = String(text || '')
  let prev = ''
  while (s !== prev) {
    prev = s
    s = s.replace(/^\s*\[[^\]]+\]\s*[:：]\s*/, '')
  }
  s = s.replace(/云函数\s*[a-zA-Z0-9_-]+/g, '')
  s = s.replace(/\bhg-(?:gateway|base|activity|match|api|shared|core|config)\b/gi, '')
  return s.replace(/\s{2,}/g, ' ').replace(/^[:：,\s]+/, '').trim()
}

function pickClientErr(e) {
  if (!e) return '操作失败'
  if (typeof e === 'string') return stripCloudFnName(e) || '操作失败'
  const raw = e.errMsg || e.message || e.error?.message || e.error?.errMsg || ''
  const text = stripCloudFnName(raw)
  if (!text) return '操作失败'
  const lines = text.split(/[\n\r]+/).map((s) => stripCloudFnName(s)).filter(Boolean)
  return lines[lines.length - 1] || text
}

function toastErr(e) {
  uni.showToast({ title: pickClientErr(e).slice(0, 48), icon: 'none', duration: 2800 })
}

async function invokeGateway(serviceName, action, data) {
  const cloud = getUniCloud()
  if (!cloud || typeof cloud.importObject !== 'function') {
    throw new Error(spaceMissingMessage())
  }
  let gateway
  try {
    gateway = cloud.importObject('hg-gateway', { customUI: true })
  } catch (e) {
    throw new Error(isHxCliCloudError(e) ? spaceMissingMessage() : pickClientErr(e))
  }
  const user = ctx().user
  try {
    return await gateway.invoke({
      service: serviceName,
      action,
      data: data === undefined ? {} : data,
      _userId: user?._id || ''
    })
  } catch (e) {
    let msg = isHxCliCloudError(e) ? spaceMissingMessage() : pickClientErr(e)
    if (action === 'webPasswordLogin' && /未知动作/.test(msg)) {
      msg = '请先上传最新的云端代码后再试'
    }
    const err = new Error(msg)
    err.raw = e
    throw err
  }
}

async function callLocal(method, payload) {
  const fn = service[method]
  if (!fn) throw new Error(`未知方法 ${method}`)
  return fn(payload, ctx())
}

async function call(method, data) {
  const payload = data === undefined ? {} : data

  // —— 本地全模拟 ——
  if (isLocalSim()) {
    try {
      return await callLocal(method, payload)
    } catch (e) {
      toastErr(e)
      throw e
    }
  }

  // —— 云端模式：禁止回落到本地业务库 ——
  const route = CLOUD_ROUTES[method]
  if (!route) {
    // 仅本地工具方法（如 seedDemo / localDevLogin）
    if (method === 'seedDemo' || method === 'localDevLogin') {
      try {
        return await callLocal(method, payload)
      } catch (e) {
        toastErr(e)
        throw e
      }
    }
    const err = new Error(`云端未支持：${method}`)
    toastErr(err)
    throw err
  }

  if (!cloudReady()) {
    const err = new Error(spaceMissingMessage())
    toastErr(err)
    throw err
  }

  const user = ctx().user
  if (
    user?.isGuest &&
    !['wxLogin', 'webPasswordLogin', 'createWebLoginTicket', 'pollWebLoginTicket'].includes(method)
  ) {
    const err = new Error('请先微信登录')
    toastErr(err)
    throw err
  }

  if (method === 'webPasswordLogin' && !isDevWebAdmin()) {
    const err = new Error('正式环境仅支持微信扫码登录')
    toastErr(err)
    throw err
  }

  const [svc, action] = route
  const cloudPayload = ['webPasswordLogin', 'createWebLoginTicket'].includes(method)
    ? withLocalWebToken(payload)
    : payload
  try {
    return await invokeGateway(svc, action, cloudPayload)
  } catch (e) {
    toastErr(e)
    throw e
  }
}

/** 将本机本地库中的组别/活动/报名一次性导入云端 */
async function migrateLocalToCloud() {
  if (isLocalSim()) return { skipped: true, reason: 'local_sim' }
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

/** 将本机本地比赛数据一次性导入云端 */
async function migrateLocalMatchesToCloud() {
  if (isLocalSim()) return { skipped: true, reason: 'local_sim' }
  if (!cloudReady()) return { skipped: true, reason: 'cloud_unavailable' }
  if (uni.getStorageSync(LOCAL_MATCH_MIGRATED_KEY)) return { skipped: true, reason: 'already' }
  const user = ctx().user
  if (!user || user.isGuest) return { skipped: true, reason: 'not_login' }
  const roles = user.roles || []
  if (!roles.some((r) => ['admin', 'super_admin'].includes(r))) {
    return { skipped: true, reason: 'not_admin' }
  }

  const local = loadDb()
  const matches = (local.matches || []).filter((m) => m && !m.guestOnly && !m.deleted)
  const matchIds = new Set(matches.map((m) => m._id))
  const match_items = (local.match_items || []).filter((i) => matchIds.has(i.matchId))
  const teams = (local.teams || []).filter((t) => matchIds.has(t.matchId))
  const fixtures = (local.fixtures || []).filter((f) => matchIds.has(f.matchId))
  const fixtureIds = new Set(fixtures.map((f) => f._id))
  const sub_fixtures = (local.sub_fixtures || []).filter((s) => fixtureIds.has(s.fixtureId))
  const match_spectators = (local.match_spectators || []).filter((s) => matchIds.has(s.matchId))
  const subIds = new Set(sub_fixtures.map((s) => s._id))
  const score_logs = (local.score_logs || []).filter((l) => subIds.has(l.subFixtureId))

  const empty =
    !matches.length &&
    !match_items.length &&
    !teams.length &&
    !fixtures.length &&
    !sub_fixtures.length

  try {
    if (!empty) {
      await invokeGateway('match', 'importBundle', {
        matches,
        match_items,
        teams,
        fixtures,
        sub_fixtures,
        match_spectators,
        score_logs
      })
    }
    uni.setStorageSync(LOCAL_MATCH_MIGRATED_KEY, Date.now())
    return {
      ok: true,
      matches: matches.length,
      teams: teams.length,
      fixtures: fixtures.length,
      sub_fixtures: sub_fixtures.length
    }
  } catch (e) {
    return { ok: false, message: pickClientErr(e) }
  }
}

export const api = {
  init() {
    service.init()
  },
  cloudReady,
  isLocalSim,
  isCloudMode,
  getDataMode,
  setDataMode,
  call,
  migrateLocalToCloud,
  migrateLocalMatchesToCloud,
  /** 直接走网关（调试/扩展用） */
  invoke: (serviceName, action, data) => invokeGateway(serviceName, action, data),

  login: () => {
    const e = new Error('请使用微信登录')
    toastErr(e)
    return Promise.reject(e)
  },
  /** 本地模拟：注入演示数据并以超管登录 */
  localDevLogin: () => call('localDevLogin'),
  webPasswordLogin: (d) => call('webPasswordLogin', d),
  wxLogin: (d) => call('wxLogin', d),
  createWebLoginTicket: () => call('createWebLoginTicket'),
  pollWebLoginTicket: (d) => call('pollWebLoginTicket', d),
  confirmWebLogin: (d) => call('confirmWebLogin', d),
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
  importMatchTeams: (d) => call('importMatchTeams', d),
  importTeamMembers: (d) => call('importTeamMembers', d),
  deleteTeam: (d) => call('deleteTeam', d),
  applyJoinTeam: (d) => call('applyJoinTeam', d),
  reviewTeamMember: (d) => call('reviewTeamMember', d),
  requestLeaveTeam: (d) => call('requestLeaveTeam', d),
  listTeams: (matchId) => call('listTeams', matchId),
  getMyTeam: (matchId) => call('getMyTeam', matchId),
  generateFixtures: (matchId) => call('generateFixtures', matchId),
  listScheduleSlots: (d) => call('listScheduleSlots', d),
  saveScheduleSlot: (d) => call('saveScheduleSlot', d),
  deleteScheduleSlot: (d) => call('deleteScheduleSlot', d),
  listAssignableGames: (d) => call('listAssignableGames', d),
  listFixtures: (matchId) => call('listFixtures', matchId),
  getFixture: (id) => call('getFixture', id),
  assignReferee: (d) => call('assignReferee', d),
  assignSubFixture: (d) => call('assignSubFixture', d),
  updateFixtureSchedule: (d) => call('updateFixtureSchedule', d),
  submitSubLineup: (d) => call('submitSubLineup', d),
  clearSubLineup: (d) => call('clearSubLineup', d),
  getBracketTable: (matchId) => call('getBracketTable', matchId),
  applySpectator: (d) => call('applySpectator', d),
  listSpectators: (d) => call('listSpectators', d),
  reviewSpectator: (d) => call('reviewSpectator', d),
  startSubFixture: (id) => call('startSubFixture', id),
  getSubFixture: (id) => call('getSubFixture', id),
  addPoint: (d) => call('addPoint', d),
  undoPoint: (id) => call('undoPoint', id),
  confirmSubFixture: (id) => call('confirmSubFixture', id),
  getResults: (matchId) => call('getResults', matchId),
  listReferees: (d) => call('listReferees', d),
  myRefereeFixtures: () => call('myRefereeFixtures'),
  setMatchReferees: (d) => call('setMatchReferees', d),
  seedDemo: (force) => call('seedDemo', force)
}
