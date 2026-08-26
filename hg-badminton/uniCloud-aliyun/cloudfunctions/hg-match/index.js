'use strict'

/**
 * hg-match — 比赛：发布、报名/队伍、对阵、记分、赛果、观众
 * 业务逻辑将逐步从客户端本地 service 迁入此处。
 */

const core = require('hg-core')
const { db, fail, nid, needUser, createHandler } = require('hg-shared')

async function needAdmin(userId) {
  const u = await needUser(userId)
  if (!core.isAdmin(u)) fail('需要管理员权限')
  return u
}

const actions = {
  async list(query = {}, { userId }) {
    await needUser(userId)
    try {
      const { data } = await db.collection('matches').orderBy('startDate', 'desc').limit(100).get()
      return data.filter((m) => {
        if (query.status === 'live') return m.status === 'in_progress'
        if (query.status === 'upcoming') {
          return ['registering', 'registered', 'locked', 'draft'].includes(m.status)
        }
        if (query.status === 'finished') return ['finished', 'closed'].includes(m.status)
        if (query.keyword) return (m.name || '').includes(query.keyword)
        return true
      })
    } catch (e) {
      return []
    }
  },

  async get(data = {}, { userId }) {
    await needUser(userId)
    const id = typeof data === 'string' ? data : data.id
    if (!id) fail('缺少比赛 id')
    const { data: rows } = await db.collection('matches').doc(id).get()
    const m = rows[0]
    if (!m) fail('比赛不存在')
    const items = (await db.collection('match_items').where({ matchId: id }).get()).data
    const teams = (await db.collection('teams').where({ matchId: id }).get()).data
    return { ...m, items, teams, teamCount: teams.length }
  },

  async create(data = {}, { userId }) {
    await needAdmin(userId)
    if (!data.name) fail('请填写比赛名称')
    const id = nid('m_')
    const match = {
      _id: id,
      name: data.name,
      location: data.location || '',
      startDate: data.startDate,
      endDate: data.endDate,
      registerEnd: data.registerEnd || data.registerDeadline,
      status: data.publish === false ? 'draft' : 'registering',
      format: 'team',
      progression: data.progression || 'round_robin',
      scoring: data.scoring || { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
      teamRule: data.teamRule || { mode: 'firstToWin', itemsWinToWin: 3 },
      maxTeams: data.maxTeams || 16,
      maxMalePerTeam: data.maxMalePerTeam || 8,
      maxFemalePerTeam: data.maxFemalePerTeam || 8,
      notice: data.notice || '',
      creatorId: userId,
      createdAt: Date.now()
    }
    await db.collection('matches').add(match)
    return match
  },

  async saveTeam(data = {}, { userId }) {
    await needUser(userId)
    fail('队伍报名云端逻辑迁移中')
  },

  async applyJoinTeam(data = {}, { userId }) {
    await needUser(userId)
    fail('申请入队云端逻辑迁移中')
  },

  async reviewTeamMember(data = {}, { userId }) {
    await needUser(userId)
    fail('队员审批云端逻辑迁移中')
  },

  async generateFixtures(data = {}, { userId }) {
    await needAdmin(userId)
    const matchId = typeof data === 'string' ? data : data.matchId
    if (!matchId) fail('缺少比赛 id')
    const teams = (await db.collection('teams').where({ matchId }).get()).data
    const teamIds = teams.map((t) => t._id)
    if (teamIds.length < 2) fail('至少需要 2 支队伍')
    const rounds = core.roundRobinRounds(teamIds)
    let count = 0
    for (let ri = 0; ri < rounds.length; ri++) {
      for (const [a, b] of rounds[ri]) {
        await db.collection('fixtures').add({
          _id: nid('f_'),
          matchId,
          round: `第${ri + 1}轮`,
          teamAId: a,
          teamBId: b,
          status: 'pending',
          refereeIds: [],
          createdAt: Date.now()
        })
        count += 1
      }
    }
    return { count }
  },

  async listFixtures(data = {}, { userId }) {
    await needUser(userId)
    const matchId = typeof data === 'string' ? data : data.matchId
    if (!matchId) fail('缺少比赛 id')
    const fixtures = (await db.collection('fixtures').where({ matchId }).get()).data
    const { data: matches } = await db.collection('matches').doc(matchId).get()
    return { match: matches[0] || null, fixtures }
  },

  async getResults(data = {}, { userId }) {
    await needUser(userId)
    const matchId = typeof data === 'string' ? data : data.matchId
    if (!matchId) fail('缺少比赛 id')
    const { data: matches } = await db.collection('matches').doc(matchId).get()
    const match = matches[0]
    if (!match) fail('比赛不存在')
    const teams = (await db.collection('teams').where({ matchId }).get()).data
    const fixtures = (await db.collection('fixtures').where({ matchId }).get()).data
    const rank = core.rankingFromFixtures(teams, fixtures)
    const latest = fixtures
      .filter((f) => ['finished', 'confirmed'].includes(f.status))
      .slice(0, 20)
    return { match, rank, latest }
  },

  async applySpectator(data = {}, { userId }) {
    await needUser(userId)
    fail('观众申请云端逻辑迁移中')
  },

  async addPoint(data = {}, { userId }) {
    await needUser(userId)
    fail('记分云端逻辑迁移中')
  },

  async listReferees(_data, { userId }) {
    await needUser(userId)
    const { data } = await db.collection('users').limit(500).get()
    return data.filter((u) => (u.roles || []).some((r) => ['referee', 'admin', 'super_admin'].includes(r)))
  },

  async myRefereeFixtures(_data, { userId }) {
    await needUser(userId)
    fail('执裁场次云端逻辑迁移中')
  }
}

exports.main = createHandler(actions)
