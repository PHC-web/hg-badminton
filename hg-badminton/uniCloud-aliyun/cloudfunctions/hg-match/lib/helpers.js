'use strict'

const core = require('hg-core')
const { db, fail, nid, nowIso, getUser, needUser, createHandler, toTs } = require('hg-shared')

const {
  isAdmin,
  hasAnyRole,
  genderCount,
  DEFAULT_ITEMS,
  sanitizeMatchItems,
  sanitizeTeamRule,
  normalizeConcurrent,
  scheduleRoundRobin,
  planRoundRobin,
  formatCourtLabel,
  nextMatchNo,
  makeFixtureCode,
  makeGameCode,
  slotDateTime,
  rankingFromFixtures,
  judgeSetEnd,
  tallySets,
  judgeTeamWinner,
  itemGenderNeed,
  validateTeamConcurrent
} = core

function pickId(data, keys = ['id']) {
  if (typeof data === 'string') return data
  if (!data || typeof data !== 'object') return ''
  for (const k of keys) {
    if (data[k]) return data[k]
  }
  return ''
}

async function getById(name, id) {
  if (!id) return null
  try {
    const { data } = await db.collection(name).doc(id).get()
    return data[0] || null
  } catch (e) {
    return null
  }
}

async function listCol(name, whereObj, limit = 500) {
  try {
    let q = db.collection(name)
    if (whereObj) q = q.where(whereObj)
    const { data } = await q.limit(limit).get()
    return data || []
  } catch (e) {
    return []
  }
}

async function setDoc(collection, id, fields) {
  const { _id, ...rest } = fields
  await db.collection(collection).doc(id).set({ ...rest })
  return { _id: id, ...rest }
}

async function upd(collection, id, patch) {
  await db.collection(collection).doc(id).update(patch)
  return getById(collection, id)
}

async function rem(collection, id) {
  await db.collection(collection).doc(id).remove()
}

async function needAdmin(userId) {
  const u = await needUser(userId)
  if (!isAdmin(u)) fail('需要管理员权限')
  return u
}

function activeMembers(team) {
  return (team.members || []).filter((m) => m.status === 'active')
}

async function userName(id, cache = {}) {
  if (!id) return '未知'
  if (cache[id]) return cache[id]
  const u = await getUser(id)
  const name = u?.nickname || u?.realName || '未知'
  cache[id] = name
  return name
}

function teamCaptainName(t) {
  if (t.captainName) return t.captainName
  const cap = (t.members || []).find((m) => m.isCaptain)
  if (cap?.name) return cap.name
  return ''
}

async function pushNotify(userId, title, content, extra = {}) {
  if (!userId) return
  try {
    await db.collection('notifications').add({
      _id: nid('n_'),
      userId,
      title,
      content,
      extra,
      read: false,
      createdAt: nowIso()
    })
  } catch (e) {
    /* 通知表可能未建 */
  }
}

async function hydrateMatch(m) {
  if (!m) return null
  const items = (await listCol('match_items', { matchId: m._id })).sort((a, b) => (a.sort || 0) - (b.sort || 0))
  const teams = await listCol('teams', { matchId: m._id })
  const fixtures = await listCol('fixtures', { matchId: m._id })
  return {
    ...m,
    items,
    teamCount: teams.length,
    fixtureCount: fixtures.length,
    memberCount: teams.reduce((n, t) => n + activeMembers(t).length, 0)
  }
}

function teamSideOfUser(user, team) {
  if (!user || !team) return ''
  if (isAdmin(user)) return ''
  if (team.captainId === user._id) return 'captain'
  if ((team.members || []).some((m) => m.userId === user._id && m.status === 'active')) return 'member'
  return ''
}

function resolvePlayers(team, ids = []) {
  const map = Object.fromEntries((team?.members || []).map((m) => [m.id, m]))
  return (ids || []).map((id) => {
    const m = map[id]
    return m
      ? { id: m.id, userId: m.userId || '', name: m.name, gender: m.gender || 'male' }
      : { id, userId: '', name: '未知', gender: 'male' }
  })
}

function canSubmitLineupForTeam(user, team) {
  if (!user || !team) return false
  if (isAdmin(user)) return true
  if (team.captainId === user._id) return true
  return false
}

async function hydrateFixture(f, viewer = null, nameCache = {}) {
  if (!f) return null
  const teamA = await getById('teams', f.teamAId)
  const teamB = await getById('teams', f.teamBId)
  const subs = (await listCol('sub_fixtures', { fixtureId: f._id })).sort((a, b) =>
    String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
  )
  const items = await listCol('match_items', { matchId: f.matchId })
  const itemMap = Object.fromEntries(items.map((i) => [i._id, i]))

  const viewerOnA = viewer && teamSideOfUser(viewer, teamA) !== ''
  const viewerOnB = viewer && teamSideOfUser(viewer, teamB) !== ''

  const subFixtures = []
  for (const s of subs) {
    const both = !!s.lineupASubmitted && !!s.lineupBSubmitted
    const canShowA = both || viewerOnA
    const canShowB = both || viewerOnB
    const playersA = canShowA ? s.playersA || resolvePlayers(teamA, s.playerAIds) : []
    const playersB = canShowB ? s.playersB || resolvePlayers(teamB, s.playerBIds) : []
    const refNames = []
    for (const rid of s.refereeIds || []) {
      refNames.push(await userName(rid, nameCache))
    }
    subFixtures.push({
      ...s,
      itemName: itemMap[s.itemId]?.name || '单项',
      itemSort: itemMap[s.itemId]?.sort || 99,
      memberCount: itemMap[s.itemId]?.memberCount || 1,
      refereeNames: refNames.filter(Boolean).join('、'),
      setText: (s.sets || [])
        .filter((x) => x.winner || (x.aScore && x.bScore))
        .map((x) => `${x.aScore}:${x.bScore}`)
        .join(' · '),
      lineupBothReady: both,
      lineupASubmitted: !!s.lineupASubmitted,
      lineupBSubmitted: !!s.lineupBSubmitted,
      playerAIds: canShowA ? s.playerAIds || [] : [],
      playerBIds: canShowB ? s.playerBIds || [] : [],
      playersA,
      playersB,
      playerAText: canShowA
        ? playersA.map((p) => p.name).join(' / ') || (s.lineupASubmitted ? '已提交' : '未提交')
        : s.lineupASubmitted
          ? '已提交（待双方确认后公开）'
          : '未提交',
      playerBText: canShowB
        ? playersB.map((p) => p.name).join(' / ') || (s.lineupBSubmitted ? '已提交' : '未提交')
        : s.lineupBSubmitted
          ? '已提交（待双方确认后公开）'
          : '未提交',
      canSubmitA: !!(viewer && canSubmitLineupForTeam(viewer, teamA)),
      canSubmitB: !!(viewer && canSubmitLineupForTeam(viewer, teamB))
    })
  }
  subFixtures.sort((a, b) => a.itemSort - b.itemSort)

  const fixtureRefNames = []
  for (const rid of f.refereeIds || []) {
    fixtureRefNames.push(await userName(rid, nameCache))
  }
  const subRefNames = subFixtures.flatMap((s) => (s.refereeNames ? s.refereeNames.split('、') : []))
  const allRef = Array.from(new Set([...fixtureRefNames.filter(Boolean), ...subRefNames.filter(Boolean)]))

  return {
    ...f,
    teamAName: teamA?.name || '待定',
    teamBName: teamB?.name || '待定',
    refereeNames: allRef.join('、'),
    subFixtures,
    viewerOnA,
    viewerOnB
  }
}

async function canViewMatch(matchId, user) {
  if (!user) return false
  // 超管/管理员：任意比赛内容不受限
  if (isAdmin(user)) return true
  const match = await getById('matches', matchId)
  if (!match || match.deleted) return false
  // 本场指定裁判
  if ((match.refereeIds || []).includes(user._id)) return true
  // 本场队长 / 有效队员
  const teams = await listCol('teams', { matchId })
  const inTeam = teams.some(
    (t) =>
      t.captainId === user._id ||
      (t.members || []).some((m) => m.userId === user._id && m.status === 'active')
  )
  if (inTeam) return true
  // 兼容：曾被指派到具体场次/小项的裁判
  const fixtures = await listCol('fixtures', { matchId })
  if (fixtures.some((f) => (f.refereeIds || []).includes(user._id))) return true
  for (const f of fixtures) {
    const subs = await listCol('sub_fixtures', { fixtureId: f._id })
    if (subs.some((s) => (s.refereeIds || []).includes(user._id))) return true
  }
  // 审批通过的观众
  const sps = await listCol('match_spectators', { matchId, userId: user._id })
  return sps.some((s) => s.status === 'approved')
}

async function createSubFixtures(fixture, match) {
  const items = (await listCol('match_items', { matchId: match._id })).sort((a, b) => (a.sort || 0) - (b.sort || 0))
  const seen = {}
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]
    seen[item.name] = (seen[item.name] || 0) + 1
    const id = nid('sf_')
    await setDoc('sub_fixtures', id, {
      fixtureId: fixture._id,
      itemId: item._id,
      code: makeGameCode(fixture.code, item.name, seen[item.name]),
      playerAIds: [],
      playerBIds: [],
      venue: '',
      scheduleTime: '',
      slotId: '',
      courtNo: 0,
      refereeIds: [],
      playersA: [],
      playersB: [],
      lineupASubmitted: false,
      lineupBSubmitted: false,
      status: 'pending',
      currentSet: 1,
      sets: [{ aScore: 0, bScore: 0, winner: '' }],
      winner: '',
      createdAt: nowIso()
    })
  }
}

async function canRefereeFixture(u, fixture, sub, match) {
  if (!u) return false
  if (isAdmin(u)) return true
  const m = match || (fixture?.matchId ? await getById('matches', fixture.matchId) : null)
  // 本场裁判池内即可执裁
  if (m && (m.refereeIds || []).includes(u._id)) return true
  if (sub && (sub.refereeIds || []).includes(u._id)) return true
  if ((fixture.refereeIds || []).includes(u._id)) return true
  return false
}

function isMatchReferee(match, userId) {
  return !!(match && userId && (match.refereeIds || []).includes(userId))
}

async function refreshFixtureResult(fixtureId) {
  const f = await getById('fixtures', fixtureId)
  if (!f) return
  const match = await getById('matches', f.matchId)
  const subs = await listCol('sub_fixtures', { fixtureId })
  const items = await listCol('match_items', { matchId: match._id })
  const r = judgeTeamWinner(subs, match.teamRule, items.length)
  const patch = {
    result: {
      winnerTeamId: r.winner === 'a' ? f.teamAId : r.winner === 'b' ? f.teamBId : '',
      teamAScore: r.aScore,
      teamBScore: r.bScore
    }
  }
  if (r.locked && r.winner) patch.status = 'finished'
  else if (subs.some((s) => s.status === 'live' || s.status === 'set_break')) patch.status = 'live'
  await upd('fixtures', fixtureId, patch)
  const fixtures = await listCol('fixtures', { matchId: match._id })
  const playable = fixtures.filter((x) => x.teamAId && x.teamBId)
  if (playable.length && playable.every((x) => ['finished', 'confirmed'].includes(x.status))) {
    await upd('matches', match._id, { status: 'finished' })
  }
}

module.exports = {
  toTs,
  pickId,
  getById,
  listCol,
  setDoc,
  upd,
  rem,
  needAdmin,
  activeMembers,
  userName,
  teamCaptainName,
  pushNotify,
  hydrateMatch,
  hydrateFixture,
  teamSideOfUser,
  resolvePlayers,
  canSubmitLineupForTeam,
  canViewMatch,
  createSubFixtures,
  canRefereeFixture,
  isMatchReferee,
  refreshFixtureResult,
  isAdmin,
  hasAnyRole,
  genderCount,
  DEFAULT_ITEMS,
  sanitizeMatchItems,
  sanitizeTeamRule,
  normalizeConcurrent,
  scheduleRoundRobin,
  planRoundRobin,
  nextMatchNo,
  makeFixtureCode,
  makeGameCode,
  slotDateTime,
  rankingFromFixtures,
  judgeSetEnd,
  tallySets,
  itemGenderNeed,
  validateTeamConcurrent,
  needUser,
  getUser,
  fail,
  nid,
  nowIso,
  db
}
