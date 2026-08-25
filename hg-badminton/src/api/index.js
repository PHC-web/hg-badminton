import { service } from '@/cloud/service'
import { USE_CLOUD_KEY, USER_KEY } from '@/utils/constants'

function ctx() {
  return { user: uni.getStorageSync(USER_KEY) || null }
}

function useCloud() {
  try {
    return !!uni.getStorageSync(USE_CLOUD_KEY) && typeof uniCloud !== 'undefined' && uniCloud.importObject
  } catch (e) {
    return false
  }
}

async function call(method, data) {
  if (useCloud()) {
    const obj = uniCloud.importObject('hg-api')
    const user = ctx().user
    return await obj[method]({ ...(data || {}), _userId: user?._id })
  }
  try {
    const fn = service[method]
    if (!fn) throw new Error(`未知方法 ${method}`)
    return fn(data, ctx())
  } catch (e) {
    const msg = e?.message || '操作失败'
    uni.showToast({ title: msg, icon: 'none' })
    throw e
  }
}

export const api = {
  init() {
    service.init()
  },
  call,
  login: (d) => call('login', d),
  wxLogin: (d) => call('wxLogin', d),
  getProfile: () => call('getProfile'),
  updateProfile: (d) => call('updateProfile', d),
  switchViewRole: (role) => call('switchViewRole', role),
  listUsers: () => call('listUsers'),
  setUserRoles: (d) => call('setUserRoles', d),
  stats: () => call('stats'),
  listMatches: (d) => call('listMatches', d),
  getMatch: (id) => call('getMatch', id),
  verifyPassword: (d) => call('verifyPassword', d),
  createMatch: (d) => call('createMatch', d),
  updateMatch: (d) => call('updateMatch', d),
  publishMatch: (id) => call('publishMatch', id),
  closeMatch: (id) => call('closeMatch', id),
  deleteMatch: (id) => call('deleteMatch', id),
  getMyTeam: (matchId) => call('getMyTeam', matchId),
  saveTeam: (d) => call('saveTeam', d),
  listTeams: (matchId) => call('listTeams', matchId),
  reviewTeam: (d) => call('reviewTeam', d),
  generateFixtures: (matchId) => call('generateFixtures', matchId),
  listFixtures: (matchId) => call('listFixtures', matchId),
  getFixture: (id) => call('getFixture', id),
  assignReferee: (d) => call('assignReferee', d),
  startSubFixture: (id) => call('startSubFixture', id),
  getSubFixture: (id) => call('getSubFixture', id),
  addPoint: (d) => call('addPoint', d),
  undoPoint: (id) => call('undoPoint', id),
  confirmSubFixture: (id) => call('confirmSubFixture', id),
  getResults: (matchId) => call('getResults', matchId),
  listPhotos: (d) => call('listPhotos', d),
  addPhoto: (d) => call('addPhoto', d),
  deletePhoto: (id) => call('deletePhoto', id),
  featurePhoto: (id) => call('featurePhoto', id),
  applyRole: (d) => call('applyRole', d),
  listMyApplications: () => call('listMyApplications'),
  listApplications: (d) => call('listApplications', d),
  reviewApplication: (d) => call('reviewApplication', d),
  listReferees: () => call('listReferees'),
  myRefereeFixtures: () => call('myRefereeFixtures'),
  seedDemo: (force) => call('seedDemo', force)
}
