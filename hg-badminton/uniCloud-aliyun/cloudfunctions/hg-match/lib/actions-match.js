'use strict'

function pickGeo(raw) {
  if (!raw || typeof raw !== 'object') return null
  const latitude = Number(raw.latitude)
  const longitude = Number(raw.longitude)
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || (!latitude && !longitude)) return null
  return {
    name: String(raw.name || '').trim(),
    address: String(raw.address || '').trim(),
    latitude,
    longitude
  }
}

module.exports = function createMatchActions(h, actions) {
  const {
    pickId,
    getById,
    listCol,
    setDoc,
    upd,
    rem,
    needAdmin,
    activeMembers,
    teamCaptainName,
    userName,
    hydrateMatch,
    nextMatchNo,
    canViewMatch,
    genderCount,
    DEFAULT_ITEMS,
    sanitizeMatchItems,
    sanitizeTeamRule,
    normalizeConcurrent,
    needUser,
    fail,
    nid,
    nowIso
  } = h

  return {
    async importBundle(data = {}, { userId }) {
      await needAdmin(userId)
      const matches = Array.isArray(data.matches) ? data.matches : []
      const matchItems = Array.isArray(data.match_items) ? data.match_items : []
      const teams = Array.isArray(data.teams) ? data.teams : []
      const fixtures = Array.isArray(data.fixtures) ? data.fixtures : []
      const subFixtures = Array.isArray(data.sub_fixtures) ? data.sub_fixtures : []
      const spectators = Array.isArray(data.match_spectators) ? data.match_spectators : []
      const scoreLogs = Array.isArray(data.score_logs) ? data.score_logs : []
      const counts = {
        matches: 0,
        match_items: 0,
        teams: 0,
        fixtures: 0,
        sub_fixtures: 0,
        match_spectators: 0,
        score_logs: 0
      }

      async function upsert(col, row, strip = []) {
        if (!row || !row._id) return false
        const exist = await getById(col, row._id)
        if (exist) return false
        const fields = { ...row }
        strip.forEach((k) => delete fields[k])
        delete fields._id
        await setDoc(col, row._id, fields)
        return true
      }

      for (const m of matches) {
        if (m.guestOnly) continue
        const strip = [
          'items',
          'teamCount',
          'fixtureCount',
          'memberCount',
          'teams',
          'canViewDetail',
          'spectator',
          'myTeam'
        ]
        if (await upsert('matches', m, strip)) counts.matches += 1
      }
      for (const it of matchItems) {
        if (await upsert('match_items', it)) counts.match_items += 1
      }
      for (const t of teams) {
        if (await upsert('teams', t, ['activeCount', 'maleCount', 'femaleCount'])) counts.teams += 1
      }
      for (const f of fixtures) {
        if (
          await upsert('fixtures', f, [
            'teamAName',
            'teamBName',
            'refereeNames',
            'subFixtures',
            'viewerOnA',
            'viewerOnB',
            'match',
            'mySubFixtures'
          ])
        ) {
          counts.fixtures += 1
        }
      }
      for (const s of subFixtures) {
        if (
          await upsert('sub_fixtures', s, [
            'itemName',
            'itemSort',
            'memberCount',
            'refereeNames',
            'setText',
            'lineupBothReady',
            'playerAText',
            'playerBText',
            'canSubmitA',
            'canSubmitB'
          ])
        ) {
          counts.sub_fixtures += 1
        }
      }
      for (const s of spectators) {
        if (await upsert('match_spectators', s, ['userName', 'phone'])) counts.match_spectators += 1
      }
      for (const l of scoreLogs) {
        if (await upsert('score_logs', l)) counts.score_logs += 1
      }
      return counts
    },

    async listMatches(query = {}, { userId }) {
      const user = await needUser(userId)
      let list = (await listCol('matches', null, 200)).filter((m) => m && !m.deleted && !m.guestOnly)
      const hydrated = []
      for (const m of list) hydrated.push(await hydrateMatch(m))
      list = hydrated

      if (query.status === 'live') list = list.filter((m) => m.status === 'in_progress')
      else if (query.status === 'upcoming') {
        list = list.filter((m) => ['registering', 'locked', 'draft', 'registered'].includes(m.status))
      } else if (query.status === 'finished') {
        list = list.filter((m) => ['finished', 'closed'].includes(m.status))
      } else if (query.status) list = list.filter((m) => m.status === query.status)
      if (query.keyword) list = list.filter((m) => (m.name || '').includes(query.keyword))

      if (query.mine) {
        const teams = await listCol('teams', null, 1000)
        const fixtures = await listCol('fixtures', null, 1000)
        const ids = new Set([
          ...teams
            .filter(
              (t) => t.captainId === user._id || (t.members || []).some((m) => m.userId === user._id)
            )
            .map((t) => t.matchId),
          ...fixtures.filter((f) => (f.refereeIds || []).includes(user._id)).map((f) => f.matchId),
          ...list
            .filter(
              (m) =>
                m.creatorId === user._id || (m.refereeIds || []).includes(user._id)
            )
            .map((m) => m._id)
        ])
        list = list.filter((m) => ids.has(m._id))
      }
      return list.sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')))
    },

    async getMatch(data, { userId }) {
      const user = await needUser(userId)
      const id = pickId(data, ['id', 'matchId'])
      if (!id) fail('缺少比赛 id')
      const m = await hydrateMatch(await getById('matches', id))
      if (!m || m.deleted || m.guestOnly) fail('比赛不存在')
      const teams = await listCol('teams', { matchId: id })
      m.teams = teams.map((t) => ({
        ...t,
        captainName: teamCaptainName(t) || t.captainName,
        activeCount: activeMembers(t).length,
        maleCount: genderCount(t.members, 'male'),
        femaleCount: genderCount(t.members, 'female')
      }))
      m.canViewDetail = await canViewMatch(id, user)
      const nameCache = {}
      const refNames = []
      for (const rid of m.refereeIds || []) {
        refNames.push(await userName(rid, nameCache))
      }
      m.refereeNames = refNames.filter(Boolean).join('、')
      const sps = await listCol('match_spectators', { matchId: id, userId: user._id })
      m.spectator = sps[0] || null
      m.myTeam =
        teams.find(
          (t) => t.captainId === user._id || (t.members || []).some((x) => x.userId === user._id)
        ) || null
      m.isMatchReferee = (m.refereeIds || []).includes(user._id)
      return m
    },

    async createMatch(data = {}, { userId }) {
      const admin = await needAdmin(userId)
      if (!data.name || !data.location) fail('请填写名称和地点')
      const progression = data.progression || 'round_robin'
      if (progression !== 'round_robin') fail('本期仅支持单循环赛，其他赛制即将开放')
      const id = nid('m_')
      let items
      try {
        items = sanitizeMatchItems(data.items?.length ? data.items : DEFAULT_ITEMS).map((it) => ({
          _id: nid('mi_'),
          matchId: id,
          name: it.name,
          memberCount: it.memberCount,
          sort: it.sort
        }))
      } catch (e) {
        fail(e.message || '项目设置有误')
      }
      let teamRule
      try {
        teamRule = sanitizeTeamRule(data.teamRule, items.length)
      } catch (e) {
        fail(e.message || '赛制设置有误')
      }
      const allMatches = (await listCol('matches', null, 500)).filter((x) => x && !x.deleted)
      const match = {
        matchNo: nextMatchNo(allMatches.map((x) => x.matchNo)),
        name: data.name,
        location: data.location,
        geo: pickGeo(data.geo),
        startDate: data.startDate,
        endDate: data.endDate || data.startDate,
        registerStart: data.registerStart || '',
        registerEnd: data.registerEnd || '',
        status: data.publish === false ? 'draft' : 'registering',
        progression: 'round_robin',
        maxTeams: Number(data.maxTeams) || 8,
        maxMalePerTeam: Number(data.maxMalePerTeam) || 4,
        maxFemalePerTeam: Number(data.maxFemalePerTeam) || 4,
        scoring: data.scoring || { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
        teamRule,
        courtCount: Number(data.courtCount) || 10,
        courtsPerMatch: Number(data.courtsPerMatch) || 2,
        roundIntervalMinutes: Number(data.roundIntervalMinutes) || 45,
        itemIntervalMinutes: Number(data.itemIntervalMinutes) || 0,
        concurrent: normalizeConcurrent(data.concurrent),
        notice: data.notice || '',
        refereeIds: Array.isArray(data.refereeIds) ? data.refereeIds.filter(Boolean) : [],
        deleted: false,
        creatorId: admin._id,
        published: data.publish !== false,
        createdAt: nowIso()
      }
      await setDoc('matches', id, match)
      for (const it of items) {
        const { _id, ...rest } = it
        await setDoc('match_items', _id, rest)
      }
      return hydrateMatch({ _id: id, ...match })
    },

    async updateMatch(data = {}, { userId }) {
      await needAdmin(userId)
      const id = data.id
      if (!id) fail('缺少比赛 id')
      const m = await getById('matches', id)
      if (!m || m.deleted) fail('比赛不存在')
      if (data.progression && data.progression !== 'round_robin') {
        fail('本期仅支持单循环赛，其他赛制即将开放')
      }
      const patch = { ...data }
      ;[
        '_id',
        'id',
        'items',
        'teamCount',
        'fixtureCount',
        'memberCount',
        'teams',
        'canViewDetail',
        'spectator',
        'myTeam',
        'guestOnly'
      ].forEach((k) => delete patch[k])
      if (patch.maxTeams !== undefined) patch.maxTeams = Number(patch.maxTeams)
      if (patch.maxMalePerTeam !== undefined) patch.maxMalePerTeam = Number(patch.maxMalePerTeam)
      if (patch.maxFemalePerTeam !== undefined) patch.maxFemalePerTeam = Number(patch.maxFemalePerTeam)
      if (patch.courtCount !== undefined) patch.courtCount = Number(patch.courtCount) || 10
      if (patch.courtsPerMatch !== undefined) patch.courtsPerMatch = Number(patch.courtsPerMatch) || 2
      if (patch.roundIntervalMinutes !== undefined) {
        patch.roundIntervalMinutes = Number(patch.roundIntervalMinutes) || 45
      }
      if (patch.itemIntervalMinutes !== undefined) {
        patch.itemIntervalMinutes = Math.max(0, Number(patch.itemIntervalMinutes) || 0)
      }
      if (patch.concurrent !== undefined) patch.concurrent = normalizeConcurrent(patch.concurrent)
      if (patch.progression) patch.progression = 'round_robin'
      if (patch.refereeIds !== undefined) {
        if (!Array.isArray(patch.refereeIds)) fail('裁判参数错误')
        patch.refereeIds = patch.refereeIds.filter(Boolean)
      }
      if (data.geo !== undefined) patch.geo = pickGeo(data.geo)
      if (data.items !== undefined) {
        const fixtures = await listCol('fixtures', { matchId: id })
        if (fixtures.length) fail('已生成对阵，不能修改每场项目')
        let nextItems
        try {
          nextItems = sanitizeMatchItems(data.items)
        } catch (e) {
          fail(e.message || '项目设置有误')
        }
        const oldItems = await listCol('match_items', { matchId: id })
        for (const it of oldItems) await rem('match_items', it._id)
        for (const it of nextItems) {
          await setDoc('match_items', nid('mi_'), {
            matchId: id,
            name: it.name,
            memberCount: it.memberCount,
            sort: it.sort
          })
        }
      }
      const itemCount = (await listCol('match_items', { matchId: id })).length
      if (data.teamRule !== undefined || data.items !== undefined) {
        try {
          patch.teamRule = sanitizeTeamRule(data.teamRule || m.teamRule, itemCount)
        } catch (e) {
          fail(e.message || '赛制设置有误')
        }
      }
      return hydrateMatch(await upd('matches', id, patch))
    },

    async setMatchReferees(data = {}, { userId }) {
      await needAdmin(userId)
      const matchId = data.matchId || data.id
      if (!matchId) fail('缺少比赛 id')
      const m = await getById('matches', matchId)
      if (!m || m.deleted) fail('比赛不存在')
      if (!Array.isArray(data.refereeIds)) fail('裁判参数错误')
      const ids = data.refereeIds.filter(Boolean)
      // 校验均为系统裁判角色（或管理员）
      for (const rid of ids) {
        const u = await getById('users', rid)
        if (!u || u.deleted) fail('存在无效裁判用户')
        const roles = u.roles || []
        if (!roles.some((r) => ['referee', 'admin', 'super_admin'].includes(r))) {
          fail(`${u.realName || u.nickname || rid} 不是裁判角色`)
        }
      }
      const updated = await upd('matches', matchId, { refereeIds: ids })
      return hydrateMatch(updated)
    },

    async deleteMatch(data = {}, { userId }) {
      await needAdmin(userId)
      const id = pickId(data, ['id', 'matchId'])
      const m = await getById('matches', id)
      if (!m || m.deleted) fail('比赛不存在')
      await upd('matches', id, { deleted: true, deletedAt: nowIso() })
      return { ok: true }
    }
  }
}
