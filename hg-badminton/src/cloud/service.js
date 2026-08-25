import { col } from './db'
import { seedDemo } from './seed'
import { nid, nowIso, hasAnyRole, isAdmin, isSuper } from '@/utils/format'
import { DEFAULT_ITEMS, ACCESS_KEY } from '@/utils/constants'
import { judgeSetEnd, tallySets, judgeTeamWinner } from '@/utils/scoring'
import { autoGroup, roundRobinRounds, knockoutFirstRound, rankingFromFixtures } from '@/utils/fixture-gen'

function fail(message) {
  const err = new Error(message)
  err.biz = true
  throw err
}

function needUser(ctx) {
  if (!ctx?.user) fail('请先登录')
  return ctx.user
}

function needAdmin(ctx) {
  const u = needUser(ctx)
  if (!isAdmin(u)) fail('需要管理员权限')
  return u
}

function userName(id) {
  return col('users').findOne(id)?.nickname || '未知'
}

function teamName(id) {
  if (!id) return '待定'
  return col('teams').findOne(id)?.name || '待定'
}

function hydrateMatch(m) {
  if (!m) return null
  const items = col('match_items').find((i) => i.matchId === m._id).sort((a, b) => a.sort - b.sort)
  const teams = col('teams').find((t) => t.matchId === m._id)
  const approved = teams.filter((t) => t.registerStatus === 'approved')
  const fixtures = col('fixtures').find((f) => f.matchId === m._id)
  const photos = col('photos').find((p) => p.matchId === m._id)
  return {
    ...m,
    items,
    teamCount: approved.length,
    fixtureCount: fixtures.length,
    memberCount: approved.reduce((n, t) => n + (t.members?.length || 0), 0),
    photoCount: photos.length,
    championName: m.championTeamId ? teamName(m.championTeamId) : ''
  }
}

function hydrateFixture(f) {
  if (!f) return null
  const subs = col('sub_fixtures')
    .find((s) => s.fixtureId === f._id)
  const items = col('match_items').all()
  const itemMap = Object.fromEntries(items.map((i) => [i._id, i]))
  const players = (ids) =>
    (ids || [])
      .map((id) => col('users').findOne(id)?.nickname)
      .filter(Boolean)
      .join('/')
  return {
    ...f,
    teamAName: teamName(f.teamAId),
    teamBName: teamName(f.teamBId),
    refereeNames: (f.refereeIds || []).map(userName).join('、'),
    subFixtures: subs.map((s) => ({
      ...s,
      itemName: itemMap[s.itemId]?.name || '单项',
      playerA: players(s.playerAIds) || '待定',
      playerB: players(s.playerBIds) || '待定',
      setText: (s.sets || [])
        .filter((x) => x.winner || (x.aScore && x.bScore))
        .map((x) => `${x.aScore}:${x.bScore}`)
        .join(' · ')
    }))
  }
}

function checkAccess(match, ctx) {
  const ac = match.accessControl || {}
  if (!ac.passwordEnabled) return { ok: true }
  const uid = ctx.user?._id
  if (uid && (ac.whitelistUserIds || []).includes(uid)) return { ok: true }
  if (uid && (match.creatorId === uid || isAdmin(ctx.user))) return { ok: true }
  const map = uni.getStorageSync(ACCESS_KEY) || {}
  const rec = map[match._id]
  if (rec && rec.version === (ac.passwordVersion || 1)) return { ok: true }
  return { ok: false, needPassword: true }
}

function grantAccess(matchId, version) {
  const map = uni.getStorageSync(ACCESS_KEY) || {}
  map[matchId] = { version: version || 1, at: Date.now() }
  uni.setStorageSync(ACCESS_KEY, map)
}

function createSubFixtures(fixture, match) {
  const items = col('match_items').find((i) => i.matchId === match._id).sort((a, b) => a.sort - b.sort)
  const teamA = col('teams').findOne(fixture.teamAId)
  const teamB = col('teams').findOne(fixture.teamBId)
  items.forEach((item) => {
    col('sub_fixtures').insert({
      _id: nid('sf_'),
      fixtureId: fixture._id,
      itemId: item._id,
      playerAIds: (teamA?.lineup || {})[item._id] || [],
      playerBIds: (teamB?.lineup || {})[item._id] || [],
      status: 'pending',
      currentSet: 1,
      sets: [{ aScore: 0, bScore: 0, winner: '' }],
      winner: '',
      createdAt: nowIso()
    })
  })
}

function refreshFixtureResult(fixtureId) {
  const f = col('fixtures').findOne(fixtureId)
  const match = col('matches').findOne(f.matchId)
  const subs = col('sub_fixtures').find((s) => s.fixtureId === fixtureId)
  const r = judgeTeamWinner(subs, match.teamRule, col('match_items').find((i) => i.matchId === match._id).length)
  const patch = {
    result: {
      winnerTeamId: r.winner === 'a' ? f.teamAId : r.winner === 'b' ? f.teamBId : '',
      teamAScore: r.aScore,
      teamBScore: r.bScore
    }
  }
  if (r.locked && r.winner) {
    patch.status = 'finished'
    if (match.teamRule?.mode === 'firstToWin') {
      subs.forEach((s) => {
        if (s.status === 'pending') col('sub_fixtures').update(s._id, { status: 'pending', skipped: true })
      })
    }
  } else if (subs.some((s) => s.status === 'live' || s.status === 'set_break')) {
    patch.status = 'live'
  }
  col('fixtures').update(fixtureId, patch)
  refreshMatchStatus(match._id)
  return col('fixtures').findOne(fixtureId)
}

function refreshMatchStatus(matchId) {
  const match = col('matches').findOne(matchId)
  const fixtures = col('fixtures').find((f) => f.matchId === matchId)
  if (!fixtures.length) return
  const allDone = fixtures.every((f) => ['finished', 'confirmed'].includes(f.status) || (!f.teamAId || !f.teamBId))
  const playable = fixtures.filter((f) => f.teamAId && f.teamBId)
  const playableDone = playable.length && playable.every((f) => ['finished', 'confirmed'].includes(f.status))
  if (playableDone && match.status === 'in_progress') {
    const rank = rankingFromFixtures(
      col('teams').find((t) => t.matchId === matchId && t.registerStatus === 'approved'),
      fixtures
    )
    col('matches').update(matchId, {
      status: 'finished',
      championTeamId: rank[0]?.teamId || playable.find((f) => f.round === '决赛')?.result?.winnerTeamId || ''
    })
  } else if (fixtures.some((f) => f.status === 'live') && match.status !== 'in_progress') {
    col('matches').update(matchId, { status: 'in_progress' })
  }
}

export const service = {
  init() {
    seedDemo(false)
    return { ok: true }
  },

  seedDemo(force) {
    return seedDemo(!!force)
  },

  login({ userId, nickname, phone, gender } = {}, ctx) {
    if (userId) {
      const u = col('users').findOne(userId)
      if (!u) fail('用户不存在')
      return u
    }
    const exist = phone && col('users').findOne((x) => x.phone === phone)
    if (exist) return exist
    const u = {
      _id: nid('u_'),
      nickname: nickname || '球友',
      phone: phone || '',
      gender: gender || 'male',
      roles: ['member'],
      viewRole: 'member',
      avatar: '',
      verified: false,
      createdAt: nowIso()
    }
    col('users').insert(u)
    return u
  },

  wxLogin({ nickname, avatar } = {}) {
    const openid = `demo_${Date.now()}`
    let u = col('users').findOne((x) => x.openid === openid)
    if (!u) {
      u = {
        _id: nid('u_'),
        openid,
        nickname: nickname || '微信用户',
        avatar: avatar || '',
        phone: '',
        gender: 'male',
        roles: ['member'],
        viewRole: 'member',
        verified: false,
        createdAt: nowIso()
      }
      col('users').insert(u)
    }
    return u
  },

  getProfile(ctx) {
    return needUser(ctx)
  },

  updateProfile(patch, ctx) {
    const u = needUser(ctx)
    return col('users').update(u._id, {
      nickname: patch.nickname ?? u.nickname,
      phone: patch.phone ?? u.phone,
      gender: patch.gender ?? u.gender,
      avatar: patch.avatar ?? u.avatar
    })
  },

  switchViewRole(role, ctx) {
    const u = needUser(ctx)
    return col('users').update(u._id, { viewRole: role })
  },

  listUsers(ctx) {
    needAdmin(ctx)
    return col('users').all()
  },

  setUserRoles({ userId, roles }, ctx) {
    isSuper(needUser(ctx)) || fail('需要超级管理员权限')
    if (!Array.isArray(roles) || !roles.length) fail('至少保留一个角色')
    return col('users').update(userId, { roles, viewRole: roles[0] })
  },

  stats(ctx) {
    const matches = col('matches').all()
    const mine = ctx.user
      ? col('teams').find((t) => t.members?.some((m) => m.userId === ctx.user._id) || t.captainId === ctx.user._id)
      : []
    const ref = ctx.user
      ? col('fixtures').find((f) => (f.refereeIds || []).includes(ctx.user._id))
      : []
    return {
      live: matches.filter((m) => m.status === 'in_progress').length,
      upcoming: matches.filter((m) => ['registering', 'registered', 'locked', 'draft'].includes(m.status)).length,
      finished: matches.filter((m) => ['finished', 'closed'].includes(m.status)).length,
      mine: new Set([...mine.map((t) => t.matchId), ...ref.map((f) => f.matchId)]).size
    }
  },

  listMatches({ status, keyword, mine } = {}, ctx) {
    let list = col('matches').all().map(hydrateMatch)
    if (status && status !== 'all') {
      if (status === 'upcoming') list = list.filter((m) => ['registering', 'registered', 'locked', 'draft'].includes(m.status))
      else if (status === 'finished') list = list.filter((m) => ['finished', 'closed'].includes(m.status))
      else if (status === 'live') list = list.filter((m) => m.status === 'in_progress')
      else list = list.filter((m) => m.status === status)
    }
    if (keyword) {
      const k = keyword.trim()
      list = list.filter((m) => m.name.includes(k) || (m.location || '').includes(k))
    }
    if (mine && ctx.user) {
      const ids = new Set([
        ...col('teams')
          .find((t) => t.captainId === ctx.user._id || t.members?.some((x) => x.userId === ctx.user._id))
          .map((t) => t.matchId),
        ...col('fixtures')
          .find((f) => (f.refereeIds || []).includes(ctx.user._id))
          .map((f) => f.matchId),
        ...col('matches').find((m) => m.creatorId === ctx.user._id).map((m) => m._id)
      ])
      list = list.filter((m) => ids.has(m._id))
    }
    return list.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
  },

  getMatch(id, ctx) {
    const m = col('matches').findOne(id)
    if (!m) fail('比赛不存在')
    const access = checkAccess(m, ctx)
    const hydrated = hydrateMatch(m)
    hydrated.teams = col('teams')
      .find((t) => t.matchId === id)
      .map((t) => ({
        ...t,
        captainName: userName(t.captainId),
        groupName: t.groupId ? col('groups').findOne(t.groupId)?.groupName : ''
      }))
    hydrated.access = access
    return hydrated
  },

  verifyPassword({ matchId, password }, ctx) {
    const m = col('matches').findOne(matchId)
    if (!m) fail('比赛不存在')
    const ac = m.accessControl || {}
    if (!ac.passwordEnabled) {
      grantAccess(matchId, ac.passwordVersion)
      return { ok: true }
    }
    if (String(password) !== String(ac.password)) fail('密码错误')
    grantAccess(matchId, ac.passwordVersion)
    return { ok: true }
  },

  createMatch(data, ctx) {
    const u = needAdmin(ctx)
    const id = nid('m_')
    const items = (data.items?.length ? data.items : DEFAULT_ITEMS).map((it, i) => ({
      _id: nid('mi_'),
      matchId: id,
      name: it.name,
      memberCount: Number(it.memberCount) || 1,
      sort: i + 1
    }))
    const match = {
      _id: id,
      name: data.name,
      location: data.location,
      startDate: data.startDate,
      endDate: data.endDate || data.startDate,
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
      scheduleNote: data.scheduleNote || [],
      createdAt: nowIso()
    }
    if (!match.name) fail('请填写比赛名称')
    if (!match.location) fail('请填写举办地点')
    col('matches').insert(match)
    col('match_items').insertMany(items)
    return hydrateMatch(match)
  },

  updateMatch({ id, ...data }, ctx) {
    needAdmin(ctx)
    const m = col('matches').findOne(id)
    if (!m) fail('比赛不存在')
    const patch = { ...data }
    if (data.password && data.password !== m.accessControl?.password) {
      patch.accessControl = {
        ...(m.accessControl || {}),
        ...(data.accessControl || {}),
        password: data.password,
        passwordVersion: (m.accessControl?.passwordVersion || 1) + 1
      }
    }
    return hydrateMatch(col('matches').update(id, patch))
  },

  publishMatch(id, ctx) {
    needAdmin(ctx)
    return col('matches').update(id, { published: true, status: 'registering' })
  },

  closeMatch(id, ctx) {
    needAdmin(ctx)
    return col('matches').update(id, { status: 'closed' })
  },

  deleteMatch(id, ctx) {
    needAdmin(ctx)
    col('match_items').removeWhere((i) => i.matchId === id)
    col('teams').removeWhere((t) => t.matchId === id)
    const fids = col('fixtures').find((f) => f.matchId === id).map((f) => f._id)
    col('fixtures').removeWhere((f) => f.matchId === id)
    col('sub_fixtures').removeWhere((s) => fids.includes(s.fixtureId))
    col('photos').removeWhere((p) => p.matchId === id)
    col('groups').removeWhere((g) => g.matchId === id)
    col('matches').remove(id)
    return { ok: true }
  },

  getMyTeam(matchId, ctx) {
    const u = needUser(ctx)
    return (
      col('teams').findOne((t) => t.matchId === matchId && (t.captainId === u._id || t.members?.some((m) => m.userId === u._id))) ||
      null
    )
  },

  saveTeam(data, ctx) {
    const u = needUser(ctx)
    if (!hasAnyRole(u, ['super_admin', 'admin', 'captain'])) fail('需要队长权限才能报名')
    const match = col('matches').findOne(data.matchId)
    if (!match) fail('比赛不存在')
    if (!['registering', 'draft'].includes(match.status) && !isAdmin(u)) fail('当前不可报名或修改')
    if (!data.name) fail('请填写队名')
    let team = data._id ? col('teams').findOne(data._id) : col('teams').findOne((t) => t.matchId === data.matchId && t.captainId === u._id)
    const payload = {
      matchId: data.matchId,
      name: data.name,
      captainId: team?.captainId || u._id,
      members: data.members || [],
      lineup: data.lineup || {},
      registerStatus: data.submit ? 'submitted' : team?.registerStatus === 'approved' ? 'approved' : 'draft',
      rejectReason: data.submit ? '' : team?.rejectReason || ''
    }
    if (match.allowDualItem === false && payload.lineup) {
      const used = []
      Object.values(payload.lineup).forEach((ids) => {
        ;(ids || []).forEach((id) => {
          if (used.includes(id)) fail('默认不允许兼项，同一队员只能报名一个单项')
          used.push(id)
        })
      })
    }
    if (team) return col('teams').update(team._id, payload)
    return col('teams').insert({ _id: nid('t_'), ...payload, createdAt: nowIso() })
  },

  listTeams(matchId) {
    return col('teams')
      .find((t) => t.matchId === matchId)
      .map((t) => ({ ...t, captainName: userName(t.captainId) }))
  },

  reviewTeam({ teamId, action, reason }, ctx) {
    needAdmin(ctx)
    const team = col('teams').findOne(teamId)
    if (!team) fail('队伍不存在')
    if (action === 'approve') return col('teams').update(teamId, { registerStatus: 'approved', rejectReason: '' })
    if (action === 'reject') return col('teams').update(teamId, { registerStatus: 'rejected', rejectReason: reason || '不符合要求' })
    fail('未知操作')
  },

  generateFixtures(matchId, ctx) {
    needAdmin(ctx)
    const match = col('matches').findOne(matchId)
    if (!match) fail('比赛不存在')
    const teams = col('teams').find((t) => t.matchId === matchId && t.registerStatus === 'approved')
    if (teams.length < 2) fail('至少需要 2 支已审核队伍才能生成对阵')
    col('groups').removeWhere((g) => g.matchId === matchId)
    const oldF = col('fixtures').find((f) => f.matchId === matchId)
    oldF.forEach((f) => col('sub_fixtures').removeWhere((s) => s.fixtureId === f._id))
    col('fixtures').removeWhere((f) => f.matchId === matchId)

    const teamIds = teams.map((t) => t._id)
    const created = []

    const makeFix = (pair, meta) => {
      const f = {
        _id: nid('f_'),
        matchId,
        round: meta.round,
        stage: meta.stage,
        groupId: meta.groupId || '',
        teamAId: pair[0] || '',
        teamBId: pair[1] || '',
        status: pair[0] && pair[1] ? 'pending' : 'pending',
        venue: meta.venue || '场地 1',
        scheduleTime: meta.time || match.startDate,
        refereeIds: [],
        result: { winnerTeamId: '', teamAScore: 0, teamBScore: 0 },
        code: meta.code,
        createdAt: nowIso()
      }
      col('fixtures').insert(f)
      if (f.teamAId && f.teamBId) createSubFixtures(f, match)
      created.push(f)
    }

    if (match.progression === 'round_robin') {
      const rounds = roundRobinRounds(teamIds)
      rounds.forEach((pairs, ri) => {
        pairs.forEach((p, pi) =>
          makeFix(p, {
            round: `第 ${ri + 1} 轮`,
            stage: 'round',
            code: `R${ri + 1}-${pi + 1}`,
            venue: `场地 ${(pi % 4) + 1}`
          })
        )
      })
    } else if (match.progression === 'single_knockout') {
      const { pairs, size } = knockoutFirstRound(teamIds)
      const roundName = size <= 2 ? '决赛' : size <= 4 ? '半决赛' : size <= 8 ? '八强' : `${size} 强`
      pairs.forEach((p, i) => makeFix(p, { round: roundName, stage: 'knockout', code: `K${i + 1}` }))
      let n = pairs.length / 2
      let rn = 2
      while (n >= 1) {
        const name = n === 1 ? '决赛' : n === 2 ? '半决赛' : `${n * 2} 强`
        for (let i = 0; i < n; i++) makeFix(['', ''], { round: name, stage: 'knockout', code: `K${rn}-${i + 1}` })
        n = n / 2
        rn += 1
      }
    } else {
      const groups = autoGroup(teamIds)
      groups.forEach((g) => {
        const rec = { _id: nid('g_'), matchId, groupName: g.name, teamIds: g.teamIds }
        col('groups').insert(rec)
        g.teamIds.forEach((tid) => col('teams').update(tid, { groupId: rec._id }))
        const rounds = roundRobinRounds(g.teamIds)
        rounds.forEach((pairs, ri) => {
          pairs.forEach((p, pi) =>
            makeFix(p, {
              round: `小组赛第 ${ri + 1} 轮`,
              stage: 'group',
              groupId: rec._id,
              code: `${g.name}${ri + 1}${pi + 1}`,
              venue: `场地 ${(pi % 4) + 1}`
            })
          )
        })
      })
      const ko = Math.max(4, 2 ** Math.ceil(Math.log2(groups.length * 2)))
      const names = ko <= 4 ? ['半决赛', '半决赛', '决赛'] : ['八强', '八强', '八强', '八强', '半决赛', '半决赛', '决赛']
      names.forEach((name, i) => makeFix(['', ''], { round: name, stage: 'knockout', code: `KO${i + 1}` }))
    }

    col('matches').update(matchId, { status: 'in_progress' })
    return { count: created.length }
  },

  listFixtures(matchId) {
    const match = hydrateMatch(col('matches').findOne(matchId))
    const groups = col('groups')
      .find((g) => g.matchId === matchId)
      .map((g) => {
        const teams = g.teamIds.map((id) => col('teams').findOne(id)).filter(Boolean)
        const fixtures = col('fixtures').find((f) => f.groupId === g._id).map(hydrateFixture)
        const rank = rankingFromFixtures(teams, fixtures)
        return { ...g, teams, fixtures, rank }
      })
    const fixtures = col('fixtures').find((f) => f.matchId === matchId).map(hydrateFixture)
    return { match, groups, fixtures }
  },

  getFixture(id) {
    const f = hydrateFixture(col('fixtures').findOne(id))
    if (!f) fail('对阵不存在')
    f.match = hydrateMatch(col('matches').findOne(f.matchId))
    return f
  },

  assignReferee({ fixtureId, refereeIds }, ctx) {
    needAdmin(ctx)
    return hydrateFixture(col('fixtures').update(fixtureId, { refereeIds: refereeIds || [] }))
  },

  adjustFixture({ fixtureId, venue, scheduleTime, teamAId, teamBId }, ctx) {
    needAdmin(ctx)
    const patch = {}
    if (venue != null) patch.venue = venue
    if (scheduleTime != null) patch.scheduleTime = scheduleTime
    if (teamAId != null) patch.teamAId = teamAId
    if (teamBId != null) patch.teamBId = teamBId
    return hydrateFixture(col('fixtures').update(fixtureId, patch))
  },

  startSubFixture(id, ctx) {
    const u = needUser(ctx)
    const sub = col('sub_fixtures').findOne(id)
    if (!sub) fail('场次不存在')
    const f = col('fixtures').findOne(sub.fixtureId)
    const can = isAdmin(u) || (f.refereeIds || []).includes(u._id)
    if (!can) fail('仅被指派的裁判或管理员可记分')
    if (sub.status === 'pending') {
      col('sub_fixtures').update(id, { status: 'live' })
      col('fixtures').update(f._id, { status: 'live' })
    }
    return this.getSubFixture(id)
  },

  getSubFixture(id) {
    const sub = col('sub_fixtures').findOne(id)
    if (!sub) fail('场次不存在')
    const f = hydrateFixture(col('fixtures').findOne(sub.fixtureId))
    const match = hydrateMatch(col('matches').findOne(f.matchId))
    const item = col('match_items').findOne(sub.itemId)
    const logs = col('score_logs').find((l) => l.subFixtureId === id)
    return { ...sub, fixture: f, match, item, logs }
  },

  addPoint({ subFixtureId, side }, ctx) {
    const u = needUser(ctx)
    const sub = col('sub_fixtures').findOne(subFixtureId)
    if (!sub) fail('场次不存在')
    const f = col('fixtures').findOne(sub.fixtureId)
    if (!(isAdmin(u) || (f.refereeIds || []).includes(u._id))) fail('无权记分')
    const match = col('matches').findOne(f.matchId)
    const rule = match.scoring || { points: 21, capPoints: 30, deuceMargin: 2 }
    if (['finished', 'confirmed'].includes(sub.status)) fail('本场已结束')
    if (sub.status === 'pending') col('sub_fixtures').update(subFixtureId, { status: 'live' })

    const sets = [...(sub.sets || [{ aScore: 0, bScore: 0, winner: '' }])]
    let idx = sets.findIndex((s) => !s.winner)
    if (idx < 0) {
      sets.push({ aScore: 0, bScore: 0, winner: '' })
      idx = sets.length - 1
    }
    if (side === 'a') sets[idx].aScore += 1
    else sets[idx].bScore += 1

    col('score_logs').insert({
      _id: nid('log_'),
      subFixtureId,
      operatorId: u._id,
      type: 'add',
      payload: { side, set: idx + 1, a: sets[idx].aScore, b: sets[idx].bScore },
      createdAt: nowIso()
    })

    const cur = sets[idx]
    let status = 'live'
    let winner = sub.winner || ''
    if (judgeSetEnd(cur.aScore, cur.bScore, rule)) {
      cur.winner = cur.aScore > cur.bScore ? 'a' : 'b'
      const t = tallySets(sets, 2)
      if (t.finished) {
        status = 'finished'
        winner = t.winner
      } else {
        status = 'set_break'
        sets.push({ aScore: 0, bScore: 0, winner: '' })
      }
    }
    col('sub_fixtures').update(subFixtureId, {
      sets,
      status,
      winner,
      currentSet: sets.filter((s) => s.winner).length + (status === 'finished' ? 0 : 1)
    })
    refreshFixtureResult(f._id)
    return this.getSubFixture(subFixtureId)
  },

  undoPoint(subFixtureId, ctx) {
    const u = needUser(ctx)
    const logs = col('score_logs').find((l) => l.subFixtureId === subFixtureId && l.type === 'add')
    const last = logs[logs.length - 1]
    if (!last) fail('暂无上一步记录')
    const sub = col('sub_fixtures').findOne(subFixtureId)
    const f = col('fixtures').findOne(sub.fixtureId)
    if (!(isAdmin(u) || (f.refereeIds || []).includes(u._id))) fail('无权撤销')
    const sets = JSON.parse(JSON.stringify(sub.sets || []))
    let idx = sets.length - 1
    while (idx >= 0 && sets[idx].aScore === 0 && sets[idx].bScore === 0 && !sets[idx].winner) {
      sets.pop()
      idx -= 1
    }
    if (idx < 0) fail('暂无上一步记录')
    if (sets[idx].winner) sets[idx].winner = ''
    if (last.payload?.side === 'a' && sets[idx].aScore > 0) sets[idx].aScore -= 1
    if (last.payload?.side === 'b' && sets[idx].bScore > 0) sets[idx].bScore -= 1
    col('score_logs').remove(last._id)
    col('score_logs').insert({
      _id: nid('log_'),
      subFixtureId,
      operatorId: u._id,
      type: 'undo',
      payload: last.payload,
      createdAt: nowIso()
    })
    col('sub_fixtures').update(subFixtureId, {
      sets,
      status: 'live',
      winner: '',
      currentSet: sets.filter((s) => s.winner).length + 1
    })
    refreshFixtureResult(f._id)
    return this.getSubFixture(subFixtureId)
  },

  confirmSubFixture(id, ctx) {
    const u = needUser(ctx)
    const sub = col('sub_fixtures').findOne(id)
    const f = col('fixtures').findOne(sub.fixtureId)
    if (!(isAdmin(u) || (f.refereeIds || []).includes(u._id))) fail('无权确认')
    if (sub.status !== 'finished') fail('比赛尚未结束')
    col('sub_fixtures').update(id, { status: 'confirmed' })
    refreshFixtureResult(f._id)
    return this.getFixture(f._id)
  },

  getResults(matchId) {
    const match = hydrateMatch(col('matches').findOne(matchId))
    if (!match) fail('比赛不存在')
    const teams = col('teams').find((t) => t.matchId === matchId && t.registerStatus === 'approved')
    const fixtures = col('fixtures').find((f) => f.matchId === matchId).map(hydrateFixture)
    const rank = rankingFromFixtures(teams, fixtures)
    const groups = col('groups')
      .find((g) => g.matchId === matchId)
      .map((g) => ({
        ...g,
        rank: rankingFromFixtures(
          g.teamIds.map((id) => col('teams').findOne(id)).filter(Boolean),
          fixtures.filter((f) => f.groupId === g._id)
        )
      }))
    return {
      match,
      rank,
      groups,
      fixtures: fixtures.filter((f) => ['finished', 'confirmed'].includes(f.status)),
      latest: fixtures.filter((f) => ['finished', 'confirmed'].includes(f.status)).slice(-6).reverse()
    }
  },

  listPhotos({ matchId, uploaderId } = {}) {
    let list = col('photos').all()
    if (matchId) list = list.filter((p) => p.matchId === matchId)
    if (uploaderId) list = list.filter((p) => p.uploaderId === uploaderId)
    return list
      .sort((a, b) => (b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0) || (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((p) => ({ ...p, uploaderName: userName(p.uploaderId) }))
  },

  addPhoto(data, ctx) {
    const u = needUser(ctx)
    const p = {
      _id: nid('p_'),
      matchId: data.matchId,
      uploaderId: u._id,
      teamId: data.teamId || '',
      url: data.url || '',
      caption: data.caption || '比赛瞬间',
      color: data.color || '#5BC8A0',
      isFeatured: false,
      createdAt: nowIso()
    }
    col('photos').insert(p)
    return p
  },

  deletePhoto(id, ctx) {
    const u = needUser(ctx)
    const p = col('photos').findOne(id)
    if (!p) fail('照片不存在')
    if (p.uploaderId !== u._id && !isAdmin(u)) fail('无权删除')
    col('photos').remove(id)
    return { ok: true }
  },

  featurePhoto(id, ctx) {
    needAdmin(ctx)
    const p = col('photos').findOne(id)
    return col('photos').update(id, { isFeatured: !p.isFeatured })
  },

  applyRole(data, ctx) {
    const u = needUser(ctx)
    if (!data.applyRole) fail('请选择申请角色')
    const pending = col('role_applications').findOne(
      (a) => a.userId === u._id && a.applyRole === data.applyRole && a.status === 'pending'
    )
    if (pending) fail('该角色已有待审核申请')
    return col('role_applications').insert({
      _id: nid('ra_'),
      userId: u._id,
      applyRole: data.applyRole,
      name: data.name || u.nickname,
      phone: data.phone || u.phone,
      extra: data.extra || '',
      status: 'pending',
      reviewerId: '',
      rejectReason: '',
      createdAt: nowIso(),
      reviewedAt: ''
    })
  },

  listMyApplications(ctx) {
    const u = needUser(ctx)
    return col('role_applications')
      .find((a) => a.userId === u._id)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  },

  listApplications({ status } = {}, ctx) {
    needAdmin(ctx)
    let list = col('role_applications').all()
    if (status) list = list.filter((a) => a.status === status)
    return list
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      .map((a) => ({ ...a, userName: userName(a.userId), roleLabel: a.applyRole }))
  },

  reviewApplication({ id, action, reason }, ctx) {
    const admin = needAdmin(ctx)
    const a = col('role_applications').findOne(id)
    if (!a) fail('申请不存在')
    if (action === 'approve') {
      const u = col('users').findOne(a.userId)
      const roles = Array.from(new Set([...(u.roles || []), a.applyRole, 'member']))
      col('users').update(u._id, { roles })
      return col('role_applications').update(id, {
        status: 'approved',
        reviewerId: admin._id,
        reviewedAt: nowIso(),
        rejectReason: ''
      })
    }
    return col('role_applications').update(id, {
      status: 'rejected',
      reviewerId: admin._id,
      reviewedAt: nowIso(),
      rejectReason: reason || '未通过审核'
    })
  },

  listReferees() {
    return col('users').find((u) => (u.roles || []).includes('referee') || (u.roles || []).includes('super_admin'))
  },

  myRefereeFixtures(ctx) {
    const u = needUser(ctx)
    return col('fixtures')
      .find((f) => (f.refereeIds || []).includes(u._id))
      .map(hydrateFixture)
  }
}
