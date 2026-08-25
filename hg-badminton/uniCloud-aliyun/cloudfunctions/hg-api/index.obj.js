'use strict'

const core = require('hg-core')
const db = uniCloud.database()
const dbCmd = db.command

function fail(message) {
  throw { errCode: 'BIZ', errMsg: message }
}

function nid(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

async function getUser(id) {
  if (!id) return null
  const { data } = await db.collection('users').doc(id).get()
  return data[0] || null
}

module.exports = {
  _before() {
    const args = this.getParams()[0] || {}
    this.payload = args
    this.userId = args._userId || this.getUniIdToken && this.getUniIdToken()?.uid
  },

  async _needUser() {
    const u = await getUser(this.userId)
    if (!u) fail('请先登录')
    return u
  },

  async _needAdmin() {
    const u = await this._needUser()
    if (!core.isAdmin(u)) fail('需要管理员权限')
    return u
  },

  async login(data = {}) {
    data = data || this.payload
    if (data.userId) {
      const u = await getUser(data.userId)
      if (!u) fail('用户不存在')
      return u
    }
    if (data.phone) {
      const { data: list } = await db.collection('users').where({ phone: data.phone }).limit(1).get()
      if (list[0]) return list[0]
    }
    const u = {
      _id: nid('u_'),
      nickname: data.nickname || '球友',
      phone: data.phone || '',
      gender: data.gender || 'male',
      roles: ['member'],
      viewRole: 'member',
      createdAt: Date.now()
    }
    await db.collection('users').add(u)
    return u
  },

  async listMatches(data = {}) {
    data = data || this.payload
    const { data: list } = await db.collection('matches').orderBy('startDate', 'desc').limit(100).get()
    return list.filter((m) => {
      if (data.status === 'live') return m.status === 'in_progress'
      if (data.status === 'upcoming') return ['registering', 'registered', 'locked', 'draft'].includes(m.status)
      if (data.status === 'finished') return ['finished', 'closed'].includes(m.status)
      if (data.keyword) return (m.name || '').includes(data.keyword)
      return true
    })
  },

  async getMatch(id) {
    const matchId = typeof id === 'string' ? id : (id && id.id) || this.payload
    const { data } = await db.collection('matches').doc(matchId).get()
    const m = data[0]
    if (!m) fail('比赛不存在')
    const items = (await db.collection('match_items').where({ matchId }).get()).data
    const teams = (await db.collection('teams').where({ matchId }).get()).data
    return { ...m, items, teams, access: { ok: true } }
  },

  async createMatch(data = {}) {
    const u = await this._needAdmin()
    data = data || this.payload
    const id = nid('m_')
    const match = {
      _id: id,
      name: data.name,
      location: data.location,
      startDate: data.startDate,
      endDate: data.endDate,
      registerDeadline: data.registerDeadline,
      status: data.publish === false ? 'draft' : 'registering',
      format: 'team',
      progression: data.progression || 'group_knockout',
      scoring: data.scoring || { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
      teamRule: data.teamRule || { mode: 'firstToWin', itemsWinToWin: 3 },
      allowDualItem: !!data.allowDualItem,
      accessControl: {
        whitelistUserIds: data.whitelistUserIds || [],
        password: data.password || '',
        passwordEnabled: !!data.passwordEnabled,
        passwordVersion: 1
      },
      creatorId: u._id,
      published: data.publish !== false,
      notice: data.notice || '',
      createdAt: Date.now()
    }
    await db.collection('matches').add(match)
    const items = (data.items || []).map((it, i) => ({
      _id: nid('mi_'),
      matchId: id,
      name: it.name,
      memberCount: it.memberCount || 1,
      sort: i + 1
    }))
    if (items.length) await db.collection('match_items').add(items)
    return match
  },

  async saveTeam(data = {}) {
    const u = await this._needUser()
    data = data || this.payload
    const payload = {
      matchId: data.matchId,
      name: data.name,
      captainId: u._id,
      members: data.members || [],
      lineup: data.lineup || {},
      registerStatus: data.submit ? 'submitted' : 'draft',
      updatedAt: Date.now()
    }
    if (data._id) {
      await db.collection('teams').doc(data._id).update(payload)
      return { _id: data._id, ...payload }
    }
    payload._id = nid('t_')
    payload.createdAt = Date.now()
    await db.collection('teams').add(payload)
    return payload
  },

  async reviewTeam(data = {}) {
    await this._needAdmin()
    data = data || this.payload
    const patch = data.action === 'approve'
      ? { registerStatus: 'approved', rejectReason: '' }
      : { registerStatus: 'rejected', rejectReason: data.reason || '不符合要求' }
    await db.collection('teams').doc(data.teamId).update(patch)
    return patch
  },

  async generateFixtures(matchId) {
    await this._needAdmin()
    const id = typeof matchId === 'string' ? matchId : this.payload
    const match = (await db.collection('matches').doc(id).get()).data[0]
    const teams = (await db.collection('teams').where({ matchId: id, registerStatus: 'approved' }).get()).data
    if (teams.length < 2) fail('至少需要 2 支已审核队伍')
    const teamIds = teams.map((t) => t._id)
    const items = (await db.collection('match_items').where({ matchId: id }).orderBy('sort', 'asc').get()).data
    const addFix = async (pair, meta) => {
      const f = {
        _id: nid('f_'),
        matchId: id,
        round: meta.round,
        stage: meta.stage,
        groupId: meta.groupId || '',
        teamAId: pair[0] || '',
        teamBId: pair[1] || '',
        status: 'pending',
        venue: meta.venue || '场地 1',
        result: { winnerTeamId: '', teamAScore: 0, teamBScore: 0 },
        refereeIds: [],
        code: meta.code,
        createdAt: Date.now()
      }
      await db.collection('fixtures').add(f)
      if (f.teamAId && f.teamBId) {
        const subs = items.map((item) => ({
          _id: nid('sf_'),
          fixtureId: f._id,
          itemId: item._id,
          playerAIds: [],
          playerBIds: [],
          status: 'pending',
          currentSet: 1,
          sets: [{ aScore: 0, bScore: 0, winner: '' }],
          winner: ''
        }))
        if (subs.length) await db.collection('sub_fixtures').add(subs)
      }
      return f
    }
    let count = 0
    if (match.progression === 'round_robin') {
      const rounds = core.roundRobinRounds(teamIds)
      for (let ri = 0; ri < rounds.length; ri++) {
        for (let pi = 0; pi < rounds[ri].length; pi++) {
          await addFix(rounds[ri][pi], { round: `第 ${ri + 1} 轮`, stage: 'round', code: `R${ri + 1}-${pi + 1}` })
          count += 1
        }
      }
    } else if (match.progression === 'single_knockout') {
      const { pairs, size } = core.knockoutFirstRound(teamIds)
      const name = size <= 2 ? '决赛' : size <= 4 ? '半决赛' : `${size} 强`
      for (let i = 0; i < pairs.length; i++) {
        await addFix(pairs[i], { round: name, stage: 'knockout', code: `K${i + 1}` })
        count += 1
      }
    } else {
      const groups = core.autoGroup(teamIds)
      for (const g of groups) {
        const gid = nid('g_')
        await db.collection('groups').add({ _id: gid, matchId: id, groupName: g.name, teamIds: g.teamIds })
        const rounds = core.roundRobinRounds(g.teamIds)
        for (let ri = 0; ri < rounds.length; ri++) {
          for (let pi = 0; pi < rounds[ri].length; pi++) {
            await addFix(rounds[ri][pi], {
              round: `小组赛第 ${ri + 1} 轮`,
              stage: 'group',
              groupId: gid,
              code: `${g.name}${ri + 1}${pi + 1}`
            })
            count += 1
          }
        }
      }
    }
    await db.collection('matches').doc(id).update({ status: 'in_progress' })
    return { count }
  },

  async addPoint(data = {}) {
    const u = await this._needUser()
    data = data || this.payload
    const sub = (await db.collection('sub_fixtures').doc(data.subFixtureId).get()).data[0]
    const f = (await db.collection('fixtures').doc(sub.fixtureId).get()).data[0]
    const match = (await db.collection('matches').doc(f.matchId).get()).data[0]
    const rule = match.scoring || { points: 21, capPoints: 30, deuceMargin: 2 }
    const sets = [...(sub.sets || [{ aScore: 0, bScore: 0, winner: '' }])]
    let idx = sets.findIndex((s) => !s.winner)
    if (idx < 0) {
      sets.push({ aScore: 0, bScore: 0, winner: '' })
      idx = sets.length - 1
    }
    if (data.side === 'a') sets[idx].aScore += 1
    else sets[idx].bScore += 1
    let status = 'live'
    let winner = sub.winner || ''
    if (core.judgeSetEnd(sets[idx].aScore, sets[idx].bScore, rule)) {
      sets[idx].winner = sets[idx].aScore > sets[idx].bScore ? 'a' : 'b'
      const t = core.tallySets(sets, 2)
      if (t.finished) {
        status = 'finished'
        winner = t.winner
      } else {
        status = 'set_break'
        sets.push({ aScore: 0, bScore: 0, winner: '' })
      }
    }
    await db.collection('sub_fixtures').doc(sub._id).update({ sets, status, winner, currentSet: sets.filter((s) => s.winner).length + (status === 'finished' ? 0 : 1) })
    await db.collection('score_logs').add({
      subFixtureId: sub._id,
      operatorId: u._id,
      type: 'add',
      payload: { side: data.side },
      createdAt: Date.now()
    })
    const subs = (await db.collection('sub_fixtures').where({ fixtureId: f._id }).get()).data
    const r = core.judgeTeamWinner(subs, match.teamRule, (await db.collection('match_items').where({ matchId: match._id }).get()).data.length)
    await db.collection('fixtures').doc(f._id).update({
      status: r.locked ? 'finished' : 'live',
      result: {
        winnerTeamId: r.winner === 'a' ? f.teamAId : r.winner === 'b' ? f.teamBId : '',
        teamAScore: r.aScore,
        teamBScore: r.bScore
      }
    })
    return (await db.collection('sub_fixtures').doc(sub._id).get()).data[0]
  },

  async applyRole(data = {}) {
    const u = await this._needUser()
    data = data || this.payload
    const rec = {
      _id: nid('ra_'),
      userId: u._id,
      applyRole: data.applyRole,
      name: data.name || u.nickname,
      phone: data.phone || u.phone,
      extra: data.extra || '',
      status: 'pending',
      createdAt: Date.now()
    }
    await db.collection('role_applications').add(rec)
    return rec
  },

  async reviewApplication(data = {}) {
    const admin = await this._needAdmin()
    data = data || this.payload
    const a = (await db.collection('role_applications').doc(data.id).get()).data[0]
    if (data.action === 'approve') {
      const u = await getUser(a.userId)
      const roles = Array.from(new Set([...(u.roles || []), a.applyRole, 'member']))
      await db.collection('users').doc(u._id).update({ roles })
      await db.collection('role_applications').doc(data.id).update({ status: 'approved', reviewerId: admin._id, reviewedAt: Date.now() })
    } else {
      await db.collection('role_applications').doc(data.id).update({
        status: 'rejected',
        reviewerId: admin._id,
        rejectReason: data.reason || '未通过',
        reviewedAt: Date.now()
      })
    }
    return { ok: true }
  },

  async addPhoto(data = {}) {
    const u = await this._needUser()
    data = data || this.payload
    let url = data.url || ''
    if (data.cloudPath) {
      // 客户端先 uploadFile 再传 fileID
      url = data.cloudPath
    }
    const p = {
      _id: nid('p_'),
      matchId: data.matchId,
      uploaderId: u._id,
      url,
      caption: data.caption || '比赛瞬间',
      color: data.color || '#5BC8A0',
      isFeatured: false,
      createdAt: Date.now()
    }
    await db.collection('photos').add(p)
    return p
  }
}
