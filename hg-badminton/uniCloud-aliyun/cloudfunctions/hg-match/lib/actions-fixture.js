'use strict'

module.exports = function createFixtureActions(h, actions) {
  const {
    pickId,
    getById,
    listCol,
    setDoc,
    upd,
    rem,
    needAdmin,
    userName,
    pushNotify,
    hydrateMatch,
    hydrateFixture,
    canViewMatch,
    createSubFixtures,
    scheduleRoundRobin,
    planRoundRobin,
    nextMatchNo,
    makeFixtureCode,
    rankingFromFixtures,
    getUser,
    needUser,
    fail,
    nid,
    nowIso,
    toTs
  } = h

  return {
    async generateFixtures(data, { userId }) {
      await needAdmin(userId)
      const matchId = pickId(data, ['matchId', 'id'])
      if (!matchId) fail('缺少比赛 id')
      const match = await getById('matches', matchId)
      if (!match || match.deleted) fail('比赛不存在')
      if (match.progression !== 'round_robin') fail('本期仅支持单循环赛')
      const teams = (await listCol('teams', { matchId })).sort((a, b) =>
        String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      )
      if (teams.length < 2) fail('至少需要 2 支队伍才能生成单循环对阵')

      const old = await listCol('fixtures', { matchId })
      for (const f of old) {
        const subs = await listCol('sub_fixtures', { fixtureId: f._id })
        for (const s of subs) await rem('sub_fixtures', s._id)
        await rem('fixtures', f._id)
      }
      const oldSlots = await listCol('schedule_slots', { matchId })
      for (const sl of oldSlots) await rem('schedule_slots', sl._id)

      let matchNo = match.matchNo
      if (!matchNo) {
        const all = (await listCol('matches', null, 500)).filter((x) => x && !x.deleted)
        matchNo = nextMatchNo(all.map((x) => x.matchNo))
        await upd('matches', matchId, { matchNo })
      }

      const teamIds = teams.map((t) => t._id)
      const planned = planRoundRobin(teamIds)

      let count = 0
      let subCount = 0
      for (const row of planned.fixtures) {
        const fid = nid('f_')
        const code = makeFixtureCode(matchNo, row.roundNo, row.pairNo)
        const f = {
          matchId,
          round: row.roundLabel,
          roundNo: row.roundNo,
          roundShort: row.roundShort,
          pairNo: row.pairNo,
          stage: 'round',
          groupId: '',
          teamAId: row.teamAId,
          teamBId: row.teamBId,
          status: 'pending',
          venue: '',
          courtStart: 0,
          courtEnd: 0,
          scheduleTime: '',
          refereeIds: [],
          result: { winnerTeamId: '', teamAScore: 0, teamBScore: 0 },
          code,
          createdAt: nowIso()
        }
        await setDoc('fixtures', fid, f)
        await createSubFixtures({ _id: fid, ...f }, match)
        const createdSubs = await listCol('sub_fixtures', { fixtureId: fid })
        subCount += createdSubs.length
        count += 1
      }
      await upd('matches', matchId, { status: 'in_progress', matchNo })
      return {
        count,
        subCount,
        teamCount: teams.length,
        rounds: planned.rounds,
        matchNo,
        expected: (teams.length * (teams.length - 1)) / 2
      }
    },

    async listFixtures(data, { userId }) {
      const user = await needUser(userId)
      const matchId = pickId(data, ['matchId', 'id'])
      if (!matchId) fail('缺少比赛 id')
      if (!(await canViewMatch(matchId, user))) fail('无权查看对阵，请先参赛或申请观众权限')
      const match = await hydrateMatch(await getById('matches', matchId))
      const raw = await listCol('fixtures', { matchId })
      const fixtures = []
      for (const f of raw) fixtures.push(await hydrateFixture(f, user))
      fixtures.sort((a, b) => {
        const r = (a.roundNo || 0) - (b.roundNo || 0)
        if (r) return r
        return String(a.code || '').localeCompare(String(b.code || ''))
      })
      const teams = await listCol('teams', { matchId })
      return { match, fixtures, rank: rankingFromFixtures(teams, fixtures), groups: [] }
    },

    async getFixture(data, { userId }) {
      const user = await needUser(userId)
      const id = pickId(data, ['id', 'fixtureId'])
      if (!id) fail('缺少对阵 id')
      const f = await hydrateFixture(await getById('fixtures', id), user)
      if (!f) fail('对阵不存在')
      if (!(await canViewMatch(f.matchId, user))) fail('无权查看')
      f.match = await hydrateMatch(await getById('matches', f.matchId))
      return f
    },

    async assignReferee(data = {}, { userId }) {
      await needAdmin(userId)
      const fixtureId = data.fixtureId
      if (!fixtureId) fail('缺少对阵 id')
      const f0 = await getById('fixtures', fixtureId)
      if (!f0) fail('对阵不存在')
      const match = await getById('matches', f0.matchId)
      const pool = match?.refereeIds || []
      const ids = Array.isArray(data.refereeIds) ? data.refereeIds.filter(Boolean) : []
      if (ids.length && !pool.length) fail('请先在比赛中指定本场裁判')
      for (const rid of ids) {
        if (!pool.includes(rid)) fail('只能从本场已选裁判中分配')
      }
      await upd('fixtures', fixtureId, { refereeIds: ids })
      return hydrateFixture(await getById('fixtures', fixtureId))
    },

    async assignSubFixture(data = {}, { userId }) {
      await needAdmin(userId)
      const id = data.subFixtureId || data.id
      if (!id) fail('缺少小项 id')
      const sub = await getById('sub_fixtures', id)
      if (!sub) fail('小项不存在')
      const f = await getById('fixtures', sub.fixtureId)
      if (!f) fail('对阵不存在')
      const match = await getById('matches', f.matchId)
      const pool = match?.refereeIds || []
      const patch = {}
      if (data.venue !== undefined) patch.venue = String(data.venue || '').trim()
      if (data.scheduleTime !== undefined) {
        const ts = data.scheduleTime ? toTs(data.scheduleTime) : NaN
        if (data.scheduleTime && Number.isNaN(ts)) fail('预计时间格式不正确')
        patch.scheduleTime = data.scheduleTime ? new Date(ts).toISOString() : ''
      }
      if (data.refereeIds !== undefined) {
        if (!Array.isArray(data.refereeIds)) fail('裁判参数错误')
        const ids = data.refereeIds.filter(Boolean)
        if (ids.length && !pool.length) fail('请先在比赛中指定本场裁判')
        for (const rid of ids) {
          if (!pool.includes(rid)) fail('只能从本场已选裁判中分配')
        }
        patch.refereeIds = ids
      }
      if (data.refereeId) {
        if (!pool.length) fail('请先在比赛中指定本场裁判')
        if (!pool.includes(data.refereeId)) fail('只能从本场已选裁判中分配')
        const cur = new Set([...(sub.refereeIds || []), ...(patch.refereeIds || [])])
        cur.add(data.refereeId)
        patch.refereeIds = Array.from(cur)
      }
      if (!Object.keys(patch).length) fail('无更新内容')
      await upd('sub_fixtures', id, patch)
      const allSubs = await listCol('sub_fixtures', { fixtureId: f._id })
      const ids = Array.from(
        new Set([...(f.refereeIds || []), ...allSubs.flatMap((s) => s.refereeIds || [])])
      )
      await upd('fixtures', f._id, { refereeIds: ids })
      return hydrateFixture(await getById('fixtures', f._id))
    },

    async updateFixtureSchedule(data = {}, { userId }) {
      await needAdmin(userId)
      const id = data.fixtureId || data.id
      if (!id) fail('缺少对阵 id')
      const f = await getById('fixtures', id)
      if (!f) fail('对阵不存在')
      const patch = {}
      if (data.venue !== undefined) patch.venue = String(data.venue || '').trim()
      if (data.scheduleTime !== undefined) {
        const ts = data.scheduleTime ? toTs(data.scheduleTime) : NaN
        if (data.scheduleTime && Number.isNaN(ts)) fail('预计时间格式不正确')
        patch.scheduleTime = data.scheduleTime ? new Date(ts).toISOString() : ''
      }
      if (!Object.keys(patch).length) fail('无更新内容')
      await upd('fixtures', id, patch)

      if (patch.scheduleTime && data.syncSubTimes) {
        const match = await getById('matches', f.matchId)
        const gap = Math.max(0, Number(match?.itemIntervalMinutes) || 0)
        const base = toTs(patch.scheduleTime)
        const subs = (await listCol('sub_fixtures', { fixtureId: id })).sort((a, b) =>
          String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
        )
        for (let idx = 0; idx < subs.length; idx++) {
          await upd('sub_fixtures', subs[idx]._id, {
            scheduleTime: new Date(base + idx * gap * 60000).toISOString()
          })
        }
      }
      return hydrateFixture(await getById('fixtures', id))
    },

    async getBracketTable(data, { userId }) {
      const user = await needUser(userId)
      const matchId = pickId(data, ['matchId', 'id'])
      if (!(await canViewMatch(matchId, user))) fail('无权查看对阵')
      const match = await hydrateMatch(await getById('matches', matchId))
      if (!match || match.deleted) fail('比赛不存在')
      const teams = (await listCol('teams', { matchId })).sort((a, b) =>
        String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      )
      const raw = await listCol('fixtures', { matchId })
      const fixtures = []
      for (const f of raw) fixtures.push(await hydrateFixture(f))
      return { match, teams, fixtures }
    },

    async applySpectator(data = {}, { userId }) {
      const u = await needUser(userId)
      const matchId = data.matchId
      if (!matchId) fail('缺少比赛 id')
      const existing = await listCol('match_spectators', { matchId, userId: u._id })
      const exist = existing[0]
      if ((await canViewMatch(matchId, u)) && !exist) fail('您已可直接查看本场比赛')
      if (exist && exist.status === 'pending') fail('已提交申请，请等待审核')
      if (exist && exist.status === 'approved') fail('您已是观众')
      if (exist) {
        return upd('match_spectators', exist._id, {
          status: 'pending',
          reason: data.reason || '',
          reviewerId: ''
        })
      }
      const id = nid('sp_')
      return setDoc('match_spectators', id, {
        matchId,
        userId: u._id,
        status: 'pending',
        reason: data.reason || '',
        reviewerId: '',
        createdAt: nowIso()
      })
    },

    async listSpectators(data = {}, { userId }) {
      await needAdmin(userId)
      let list = await listCol('match_spectators', { matchId: data.matchId })
      if (data.status) list = list.filter((s) => s.status === data.status)
      const out = []
      for (const s of list) {
        const u = await getUser(s.userId)
        out.push({ ...s, userName: await userName(s.userId), phone: u?.phone })
      }
      return out
    },

    async reviewSpectator(data = {}, { userId }) {
      const admin = await needAdmin(userId)
      const s = await getById('match_spectators', data.id)
      if (!s) fail('申请不存在')
      if (data.action === 'approve') {
        await upd('match_spectators', data.id, {
          status: 'approved',
          reviewerId: admin._id,
          rejectReason: ''
        })
        await pushNotify(s.userId, '观众申请通过', '您可以查看该比赛对阵与赛果了', {
          matchId: s.matchId
        })
      } else {
        await upd('match_spectators', data.id, {
          status: 'rejected',
          reviewerId: admin._id,
          rejectReason: data.reason || '未通过'
        })
      }
      return { ok: true }
    },

    async getResults(data, { userId }) {
      const user = await needUser(userId)
      const matchId = pickId(data, ['matchId', 'id'])
      if (!(await canViewMatch(matchId, user))) fail('无权查看赛果，请先参赛或申请观众权限')
      const match = await hydrateMatch(await getById('matches', matchId))
      const teams = await listCol('teams', { matchId })
      const raw = await listCol('fixtures', { matchId })
      const fixtures = []
      for (const f of raw) fixtures.push(await hydrateFixture(f))
      const finished = fixtures.filter((f) => ['finished', 'confirmed'].includes(f.status))
      return {
        match,
        rank: rankingFromFixtures(teams, fixtures),
        groups: [],
        fixtures: finished,
        latest: finished.slice(-8).reverse()
      }
    },

    async listReferees(data = {}, { userId }) {
      await needUser(userId)
      const users = await listCol('users', null, 500)
      let list = users.filter(
        (u) =>
          !u.deleted &&
          (u.roles || []).some((r) => ['referee', 'super_admin', 'admin'].includes(r))
      )
      // 传入 matchId 时：仅返回本场已选裁判（供小项分配）
      const matchId = typeof data === 'string' ? data : data.matchId
      if (matchId) {
        const match = await getById('matches', matchId)
        const pool = new Set(match?.refereeIds || [])
        list = list.filter((u) => pool.has(u._id))
      }
      return list
    },

    async myRefereeFixtures(_data, { userId }) {
      const u = await needUser(userId)
      const uid = u._id
      const matches = (await listCol('matches', null, 200)).filter(
        (m) => m && !m.deleted && (m.refereeIds || []).includes(uid)
      )
      const matchIds = new Set(matches.map((m) => m._id))
      const allSubs = await listCol('sub_fixtures', null, 1000)
      const subFixtureIds = new Set(
        allSubs.filter((s) => (s.refereeIds || []).includes(uid)).map((s) => s.fixtureId)
      )
      const fixtures = await listCol('fixtures', null, 1000)
      const mine = fixtures.filter(
        (f) =>
          matchIds.has(f.matchId) ||
          (f.refereeIds || []).includes(uid) ||
          subFixtureIds.has(f._id)
      )
      const out = []
      for (const f of mine) {
        const hyd = await hydrateFixture(f)
        // 本场裁判可见全部小项；否则仅自己被指派的
        if (matchIds.has(f.matchId)) {
          hyd.mySubFixtures = hyd.subFixtures || []
        } else {
          hyd.mySubFixtures = (hyd.subFixtures || []).filter((s) => (s.refereeIds || []).includes(uid))
        }
        out.push(hyd)
      }
      return out
    }
  }
}
