import { col } from './db'
import { seedDemo } from './seed'
import {
  getGuestActivityList,
  getGuestActivity,
  getGuestMatchList,
  getGuestMatch,
  getGuestFixtures,
  getGuestResults,
  getGuestFixture,
  GUEST_ACTIVITY_ID,
  GUEST_MATCH_ID
} from './guest-catalog'
import {
  nid,
  nowIso,
  hasAnyRole,
  isAdmin,
  isSuper,
  assignableRoles,
  genderCount
} from '@/utils/format'
import { DEFAULT_ITEMS, USER_KEY, GUEST_USER_ID } from '@/utils/constants'
import { sanitizeMatchItems, sanitizeTeamRule } from '@/utils/match-format'
import { judgeSetEnd, tallySets, judgeTeamWinner } from '@/utils/scoring'
import { rankingFromFixtures, planRoundRobin } from '@/utils/fixture-gen'
import { nextMatchNo, makeFixtureCode, makeGameCode, slotDateTime } from '@/utils/match-code'
import { normalizeConcurrent, itemGenderNeed, validateTeamConcurrent } from '@/utils/concurrent'

function fail(message) {
  const err = new Error(message)
  err.biz = true
  throw err
}

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

function resolveCtx(...args) {
  for (let i = args.length - 1; i >= 0; i--) {
    const a = args[i]
    // 只认显式的 { user } 上下文，避免业务 payload 误判
    if (
      a &&
      typeof a === 'object' &&
      Object.prototype.hasOwnProperty.call(a, 'user') &&
      !Object.prototype.hasOwnProperty.call(a, 'activityId') &&
      !Object.prototype.hasOwnProperty.call(a, 'matchId') &&
      !Object.prototype.hasOwnProperty.call(a, 'code')
    ) {
      return a
    }
  }
  try {
    return { user: uni.getStorageSync(USER_KEY) || null }
  } catch (e) {
    return { user: null }
  }
}

function isGuestUser(user) {
  if (!user) return false
  if (user.openid) return false
  return !!(user.isGuest || user._id === GUEST_USER_ID)
}

function needUser(ctx) {
  const user = resolveCtx(ctx).user
  if (!user || isGuestUser(user)) fail('请先登录')
  const fresh = col('users').findOne(user._id) || user
  if (fresh.deleted) fail('账号已停用，请重新登录注册')
  return fresh
}

function needAdmin(ctx) {
  const u = needUser(ctx)
  if (!isAdmin(u)) fail('需要管理员权限')
  return u
}

function needSuper(ctx) {
  const u = needUser(ctx)
  if (!isSuper(u)) fail('需要超级管理员权限')
  return u
}

function userGroupIds(user) {
  return Array.isArray(user?.groupIds) ? user.groupIds : []
}

function clearDefaultGroups(exceptId = '') {
  col('groups')
    .all()
    .forEach((g) => {
      if (g.deleted) return
      if (g.isDefault && g._id !== exceptId) col('groups').update(g._id, { isDefault: false })
    })
}

function getDefaultGroupId() {
  return col('groups').findOne((g) => !g.deleted && g.isDefault)?._id || ''
}

/** 是否可见该活动：管理员全可见；未限制组别则全员可见；否则需命中允许组别 */
function canSeeActivity(activity, user) {
  if (!user || isGuestUser(user)) return false
  if (isAdmin(user)) return true
  const allow = activity.allowGroupIds || []
  if (!allow.length) return true
  const mine = userGroupIds(user)
  return allow.some((gid) => mine.includes(gid))
}

function canRegisterActivity(activity, user) {
  return canSeeActivity(activity, user)
}

function groupName(id) {
  const g = col('groups').findOne(id)
  if (!g || g.deleted) return ''
  return g.name || '未命名组别'
}

function requireAliveGroup(gid) {
  const g = col('groups').findOne(gid)
  if (!g || g.deleted) fail('组别不存在')
  return g
}

function userName(id) {
  return col('users').findOne(id)?.nickname || col('users').findOne(id)?.realName || '未知'
}

function teamCaptainName(t) {
  if (t.captainName) return t.captainName
  const cap = (t.members || []).find((m) => m.isCaptain)
  if (cap?.name) return cap.name
  return userName(t.captainId)
}

function teamName(id) {
  if (!id) return '待定'
  return col('teams').findOne(id)?.name || '待定'
}

function pushNotify(userId, title, content, extra = {}) {
  if (!userId) return
  col('notifications').insert({
    _id: nid('n_'),
    userId,
    title,
    content,
    extra,
    read: false,
    createdAt: nowIso()
  })
}

function activeMembers(team) {
  return (team.members || []).filter((m) => m.status === 'active')
}

function hydrateMatch(m) {
  if (!m) return null
  const items = col('match_items').find((i) => i.matchId === m._id).sort((a, b) => a.sort - b.sort)
  const teams = col('teams').find((t) => t.matchId === m._id)
  const fixtures = col('fixtures').find((f) => f.matchId === m._id)
  return {
    ...m,
    items,
    teamCount: teams.length,
    fixtureCount: fixtures.length,
    memberCount: teams.reduce((n, t) => n + activeMembers(t).length, 0)
  }
}

function hydrateFixture(f, viewer = null) {
  if (!f) return null
  const teamA = col('teams').findOne(f.teamAId)
  const teamB = col('teams').findOne(f.teamBId)
  const subs = col('sub_fixtures')
    .find((s) => s.fixtureId === f._id)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  const items = col('match_items').all()
  const itemMap = Object.fromEntries(items.map((i) => [i._id, i]))

  const viewerOnA = viewer && teamSideOfUser(viewer, teamA) !== ''
  const viewerOnB = viewer && teamSideOfUser(viewer, teamB) !== ''

  const subFixtures = subs
    .map((s) => {
      const both = !!s.lineupASubmitted && !!s.lineupBSubmitted
      // 本队可见本方；双方都提交后所有人可见双方
      const canShowA = both || viewerOnA
      const canShowB = both || viewerOnB
      const playersA = canShowA ? s.playersA || resolvePlayers(teamA, s.playerAIds) : []
      const playersB = canShowB ? s.playersB || resolvePlayers(teamB, s.playerBIds) : []
      return {
        ...s,
        itemName: itemMap[s.itemId]?.name || '单项',
        itemSort: itemMap[s.itemId]?.sort || 99,
        memberCount: itemMap[s.itemId]?.memberCount || 1,
        refereeNames: (s.refereeIds || []).map(userName).filter(Boolean).join('、'),
        setText: (s.sets || [])
          .filter((x) => x.winner || (x.aScore && x.bScore))
          .map((x) => `${x.aScore}:${x.bScore}`)
          .join(' · '),
        lineupBothReady: both,
        lineupASubmitted: !!s.lineupASubmitted,
        lineupBSubmitted: !!s.lineupBSubmitted,
        // 未公开时不返回 id，避免泄露
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
      }
    })
    .sort((a, b) => a.itemSort - b.itemSort)

  const fixtureRefNames = (f.refereeIds || []).map(userName).filter(Boolean)
  const subRefNames = subFixtures.flatMap((s) => (s.refereeNames ? s.refereeNames.split('、') : []))
  const allRef = Array.from(new Set([...fixtureRefNames, ...subRefNames]))

  return {
    ...f,
    teamAName: teamA?.name || teamName(f.teamAId),
    teamBName: teamB?.name || teamName(f.teamBId),
    refereeNames: allRef.join('、'),
    subFixtures,
    viewerOnA,
    viewerOnB
  }
}

function teamSideOfUser(user, team) {
  if (!user || !team) return ''
  if (isAdmin(user)) return '' // 管理员不当作任一方，提交时再显式选边
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

function hydrateActivity(a) {
  if (!a) return null
  const regs = col('activity_registrations').find((r) => r.activityId === a._id && r.status !== 'cancelled')
  const confirmed = regs.filter((r) => r.status === 'confirmed')
  const queued = regs.filter((r) => r.status === 'queued')
  return {
    ...a,
    confirmedCount: confirmed.length,
    queuedCount: queued.length,
    remain: Math.max(0, (a.maxCount || 0) - confirmed.length)
  }
}

function canViewMatch(matchId, user) {
  if (!user) return false
  if (isAdmin(user)) return true
  const match = col('matches').findOne(matchId)
  if (!match || match.deleted) return false
  if ((match.refereeIds || []).includes(user._id)) return true
  const teams = col('teams').find((t) => t.matchId === matchId)
  const inTeam = teams.some(
    (t) =>
      t.captainId === user._id ||
      (t.members || []).some((m) => m.userId === user._id && m.status === 'active')
  )
  if (inTeam) return true
  if (col('fixtures').find((f) => f.matchId === matchId && (f.refereeIds || []).includes(user._id)).length) {
    return true
  }
  const subHit = col('sub_fixtures').find((s) => (s.refereeIds || []).includes(user._id))
  if (
    subHit.some((s) => {
      const f = col('fixtures').findOne(s.fixtureId)
      return f && f.matchId === matchId
    })
  ) {
    return true
  }
  const sp = col('match_spectators').findOne((s) => s.matchId === matchId && s.userId === user._id && s.status === 'approved')
  return !!sp
}

function createSubFixtures(fixture, match) {
  const items = col('match_items').find((i) => i.matchId === match._id).sort((a, b) => a.sort - b.sort)
  const seen = {}
  items.forEach((item) => {
    seen[item.name] = (seen[item.name] || 0) + 1
    col('sub_fixtures').insert({
      _id: nid('sf_'),
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
  })
}

function canRefereeFixture(u, fixture, sub, match) {
  if (!u) return false
  if (isAdmin(u)) return true
  const m = match || (fixture?.matchId ? col('matches').findOne(fixture.matchId) : null)
  if (m && (m.refereeIds || []).includes(u._id)) return true
  if (sub && (sub.refereeIds || []).includes(u._id)) return true
  if ((fixture.refereeIds || []).includes(u._id)) return true
  return false
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
  if (r.locked && r.winner) patch.status = 'finished'
  else if (subs.some((s) => s.status === 'live' || s.status === 'set_break')) patch.status = 'live'
  col('fixtures').update(fixtureId, patch)
  const fixtures = col('fixtures').find((x) => x.matchId === match._id)
  const playable = fixtures.filter((x) => x.teamAId && x.teamBId)
  if (playable.length && playable.every((x) => ['finished', 'confirmed'].includes(x.status))) {
    col('matches').update(match._id, { status: 'finished' })
  }
}

function promoteQueue(activityId) {
  const activity = col('activities').findOne(activityId)
  if (!activity) return null
  const confirmed = col('activity_registrations').find((r) => r.activityId === activityId && r.status === 'confirmed')
  if (confirmed.length >= activity.maxCount) return null
  const queue = col('activity_registrations')
    .find((r) => r.activityId === activityId && r.status === 'queued')
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.queueNo - b.queueNo)
  const next = queue[0]
  if (!next) return null
  col('activity_registrations').update(next._id, { status: 'confirmed', queueNo: 0 })
  // 重排候补序号
  queue.slice(1).forEach((r, i) => col('activity_registrations').update(r._id, { queueNo: i + 1 }))
  pushNotify(next.userId, '候补成功', `您已从候补队列进入「${activity.name}」正式名单，请按时参加。`, {
    activityId,
    type: 'queue_promoted'
  })
  return next
}

export const service = {
  init() {
    // 不再自动注入演示账号；空库可用微信登录后由管理员发布活动/比赛
    return { ok: true }
  },

  seedDemo(force) {
    return seedDemo(!!force)
  },

  createWebLoginTicket() {
    const ticketId = Math.random().toString(36).slice(2, 10)
    const expireAt = Date.now() + 5 * 60 * 1000
    col('web_login_tickets').insert({
      _id: ticketId,
      status: 'pending',
      userId: '',
      consumed: false,
      createdAt: nowIso(),
      expireAt
    })
    return { ticketId, qrBase64: '', expireAt }
  },

  pollWebLoginTicket({ ticketId } = {}) {
    const t = col('web_login_tickets').findOne(ticketId)
    if (!t) return { status: 'invalid' }
    if (t.status === 'pending' && Date.now() > Number(t.expireAt || 0)) return { status: 'expired' }
    if (t.status === 'approved' && t.userId && !t.consumed) {
      const u = col('users').findOne(t.userId)
      if (!u || u.deleted || !isAdmin(u)) return { status: 'invalid' }
      col('web_login_tickets').update(ticketId, { consumed: true, consumedAt: nowIso() })
      return { status: 'approved', user: { ...u, isGuest: false } }
    }
    if (t.consumed) return { status: 'consumed' }
    return { status: t.status || 'pending' }
  },

  confirmWebLogin({ ticketId, scene } = {}, ctx) {
    const u = needUser(ctx)
    if (!isAdmin(u)) fail('仅超级管理员/管理员可登录网页后台')
    const id = String(ticketId || scene || '').trim()
    const t = col('web_login_tickets').findOne(id)
    if (!t) fail('登录码无效')
    if (t.status !== 'pending') fail('登录码已使用或已失效')
    if (Date.now() > Number(t.expireAt || 0)) fail('登录码已过期，请在网页刷新二维码')
    col('web_login_tickets').update(id, { status: 'approved', userId: u._id, confirmedAt: nowIso() })
    return { ok: true }
  },

  webPasswordLogin({ loginName, username, password } = {}) {
    const name = String(loginName || username || '').trim()
    const pwd = String(password || '')
    if (!name || !pwd) fail('请输入账号和密码')
    if (name !== 'admin' || pwd !== '123456Abc') fail('账号或密码错误')
    let u = col('users').findOne((x) => x.loginName === 'admin' && !x.deleted)
    if (!u) {
      u = {
        _id: 'u_web_admin',
        openid: 'web:admin',
        loginName: 'admin',
        phone: '13800000000',
        realName: '系统管理员',
        nickname: '管理员',
        department: '系统',
        gender: 'male',
        roles: ['super_admin', 'admin', 'member'],
        groupIds: [],
        contacts: [],
        avatar: '',
        verified: true,
        approveStatus: 'approved',
        deleted: false,
        isGuest: false,
        createdAt: nowIso()
      }
      col('users').insert(u)
    }
    if (!isAdmin(u)) fail('仅管理员可登录网页后台')
    const { passwordHash, passwordSalt, ...rest } = u
    return { ...rest, isGuest: false }
  },

  /** 本地模拟登录：确保有演示库，并以超管身份进入 */
  localDevLogin() {
    seedDemo(false)
    const u = col('users').findOne('u_lin') || col('users').all()[0]
    if (!u) fail('本地演示数据初始化失败')
    return { ...u, isGuest: false }
  },

  /** 将云端用户同步到本地业务库（仅本地模拟模式使用） */
  syncUser(cloudUser) {
    if (!cloudUser?.openid && !cloudUser?._id) fail('无效用户')
    let u =
      (cloudUser._id && col('users').findOne(cloudUser._id)) ||
      (!cloudUser._id &&
        cloudUser.openid &&
        col('users').findOne((x) => x.openid === cloudUser.openid && !x.deleted))
    const patch = {
      openid: cloudUser.openid || u?.openid || '',
      unionid: cloudUser.unionid || u?.unionid || '',
      phone: cloudUser.phone ?? u?.phone ?? '',
      realName: cloudUser.realName ?? u?.realName ?? '',
      nickname: cloudUser.nickname || u?.nickname || '微信用户',
      department: cloudUser.department ?? u?.department ?? '',
      gender: cloudUser.gender || u?.gender || 'male',
      roles: cloudUser.roles || u?.roles || ['member'],
      groupIds: cloudUser.groupIds || u?.groupIds || [],
      contacts: cloudUser.contacts || u?.contacts || [],
      avatar: cloudUser.avatar ?? u?.avatar ?? '',
      verified: !!(cloudUser.phone || u?.phone),
      deleted: !!cloudUser.deleted,
      deletedAt: cloudUser.deletedAt || u?.deletedAt || '',
      approveStatus:
        cloudUser.approveStatus ??
        u?.approveStatus ??
        (isSuper({ roles: cloudUser.roles || u?.roles }) ? 'approved' : ''),
      rejectReason: cloudUser.rejectReason ?? u?.rejectReason ?? ''
    }
    if (u) {
      return col('users').update(u._id, patch)
    }
    const neu = {
      _id: cloudUser._id || nid('u_'),
      ...patch,
      createdAt: cloudUser.createdAt || nowIso()
    }
    col('users').insert(neu)
    return neu
  },

  /** @deprecated 演示登录已移除 */
  login() {
    fail('请使用微信登录')
  },

  wxLogin(data = {}) {
    const openid = data.openid
    if (!openid) fail('缺少 openid')
    return this.syncUser({
      _id: data._id,
      openid,
      unionid: data.unionid,
      nickname: data.nickname || '微信用户',
      avatar: data.avatar || '',
      phone: data.phone || '',
      realName: data.realName || '',
      department: data.department || '',
      gender: data.gender || 'male',
      roles: data.roles || ['member'],
      groupIds: data.groupIds || [],
      contacts: data.contacts || [],
      createdAt: data.createdAt
    })
  },

  getProfile(payload, ctx) {
    return needUser(resolveCtx(payload, ctx))
  },

  updateProfile(patch, ctx) {
    const u = needUser(ctx)
    if (patch.phone !== undefined && !patch.phone) fail('手机号不能为空')
    if (patch.department !== undefined && patch.submitForReview && !String(patch.department || '').trim()) {
      fail('请填写部门')
    }
    const next = {
      nickname: patch.nickname ?? u.nickname,
      realName: patch.realName ?? u.realName,
      phone: patch.phone ?? u.phone,
      department: patch.department ?? u.department,
      gender: patch.gender ?? u.gender,
      avatar: patch.avatar !== undefined ? patch.avatar : u.avatar,
      verified: !!(patch.phone || u.phone)
    }
    // 首次完善资料 → 进入待审核（超管除外）
    if (patch.submitForReview && next.phone && next.realName) {
      if (isSuper(u) || u.approveStatus === 'approved') {
        next.approveStatus = 'approved'
      } else {
        next.approveStatus = 'pending'
        next.rejectReason = ''
        next.submittedAt = nowIso()
      }
    }
    return col('users').update(u._id, next)
  },

  listPendingUsers(payload, ctx) {
    needSuper(resolveCtx(payload, ctx))
    return col('users')
      .find((u) => !u.deleted && u.approveStatus === 'pending')
      .map((u) => ({
        ...u,
        groupNames: userGroupIds(u).map(groupName).filter(Boolean)
      }))
      .sort((a, b) => (b.submittedAt || b.createdAt || '').localeCompare(a.submittedAt || a.createdAt || ''))
  },

  approveUser(data = {}, ctx) {
    needSuper(ctx)
    const target = col('users').findOne(data.userId)
    if (!target || target.deleted) fail('用户不存在')
    if (target.approveStatus === 'approved' && data.approved !== false) {
      // 允许补充分配组别
    } else if (target.approveStatus !== 'pending' && data.approved !== false) {
      fail('该用户不在待审核状态')
    }

    if (data.approved === false) {
      return col('users').update(target._id, {
        approveStatus: 'rejected',
        rejectReason: (data.reason || '').trim() || '未通过审核',
        groupIds: []
      })
    }

    const ids = Array.isArray(data.groupIds) ? data.groupIds.filter(Boolean) : []
    if (!ids.length) fail('请为用户选择组别')
    for (const gid of ids) {
      requireAliveGroup(gid)
    }
    return col('users').update(target._id, {
      approveStatus: 'approved',
      rejectReason: '',
      groupIds: Array.from(new Set(ids)),
      verified: true,
      approvedAt: nowIso()
    })
  },

  listUsers(payload, ctx) {
    needAdmin(resolveCtx(payload, ctx))
    return col('users')
      .all()
      .filter((u) => u && !u.deleted && !u.isGuest)
      .map((u) => ({
        ...u,
        groupNames: userGroupIds(u).map(groupName).filter(Boolean)
      }))
  },

  addContact(contact, ctx) {
    const u = needUser(ctx)
    const contacts = [...(u.contacts || [])]
    if (!contact?.name || !contact?.phone) fail('请填写姓名和手机号')
    const i = contacts.findIndex((c) => c.phone === contact.phone)
    if (i >= 0) contacts[i] = { ...contacts[i], ...contact }
    else contacts.unshift(contact)
    return col('users').update(u._id, { contacts: contacts.slice(0, 20) })
  },

  setUserRoles({ userId, roles }, ctx) {
    const admin = needUser(ctx)
    const allow = assignableRoles(admin)
    if (!allow.length) fail('无权指定角色')
    if (!Array.isArray(roles) || !roles.length) fail('至少保留一个角色')
    const normalized = Array.from(new Set(roles.includes('member') ? roles : [...roles, 'member']))
    for (const r of normalized) {
      if (r === 'member') continue
      if (r === 'super_admin') fail('无法在此指定该角色')
      if (!allow.includes(r)) fail(`无权指定角色：${r}`)
    }
    const target = col('users').findOne(userId)
    if (!target || target.deleted) fail('用户不存在')
    if ((target.roles || []).includes('super_admin') && !isSuper(admin)) fail('不可修改超级管理员')
    return col('users').update(userId, { roles: normalized })
  },

  setUserGroups({ userId, groupIds }, ctx) {
    needAdmin(ctx)
    const target = col('users').findOne(userId)
    if (!target || target.deleted) fail('用户不存在')
    const ids = Array.isArray(groupIds) ? groupIds : []
    for (const gid of ids) {
      requireAliveGroup(gid)
    }
    return col('users').update(userId, { groupIds: Array.from(new Set(ids)) })
  },

  listGroups(payload, ctx) {
    const user = resolveCtx(payload, ctx).user
    if (!user || isGuestUser(user)) return []
    return col('groups')
      .all()
      .filter((g) => g && !g.deleted)
      .slice()
      .sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1
        if (!a.isDefault && b.isDefault) return 1
        return (a.name || '').localeCompare(b.name || '', 'zh')
      })
  },

  getDefaultGroup(payload, ctx) {
    const user = resolveCtx(payload, ctx).user
    if (!user || isGuestUser(user)) return null
    const id = getDefaultGroupId()
    return id ? col('groups').findOne(id) : null
  },

  createGroup(data, ctx) {
    needAdmin(ctx)
    const name = (data.name || '').trim()
    if (!name) fail('请填写组别名称')
    if (col('groups').findOne((g) => !g.deleted && g.name === name)) fail('组别名称已存在')
    const isDefault = !!data.isDefault
    if (isDefault) clearDefaultGroups()
    const g = {
      _id: nid('g_'),
      name,
      isDefault,
      deleted: false,
      createdAt: nowIso(),
      creatorId: needUser(ctx)._id
    }
    col('groups').insert(g)
    return g
  },

  updateGroup({ id, name, isDefault }, ctx) {
    needAdmin(ctx)
    const g = col('groups').findOne(id)
    if (!g || g.deleted) fail('组别不存在')
    const patch = {}
    if (name !== undefined) {
      const n = (name || '').trim()
      if (!n) fail('请填写组别名称')
      if (col('groups').findOne((x) => !x.deleted && x.name === n && x._id !== id)) fail('组别名称已存在')
      patch.name = n
    }
    if (isDefault !== undefined) {
      if (isDefault) clearDefaultGroups(id)
      patch.isDefault = !!isDefault
    }
    return col('groups').update(id, patch)
  },

  setDefaultGroup({ id }, ctx) {
    needAdmin(ctx)
    const g = col('groups').findOne(id)
    if (!g || g.deleted) fail('组别不存在')
    clearDefaultGroups(id)
    return col('groups').update(id, { isDefault: true })
  },

  deleteGroup({ id }, ctx) {
    needAdmin(ctx)
    const g = col('groups').findOne(id)
    if (!g || g.deleted) fail('组别不存在')
    const members = col('users')
      .all()
      .filter((u) => u && !u.deleted && userGroupIds(u).includes(id))
    if (members.length) {
      fail(`该组别仍有 ${members.length} 名人员，请先清空人员后再删除`)
    }
    // 活动保留 allowGroupIds：其他组别因不匹配而看不见，活动记录本身不删
    col('groups').update(id, { deleted: true, deletedAt: nowIso(), isDefault: false })
    return { ok: true }
  },

  deleteUser({ userId }, ctx) {
    const admin = needSuper(ctx)
    const target = col('users').findOne(userId)
    if (!target || target.deleted) fail('用户不存在')
    if ((target.roles || []).includes('super_admin')) fail('不可删除超级管理员')
    if (target._id === admin._id) fail('不可删除自己')
    // 软删保留原记录；同 openid 再次登录会新建账号并重新走审核
    col('users').update(userId, { deleted: true, deletedAt: nowIso() })
    return { ok: true }
  },

  // ---------- 日常活动 ----------
  listActivities(query = {}, ctx) {
    const user = resolveCtx(ctx).user
    if (isGuestUser(user)) return getGuestActivityList()
    let list = col('activities')
      .all()
      .filter((a) => a && !a.deleted && a._id !== GUEST_ACTIVITY_ID && !a.guestOnly)
      .map(hydrateActivity)
    list = list.filter((a) => canSeeActivity(a, user))
    if (query.status) list = list.filter((a) => a.status === query.status)
    if (query.keyword) list = list.filter((a) => a.name.includes(query.keyword))
    return list.sort((a, b) => (b.startTime || '').localeCompare(a.startTime || ''))
  },

  getActivity(id, ctx) {
    const user = resolveCtx(ctx).user
    if (isGuestUser(user)) {
      const g = getGuestActivity(id)
      if (g) return g
      fail('活动不存在')
    }
    if (id === GUEST_ACTIVITY_ID) fail('活动不存在')
    const a = hydrateActivity(col('activities').findOne(id))
    if (!a || a.deleted || a.guestOnly) fail('活动不存在')
    if (!canSeeActivity(a, user)) fail('活动不存在')
    const regs = col('activity_registrations')
      .find((r) => r.activityId === id && r.status !== 'cancelled')
      .sort((x, y) => {
        if (x.status !== y.status) return x.status === 'confirmed' ? -1 : 1
        return (x.createdAt || '').localeCompare(y.createdAt || '')
      })
    a.registrations = regs
    a.myRegistration = user
      ? regs.find((r) => r.userId === user._id || (r.phone && r.phone === user.phone))
      : null
    a.canRegister = !!(user && canRegisterActivity(a, user) && a.status === 'open')
    return a
  },

  createActivity(data, ctx) {
    const creator = needAdmin(ctx)
    if (!data.name || !data.location) fail('请填写名称和地点')
    if (!data.maxCount || Number(data.maxCount) < 1) fail('请设置报名人数上限')
    const allowGroupIds = Array.isArray(data.allowGroupIds) ? data.allowGroupIds : []
    for (const gid of allowGroupIds) {
      requireAliveGroup(gid)
    }
    const a = {
      _id: nid('a_'),
      name: data.name,
      location: data.location,
      startTime: data.startTime,
      endTime: data.endTime || data.startTime,
      registerStart: data.registerStart,
      registerEnd: data.registerEnd,
      maxCount: Number(data.maxCount),
      allowGroupIds,
      notice: data.notice || '',
      status: data.publish === false ? 'draft' : 'open',
      deleted: false,
      creatorId: creator._id,
      createdAt: nowIso()
    }
    col('activities').insert(a)

    // 本人默认报名
    if (data.selfRegister && a.status === 'open') {
      const name = creator.realName || creator.nickname || ''
      const phone = creator.phone || ''
      if (name && phone) {
        const exist = col('activity_registrations').findOne(
          (r) =>
            r.activityId === a._id &&
            r.status !== 'cancelled' &&
            (r.userId === creator._id || r.phone === phone)
        )
        if (!exist) {
          col('activity_registrations').insert({
            _id: nid('ar_'),
            activityId: a._id,
            userId: creator._id,
            name,
            phone,
            department: creator.department || '',
            status: 'confirmed',
            queueNo: 0,
            isProxy: false,
            proxyByUserId: '',
            createdAt: nowIso()
          })
        }
      }
    }

    return hydrateActivity(a)
  },

  updateActivity({ id, ...data }, ctx) {
    needAdmin(ctx)
    const exist = col('activities').findOne(id)
    if (!exist || exist.deleted) fail('活动不存在')
    if (data.allowGroupIds) {
      for (const gid of data.allowGroupIds) {
        requireAliveGroup(gid)
      }
    }
    delete data.allowRoles
    delete data._id
    delete data.confirmedCount
    delete data.queuedCount
    delete data.remain
    delete data.registrations
    delete data.myRegistration
    delete data.canRegister
    if (data.maxCount !== undefined) data.maxCount = Number(data.maxCount)
    return hydrateActivity(col('activities').update(id, data))
  },

  deleteActivity({ id }, ctx) {
    needAdmin(ctx)
    const a = col('activities').findOne(id)
    if (!a || a.deleted) fail('活动不存在')
    col('activities').update(id, { deleted: true, deletedAt: nowIso() })
    return { ok: true }
  },

  registerActivity(data, ctx) {
    const u = needUser(ctx)
    const activity = col('activities').findOne(data.activityId)
    if (!activity || activity.deleted) fail('活动不存在')
    if (activity.status !== 'open') fail('当前不可报名')
    const now = Date.now()
    if (activity.registerStart && now < new Date(activity.registerStart).getTime()) fail('报名尚未开始')
    if (activity.registerEnd && now > new Date(activity.registerEnd).getTime()) fail('报名已结束')
    if (!canRegisterActivity(activity, u)) fail('您所在组别不可报名本活动')

    const name = data.name || u.realName || u.nickname
    const phone = data.phone || u.phone
    const department = data.department || u.department || ''
    if (!name || !phone) fail('请填写姓名和手机号')

    col('users').update(u._id, {
      realName: u.realName || name,
      department: department || u.department,
      phone: u.phone || phone
    })

    const exist = col('activity_registrations').findOne(
      (r) => r.activityId === data.activityId && r.status !== 'cancelled' && (r.userId === u._id || r.phone === phone)
    )
    if (exist && !data.isProxy) fail('您已报名或已在排队')

    if (data.isProxy && data.phone) {
      service.addContact({ name, phone, department }, { user: col('users').findOne(u._id) })
    }

    const confirmed = col('activity_registrations').find(
      (r) => r.activityId === data.activityId && r.status === 'confirmed'
    )
    const full = confirmed.length >= activity.maxCount
    const queued = col('activity_registrations').find((r) => r.activityId === data.activityId && r.status === 'queued')
    const rec = {
      _id: nid('ar_'),
      activityId: data.activityId,
      userId: data.isProxy ? '' : u._id,
      name,
      phone,
      department,
      isProxy: !!data.isProxy,
      proxyByUserId: data.isProxy ? u._id : '',
      status: full ? 'queued' : 'confirmed',
      queueNo: full ? queued.length + 1 : 0,
      createdAt: nowIso()
    }
    col('activity_registrations').insert(rec)
    return rec
  },

  cancelActivityRegistration({ registrationId, activityId }, ctx) {
    const u = needUser(ctx)
    const activity = col('activities').findOne(activityId)
    if (!activity || activity.deleted) fail('活动不存在')
    if (activity.registerEnd && Date.now() > new Date(activity.registerEnd).getTime()) fail('报名已结束，无法取消')
    let reg = registrationId
      ? col('activity_registrations').findOne(registrationId)
      : col('activity_registrations').findOne(
          (r) => r.activityId === activityId && r.status !== 'cancelled' && (r.userId === u._id || r.proxyByUserId === u._id)
        )
    if (!reg) fail('未找到报名记录')
    const can =
      isAdmin(u) ||
      reg.userId === u._id ||
      reg.proxyByUserId === u._id
    if (!can) fail('无权取消该报名')
    const wasConfirmed = reg.status === 'confirmed'
    col('activity_registrations').update(reg._id, { status: 'cancelled' })
    if (wasConfirmed) promoteQueue(activityId)
    else {
      // 重排候补
      const queue = col('activity_registrations')
        .find((r) => r.activityId === activityId && r.status === 'queued')
        .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
      queue.forEach((r, i) => col('activity_registrations').update(r._id, { queueNo: i + 1 }))
    }
    return { ok: true }
  },

  listNotifications(payload, ctx) {
    const u = resolveCtx(payload, ctx).user
    if (!u || isGuestUser(u)) return []
    return col('notifications')
      .find((n) => n.userId === u._id)
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
  },

  getMyStats(payload, ctx) {
    const u = resolveCtx(payload, ctx).user
    if (!u || isGuestUser(u)) {
      return { activityCount: 0, matchCount: 0 }
    }
    const activityCount = col('activity_registrations').find(
      (r) =>
        r.status !== 'cancelled' &&
        (r.userId === u._id || (u.phone && r.phone === u.phone))
    ).length
    const matchIds = new Set()
    col('teams').all().forEach((t) => {
      const inTeam =
        t.captainId === u._id ||
        (t.members || []).some((m) => m.userId === u._id && m.status === 'active')
      if (inTeam) matchIds.add(t.matchId)
    })
    return { activityCount, matchCount: matchIds.size }
  },

  // ---------- 比赛 ----------
  listMatches(query = {}, ctx) {
    const user = resolveCtx(ctx).user
    if (isGuestUser(user)) return getGuestMatchList()
    let list = col('matches')
      .all()
      .filter((m) => m && !m.deleted && m._id !== GUEST_MATCH_ID && !m.guestOnly)
      .map(hydrateMatch)
    if (query.status === 'live') list = list.filter((m) => m.status === 'in_progress')
    else if (query.status === 'upcoming') list = list.filter((m) => ['registering', 'locked', 'draft'].includes(m.status))
    else if (query.status === 'finished') list = list.filter((m) => ['finished', 'closed'].includes(m.status))
    else if (query.status) list = list.filter((m) => m.status === query.status)
    if (query.keyword) list = list.filter((m) => m.name.includes(query.keyword))
    if (query.mine && user) {
      const ids = new Set([
        ...col('teams')
          .find((t) => t.captainId === user._id || (t.members || []).some((m) => m.userId === user._id))
          .map((t) => t.matchId),
        ...col('fixtures')
          .find((f) => (f.refereeIds || []).includes(user._id))
          .map((f) => f.matchId),
        ...col('matches')
          .find((m) => m.creatorId === user._id || (m.refereeIds || []).includes(user._id))
          .map((m) => m._id)
      ])
      list = list.filter((m) => ids.has(m._id))
    }
    return list.sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))
  },

  getMatch(id, ctx) {
    const user = resolveCtx(ctx).user
    if (isGuestUser(user)) {
      const g = getGuestMatch(id)
      if (g) return g
      fail('比赛不存在')
    }
    if (id === GUEST_MATCH_ID) fail('比赛不存在')
    const m = hydrateMatch(col('matches').findOne(id))
    if (!m || m.deleted || m.guestOnly) fail('比赛不存在')
    m.teams = col('teams')
      .find((t) => t.matchId === id)
      .map((t) => ({
        ...t,
        captainName: teamCaptainName(t),
        activeCount: activeMembers(t).length,
        maleCount: genderCount(t.members, 'male'),
        femaleCount: genderCount(t.members, 'female')
      }))
    m.canViewDetail = canViewMatch(id, user)
    m.refereeNames = (m.refereeIds || []).map(userName).filter(Boolean).join('、')
    m.isMatchReferee = !!(user && (m.refereeIds || []).includes(user._id))
    m.spectator = user
      ? col('match_spectators').findOne((s) => s.matchId === id && s.userId === user._id)
      : null
    m.myTeam = user
      ? col('teams').findOne(
          (t) =>
            t.matchId === id &&
            (t.captainId === user._id || (t.members || []).some((x) => x.userId === user._id))
        )
      : null
    return m
  },

  createMatch(data, ctx) {
    needAdmin(ctx)
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
    const match = {
      _id: id,
      matchNo: nextMatchNo(col('matches').all().filter((x) => x && !x.deleted).map((x) => x.matchNo)),
      name: data.name,
      location: data.location,
      geo: pickGeo(data.geo),
      startDate: data.startDate,
      endDate: data.endDate || data.startDate,
      registerStart: data.registerStart,
      registerEnd: data.registerEnd,
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
      creatorId: needUser(ctx)._id,
      published: data.publish !== false,
      createdAt: nowIso()
    }
    col('matches').insert(match)
    col('match_items').insertMany(items)
    return hydrateMatch(match)
  },

  updateMatch({ id, ...data }, ctx) {
    needAdmin(ctx)
    const m = col('matches').findOne(id)
    if (!m || m.deleted) fail('比赛不存在')
    if (data.progression && data.progression !== 'round_robin') {
      fail('本期仅支持单循环赛，其他赛制即将开放')
    }
    const patch = { ...data }
    ;[
      '_id',
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
    if (patch.concurrent !== undefined) {
      patch.concurrent = normalizeConcurrent(patch.concurrent)
    }
    if (patch.progression) patch.progression = 'round_robin'
    if (patch.refereeIds !== undefined) {
      if (!Array.isArray(patch.refereeIds)) fail('裁判参数错误')
      patch.refereeIds = patch.refereeIds.filter(Boolean)
    }
    if (data.geo !== undefined) patch.geo = pickGeo(data.geo)
    if (data.items !== undefined) {
      const fixtures = col('fixtures').find((f) => f.matchId === id)
      if (fixtures.length) fail('已生成对阵，不能修改每场项目')
      let nextItems
      try {
        nextItems = sanitizeMatchItems(data.items)
      } catch (e) {
        fail(e.message || '项目设置有误')
      }
      col('match_items').removeWhere((it) => it.matchId === id)
      col('match_items').insertMany(
        nextItems.map((it) => ({
          _id: nid('mi_'),
          matchId: id,
          name: it.name,
          memberCount: it.memberCount,
          sort: it.sort
        }))
      )
    }
    const itemCount = col('match_items').find((it) => it.matchId === id).length
    if (data.teamRule !== undefined || data.items !== undefined) {
      try {
        patch.teamRule = sanitizeTeamRule(data.teamRule || m.teamRule, itemCount)
      } catch (e) {
        fail(e.message || '赛制设置有误')
      }
    }
    return hydrateMatch(col('matches').update(id, patch))
  },

  setMatchReferees({ matchId, id, refereeIds }, ctx) {
    needAdmin(ctx)
    const mid = matchId || id
    const m = col('matches').findOne(mid)
    if (!m || m.deleted) fail('比赛不存在')
    if (!Array.isArray(refereeIds)) fail('裁判参数错误')
    const ids = refereeIds.filter(Boolean)
    for (const rid of ids) {
      const u = col('users').findOne(rid)
      if (!u || u.deleted) fail('存在无效裁判用户')
      const roles = u.roles || []
      if (!roles.some((r) => ['referee', 'admin', 'super_admin'].includes(r))) {
        fail(`${u.realName || u.nickname || rid} 不是裁判角色`)
      }
    }
    return hydrateMatch(col('matches').update(mid, { refereeIds: ids }))
  },

  deleteMatch({ id }, ctx) {
    needAdmin(ctx)
    const m = col('matches').findOne(id)
    if (!m || m.deleted) fail('比赛不存在')
    // 软删除：保留比赛及关联记录
    col('matches').update(id, { deleted: true, deletedAt: nowIso() })
    return { ok: true }
  },

  saveTeam(data, ctx) {
    const u = needUser(ctx)
    if (!hasAnyRole(u, ['super_admin', 'admin', 'captain'])) fail('需要队长权限')
    const match = col('matches').findOne(data.matchId)
    if (!match || match.deleted) fail('比赛不存在')
    if (match.status !== 'registering' && !isAdmin(u)) fail('当前不可报名')
    if (!data.name) fail('请填写队名')
    if (!data.department) fail('请填写部门')

    const adminMode = isAdmin(u)
    let team = data._id ? col('teams').findOne(data._id) : null
    if (team && team.matchId !== data.matchId) fail('队伍不属于本场比赛')
    if (!team && !adminMode) {
      team = col('teams').findOne((t) => t.matchId === data.matchId && t.captainId === u._id)
    }
    if (team && !adminMode && team.captainId !== u._id) fail('无权编辑该队伍')

    // 队长身份：不自动把操作者写入队员名单
    let captainId = team?.captainId || ''
    let captainName = data.captainName !== undefined ? String(data.captainName || '').trim() : team?.captainName || ''
    let captainPhone = data.captainPhone !== undefined ? String(data.captainPhone || '').trim() : team?.captainPhone || ''

    if (adminMode) {
      if (data.captainId) {
        const cap = col('users').findOne(data.captainId)
        if (!cap || cap.deleted) fail('指定队长不存在')
        captainId = cap._id
        if (!captainName) captainName = cap.realName || cap.nickname || ''
        if (!captainPhone) captainPhone = cap.phone || ''
      } else if (captainPhone) {
        const cap = col('users').findOne((x) => !x.deleted && x.phone === captainPhone)
        captainId = cap ? cap._id : ''
        if (cap && !captainName) captainName = cap.realName || cap.nickname || ''
      } else if (!team) {
        captainId = ''
      }
    } else {
      // 队长创建/维护自己的队伍：本人是队长，但不自动入队
      captainId = team?.captainId || u._id
      if (!captainName) captainName = u.realName || u.nickname || ''
      if (!captainPhone) captainPhone = u.phone || ''
    }

    // 仅使用显式传入/已有队员，绝不自动追加管理员或队长
    let members = Array.isArray(data.members) ? [...data.members] : [...(team?.members || [])]
    members = members.map((m) => ({
      id: m.id || nid('mb_'),
      userId: m.userId || '',
      name: m.name || '',
      phone: m.phone || '',
      gender: m.gender === 'female' ? 'female' : 'male',
      idCard: m.idCard || '',
      job: m.job || '',
      status: m.status || 'active',
      isCaptain: !!m.isCaptain
    }))
    // 若填写了队长手机，仅给同号队员打标（不新增人员）
    if (captainPhone) {
      members = members.map((m) => ({
        ...m,
        isCaptain: m.phone === captainPhone
      }))
    }

    const active = members.filter((m) => m.status === 'active')
    if (active.filter((m) => m.gender === 'male').length > match.maxMalePerTeam) fail('男队员人数已超限')
    if (active.filter((m) => m.gender === 'female').length > match.maxFemalePerTeam) fail('女队员人数已超限')

    const teams = col('teams').find((t) => t.matchId === data.matchId)
    if (!team && teams.length >= match.maxTeams) fail('报名队伍已满')

    // 队名去重（同场）
    const dup = col('teams').findOne(
      (t) => t.matchId === data.matchId && t.name === data.name && (!team || t._id !== team._id)
    )
    if (dup) fail(`队名「${data.name}」已存在`)

    const payload = {
      matchId: data.matchId,
      name: data.name,
      department: data.department,
      slogan: data.slogan || '',
      captainId,
      captainName,
      captainPhone,
      members
    }
    if (team) return col('teams').update(team._id, payload)
    return col('teams').insert({ _id: nid('t_'), ...payload, createdAt: nowIso() })
  },

  /** 管理员批量导入全部队伍（Excel/CSV 解析后的结构化数据） */
  importMatchTeams(data, ctx) {
    const admin = needAdmin(ctx)
    const matchId = data.matchId
    const teams = Array.isArray(data.teams) ? data.teams : []
    if (!matchId) fail('缺少比赛 id')
    if (!teams.length) fail('没有可导入的队伍')
    const match = col('matches').findOne(matchId)
    if (!match || match.deleted) fail('比赛不存在')

    let created = 0
    let updated = 0
    for (const row of teams) {
      if (!row?.name) fail('存在缺少队名的行')
      if (!row?.department) fail(`队伍「${row.name}」缺少部门`)
      const exist = col('teams').findOne((t) => t.matchId === matchId && t.name === row.name)
      const members = (row.members || []).map((m) => ({
        id: nid('mb_'),
        userId: '',
        name: m.name,
        phone: m.phone,
        gender: m.gender === 'female' ? 'female' : 'male',
        idCard: m.idCard || '',
        job: m.job || '',
        status: 'active',
        isCaptain: false
      }))
      // 若队员里已有队长手机，标为队长
      if (row.captainPhone) {
        const i = members.findIndex((m) => m.phone === row.captainPhone)
        if (i >= 0) members[i] = { ...members[i], isCaptain: true }
      }
      this.saveTeam(
        {
          _id: exist?._id,
          matchId,
          name: row.name,
          department: row.department,
          slogan: row.slogan || '',
          captainName: row.captainName || '',
          captainPhone: row.captainPhone || '',
          members
        },
        { user: admin }
      )
      if (exist) updated++
      else created++
    }
    return { ok: true, created, updated, total: teams.length }
  },

  /** 队长/管理员：批量写入本队队员（覆盖式合并：同手机号更新，新号追加） */
  importTeamMembers(data, ctx) {
    const u = needUser(ctx)
    if (!hasAnyRole(u, ['super_admin', 'admin', 'captain'])) fail('需要队长权限')
    const matchId = data.matchId
    const incoming = Array.isArray(data.members) ? data.members : []
    if (!matchId) fail('缺少比赛 id')
    if (!incoming.length) fail('没有可导入的队员')

    let team = data.teamId ? col('teams').findOne(data.teamId) : null
    if (!team) {
      team = col('teams').findOne((t) => t.matchId === matchId && t.captainId === u._id)
    }
    if (!team) fail('请先创建并保存队伍基本信息')
    if (!isAdmin(u) && team.captainId !== u._id) fail('无权编辑该队伍')

    const members = [...(team.members || [])]
    for (const raw of incoming) {
      if (!raw?.name || !raw?.phone) fail('队员须含姓名与手机号')
      const gender = raw.gender === 'female' ? 'female' : 'male'
      const idx = members.findIndex((m) => m.phone === String(raw.phone).trim())
      const next = {
        id: idx >= 0 ? members[idx].id : nid('mb_'),
        userId: idx >= 0 ? members[idx].userId || '' : '',
        name: String(raw.name).trim(),
        phone: String(raw.phone).trim(),
        gender,
        idCard: String(raw.idCard || '').trim(),
        job: String(raw.job || '').trim(),
        status: idx >= 0 ? members[idx].status || 'active' : 'active',
        isCaptain: idx >= 0 ? !!members[idx].isCaptain : false
      }
      if (idx >= 0) members[idx] = next
      else members.push(next)
    }

    return this.saveTeam(
      {
        _id: team._id,
        matchId: team.matchId,
        name: team.name,
        department: team.department,
        slogan: team.slogan || '',
        members
      },
      { user: u }
    )
  },

  deleteTeam({ id }, ctx) {
    needAdmin(ctx)
    const team = col('teams').findOne(id)
    if (!team) fail('队伍不存在')
    col('teams').remove(id)
    return { ok: true }
  },

  applyJoinTeam(data, ctx) {
    const u = needUser(ctx)
    const team = col('teams').findOne(data.teamId)
    if (!team) fail('队伍不存在')
    const match = col('matches').findOne(team.matchId)
    if (!match || match.deleted || match.status !== 'registering') fail('当前不可报名')
    if ((team.members || []).some((m) => m.userId === u._id && m.status !== 'cancel_pending')) {
      fail('您已在该队伍中或待审批')
    }
    const name = data.name || u.realName || u.nickname
    const phone = data.phone || u.phone
    const gender = data.gender || u.gender || 'male'
    if (!name || !phone) fail('请填写姓名和手机号')
    if (!data.idCard) fail('请填写身份证号')
    const active = activeMembers(team)
    if (gender === 'male' && genderCount(team.members, 'male') >= match.maxMalePerTeam) fail('男队员已满')
    if (gender === 'female' && genderCount(team.members, 'female') >= match.maxFemalePerTeam) fail('女队员已满')
    if (active.length >= match.maxMalePerTeam + match.maxFemalePerTeam) fail('队伍人数已满')

    const members = [
      ...(team.members || []),
      {
        id: nid('mb_'),
        userId: u._id,
        name,
        phone,
        gender,
        idCard: data.idCard,
        job: data.job || '',
        status: 'pending'
      }
    ]
    col('users').update(u._id, { realName: u.realName || name, phone: u.phone || phone, gender })
    col('teams').update(team._id, { members })
    pushNotify(team.captainId, '入队申请', `${name} 申请加入「${team.name}」`, { teamId: team._id })
    return { ok: true }
  },

  reviewTeamMember({ teamId, memberId, action }, ctx) {
    const u = needUser(ctx)
    const team = col('teams').findOne(teamId)
    if (!team) fail('队伍不存在')
    if (team.captainId !== u._id && !isAdmin(u)) fail('仅队长或管理员可审批')
    const match = col('matches').findOne(team.matchId)
    const members = [...(team.members || [])]
    const idx = members.findIndex((m) => m.id === memberId)
    if (idx < 0) fail('成员不存在')
    const mb = members[idx]
    if (action === 'approve') {
      if (mb.gender === 'male' && genderCount(members, 'male') >= match.maxMalePerTeam) fail('男队员已满')
      if (mb.gender === 'female' && genderCount(members, 'female') >= match.maxFemalePerTeam) fail('女队员已满')
      members[idx] = { ...mb, status: 'active' }
      pushNotify(mb.userId, '入队通过', `您已加入「${team.name}」`, { teamId })
    } else if (action === 'reject') {
      members.splice(idx, 1)
      pushNotify(mb.userId, '入队未通过', `「${team.name}」未通过您的入队申请`, { teamId })
    } else if (action === 'approve_cancel') {
      members.splice(idx, 1)
    } else if (action === 'reject_cancel') {
      members[idx] = { ...mb, status: 'active' }
    } else if (action === 'remove') {
      members.splice(idx, 1)
    } else fail('未知操作')
    return col('teams').update(teamId, { members })
  },

  requestLeaveTeam({ teamId }, ctx) {
    const u = needUser(ctx)
    const team = col('teams').findOne(teamId)
    if (!team) fail('队伍不存在')
    const members = [...(team.members || [])]
    const idx = members.findIndex((m) => m.userId === u._id && m.status === 'active')
    if (idx < 0) fail('您不在该队伍中')
    members[idx] = { ...members[idx], status: 'cancel_pending' }
    col('teams').update(teamId, { members })
    pushNotify(team.captainId, '取消报名申请', `${members[idx].name} 申请退出「${team.name}」`, { teamId })
    return { ok: true }
  },

  generateFixtures(matchId, ctx) {
    needAdmin(ctx)
    const match = col('matches').findOne(matchId)
    if (!match || match.deleted) fail('比赛不存在')
    if (match.progression !== 'round_robin') fail('本期仅支持单循环赛')
    // 纳入本场全部队伍（名单可赛前再交）；不再因无有效队员而排除
    const teams = col('teams')
      .find((t) => t.matchId === matchId)
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    if (teams.length < 2) fail('至少需要 2 支队伍才能生成单循环对阵')
    const old = col('fixtures').find((f) => f.matchId === matchId)
    old.forEach((f) => col('sub_fixtures').removeWhere((s) => s.fixtureId === f._id))
    col('fixtures').removeWhere((f) => f.matchId === matchId)
    col('schedule_slots').removeWhere((s) => s.matchId === matchId)

    let matchNo = match.matchNo
    if (!matchNo) {
      matchNo = nextMatchNo(col('matches').all().filter((x) => x && !x.deleted).map((x) => x.matchNo))
      col('matches').update(matchId, { matchNo })
    }

    const teamIds = teams.map((t) => t._id)
    const planned = planRoundRobin(teamIds)

    let count = 0
    let subCount = 0
    planned.fixtures.forEach((row) => {
      const f = {
        _id: nid('f_'),
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
        code: makeFixtureCode(matchNo, row.roundNo, row.pairNo),
        createdAt: nowIso()
      }
      col('fixtures').insert(f)
      createSubFixtures(f, match)
      subCount += col('sub_fixtures').find((s) => s.fixtureId === f._id).length
      count += 1
    })
    col('matches').update(matchId, { status: 'in_progress', matchNo })
    return {
      count,
      subCount,
      teamCount: teams.length,
      rounds: planned.rounds,
      matchNo,
      expected: (teams.length * (teams.length - 1)) / 2
    }
  },

  listFixtures(matchId, ctx) {
    const user = resolveCtx(ctx).user
    if (isGuestUser(user)) {
      const g = getGuestFixtures(matchId)
      if (g) return { ...g, rank: g.rank || [], groups: [] }
      fail('无权查看对阵')
    }
    if (matchId === GUEST_MATCH_ID) fail('无权查看对阵')
    if (!canViewMatch(matchId, user)) fail('无权查看对阵，请先参赛或申请观众权限')
    const match = hydrateMatch(col('matches').findOne(matchId))
    const fixtures = col('fixtures')
      .find((f) => f.matchId === matchId)
      .map((f) => hydrateFixture(f, user))
      .sort((a, b) => {
        const r = (a.roundNo || 0) - (b.roundNo || 0)
        if (r) return r
        return String(a.code || '').localeCompare(String(b.code || ''))
      })
    const teams = col('teams').find((t) => t.matchId === matchId)
    return { match, fixtures, rank: rankingFromFixtures(teams, fixtures), groups: [] }
  },

  getFixture(id, ctx) {
    const user = resolveCtx(ctx).user
    if (isGuestUser(user)) {
      const guestF = getGuestFixture(id)
      if (guestF) return { ...guestF, match: getGuestMatch(GUEST_MATCH_ID) }
      fail('对阵不存在')
    }
    const guestF = getGuestFixture(id)
    if (guestF) fail('对阵不存在')
    const f = hydrateFixture(col('fixtures').findOne(id), user)
    if (!f) fail('对阵不存在')
    if (!canViewMatch(f.matchId, user)) fail('无权查看')
    f.match = hydrateMatch(col('matches').findOne(f.matchId))
    return f
  },

  assignReferee({ fixtureId, refereeIds }, ctx) {
    needAdmin(ctx)
    const f0 = col('fixtures').findOne(fixtureId)
    if (!f0) fail('对阵不存在')
    const match = col('matches').findOne(f0.matchId)
    const pool = match?.refereeIds || []
    const ids = Array.isArray(refereeIds) ? refereeIds.filter(Boolean) : []
    if (ids.length && !pool.length) fail('请先在比赛中指定本场裁判')
    for (const rid of ids) {
      if (!pool.includes(rid)) fail('只能从本场已选裁判中分配')
    }
    return hydrateFixture(col('fixtures').update(fixtureId, { refereeIds: ids }))
  },

  /** 为单个小项分配裁判与场地号 / 预计时间 */
  assignSubFixture(data = {}, ctx) {
    needAdmin(ctx)
    const id = data.subFixtureId || data.id
    if (!id) fail('缺少小项 id')
    const sub = col('sub_fixtures').findOne(id)
    if (!sub) fail('小项不存在')
    const f = col('fixtures').findOne(sub.fixtureId)
    if (!f) fail('对阵不存在')
    const match = col('matches').findOne(f.matchId)
    const pool = match?.refereeIds || []
    const patch = {}
    if (data.venue !== undefined) patch.venue = String(data.venue || '').trim()
    if (data.scheduleTime !== undefined) {
      const t = data.scheduleTime ? new Date(data.scheduleTime) : null
      if (data.scheduleTime && (!t || Number.isNaN(t.getTime()))) fail('预计时间格式不正确')
      patch.scheduleTime = data.scheduleTime ? t.toISOString() : ''
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
    col('sub_fixtures').update(id, patch)
    // 同步团体赛层面的裁判汇总（便于列表展示）
    const allSubs = col('sub_fixtures').find((s) => s.fixtureId === f._id)
    const ids = Array.from(
      new Set([...(f.refereeIds || []), ...allSubs.flatMap((s) => s.refereeIds || [])])
    )
    col('fixtures').update(f._id, { refereeIds: ids })
    return hydrateFixture(col('fixtures').findOne(f._id))
  },

  /** 修改团体对阵预计时间 / 场地（影响导出对阵表） */
  updateFixtureSchedule(data = {}, ctx) {
    needAdmin(ctx)
    const id = data.fixtureId || data.id
    if (!id) fail('缺少对阵 id')
    const f = col('fixtures').findOne(id)
    if (!f) fail('对阵不存在')
    const patch = {}
    if (data.venue !== undefined) patch.venue = String(data.venue || '').trim()
    if (data.scheduleTime !== undefined) {
      const t = data.scheduleTime ? new Date(data.scheduleTime) : null
      if (data.scheduleTime && (!t || Number.isNaN(t.getTime()))) fail('预计时间格式不正确')
      patch.scheduleTime = data.scheduleTime ? t.toISOString() : ''
    }
    if (!Object.keys(patch).length) fail('无更新内容')
    col('fixtures').update(id, patch)

    // 可选：同步平移各小项时间
    if (patch.scheduleTime && data.syncSubTimes) {
      const match = col('matches').findOne(f.matchId)
      const gap = Math.max(0, Number(match?.itemIntervalMinutes) || 0)
      const base = new Date(patch.scheduleTime).getTime()
      const subs = col('sub_fixtures')
        .find((s) => s.fixtureId === id)
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      subs.forEach((s, idx) => {
        col('sub_fixtures').update(s._id, {
          scheduleTime: new Date(base + idx * gap * 60000).toISOString()
        })
      })
    }
    return hydrateFixture(col('fixtures').findOne(id))
  },

  listScheduleSlots({ matchId } = {}, ctx) {
    needAdmin(ctx)
    if (!matchId) fail('缺少比赛 id')
    return col('schedule_slots')
      .find((s) => s.matchId === matchId)
      .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))
  },

  saveScheduleSlot(data = {}, ctx) {
    needAdmin(ctx)
    const matchId = data.matchId
    const match = col('matches').findOne(matchId)
    if (!match || match.deleted) fail('比赛不存在')
    const name = String(data.name || '').trim()
    if (!name) fail('请填写时段名称')
    const startTime = String(data.startTime || '').trim()
    const endTime = String(data.endTime || '').trim()
    if (!startTime || !endTime) fail('请填写开始和结束时间')
    const courtCount = Math.max(1, Number(match.courtCount) || 8)
    const courtNos = (Array.isArray(data.courtNos) ? data.courtNos : [])
      .map((n) => Number(n))
      .filter((n) => n >= 1 && n <= courtCount)
    if (!courtNos.length) fail('请至少选择一片场地')
    const assignments = []
    const usedCourt = new Set()
    const usedSub = new Set()
    for (const a of Array.isArray(data.assignments) ? data.assignments : []) {
      const courtNo = Number(a?.courtNo) || 0
      const subFixtureId = String(a?.subFixtureId || '').trim()
      if (!courtNo || !subFixtureId) continue
      if (!courtNos.includes(courtNo)) fail(`${courtNo} 号场地未在本时段选用`)
      if (usedCourt.has(courtNo)) fail(`${courtNo} 号场地在本时段重复安排`)
      if (usedSub.has(subFixtureId)) fail('同一局不能同时安排到多片场地')
      const sub = col('sub_fixtures').findOne(subFixtureId)
      if (!sub) fail('对局不存在')
      const f = col('fixtures').findOne(sub.fixtureId)
      if (!f || f.matchId !== matchId) fail('对局不属于本场比赛')
      if (sub.slotId && data.id && sub.slotId !== data.id) fail(`${sub.code || '该局'} 已排在其他时段`)
      if (sub.slotId && !data.id) fail(`${sub.code || '该局'} 已排在其他时段`)
      usedCourt.add(courtNo)
      usedSub.add(subFixtureId)
      assignments.push({ courtNo, subFixtureId, code: sub.code || '' })
    }
    if (!assignments.length) fail('请为场地选择对局编号')
    const date = String(data.date || match.startDate || '').slice(0, 10)
    const fields = { matchId, name, date, startTime, endTime, courtNos, assignments }
    const clearOld = (slot) => {
      for (const a of slot?.assignments || []) {
        const sub = col('sub_fixtures').findOne(a.subFixtureId)
        if (!sub) continue
        if (sub.slotId && slot._id && sub.slotId !== slot._id) continue
        col('sub_fixtures').update(sub._id, { venue: '', scheduleTime: '', slotId: '', courtNo: 0 })
      }
    }
    let slot
    if (data.id) {
      const old = col('schedule_slots').findOne(data.id)
      if (!old || old.matchId !== matchId) fail('时段不存在')
      clearOld(old)
      slot = col('schedule_slots').update(data.id, fields)
    } else {
      slot = col('schedule_slots').insert({ _id: nid('ss_'), ...fields, createdAt: nowIso() })
    }
    const when = slotDateTime(date, startTime)
    for (const a of assignments) {
      col('sub_fixtures').update(a.subFixtureId, {
        venue: `${a.courtNo}号`,
        scheduleTime: when,
        slotId: slot._id,
        courtNo: a.courtNo
      })
    }
    return slot
  },

  deleteScheduleSlot({ id, slotId } = {}, ctx) {
    needAdmin(ctx)
    const sid = id || slotId
    const slot = col('schedule_slots').findOne(sid)
    if (!slot) fail('时段不存在')
    for (const a of slot.assignments || []) {
      const sub = col('sub_fixtures').findOne(a.subFixtureId)
      if (!sub) continue
      if (sub.slotId && sub.slotId !== slot._id) continue
      col('sub_fixtures').update(sub._id, { venue: '', scheduleTime: '', slotId: '', courtNo: 0 })
    }
    col('schedule_slots').removeWhere((s) => s._id === sid)
    return { ok: true }
  },

  listAssignableGames({ matchId } = {}, ctx) {
    needAdmin(ctx)
    if (!matchId) fail('缺少比赛 id')
    const fixtures = col('fixtures')
      .find((f) => f.matchId === matchId)
      .map((f) => hydrateFixture(f))
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
    const games = []
    for (const f of fixtures) {
      for (const s of f.subFixtures || []) {
        games.push({
          _id: s._id,
          code: s.code || '',
          itemName: s.itemName,
          venue: s.venue || '',
          scheduleTime: s.scheduleTime || '',
          slotId: s.slotId || '',
          courtNo: s.courtNo || 0,
          fixtureId: f._id,
          fixtureCode: f.code,
          round: f.round,
          teamAName: f.teamAName,
          teamBName: f.teamBName
        })
      }
    }
    const match = col('matches').findOne(matchId)
    return { matchNo: match?.matchNo || '', games }
  },

  /** 导出纸质对阵表所需数据 */
  getBracketTable(matchId, ctx) {
    const user = resolveCtx(ctx).user
    if (isGuestUser(user)) fail('请登录后查看')
    if (!canViewMatch(matchId, user)) fail('无权查看对阵')
    const match = hydrateMatch(col('matches').findOne(matchId))
    if (!match || match.deleted) fail('比赛不存在')
    const teams = col('teams')
      .find((t) => t.matchId === matchId)
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    const fixtures = col('fixtures').find((f) => f.matchId === matchId).map(hydrateFixture)
    return { match, teams, fixtures }
  },

  applySpectator({ matchId, reason }, ctx) {
    const u = needUser(ctx)
    if (canViewMatch(matchId, u) && !col('match_spectators').findOne((s) => s.matchId === matchId && s.userId === u._id)) {
      // 已是参赛者无需申请
      fail('您已可直接查看本场比赛')
    }
    const exist = col('match_spectators').findOne((s) => s.matchId === matchId && s.userId === u._id)
    if (exist && exist.status === 'pending') fail('已提交申请，请等待审核')
    if (exist && exist.status === 'approved') fail('您已是观众')
    if (exist) {
      return col('match_spectators').update(exist._id, { status: 'pending', reason: reason || '', reviewerId: '' })
    }
    return col('match_spectators').insert({
      _id: nid('sp_'),
      matchId,
      userId: u._id,
      status: 'pending',
      reason: reason || '',
      reviewerId: '',
      createdAt: nowIso()
    })
  },

  listSpectators({ matchId, status } = {}, ctx) {
    needAdmin(ctx)
    let list = col('match_spectators').find((s) => s.matchId === matchId)
    if (status) list = list.filter((s) => s.status === status)
    return list.map((s) => ({ ...s, userName: userName(s.userId), phone: col('users').findOne(s.userId)?.phone }))
  },

  reviewSpectator({ id, action, reason }, ctx) {
    const admin = needAdmin(ctx)
    const s = col('match_spectators').findOne(id)
    if (!s) fail('申请不存在')
    if (action === 'approve') {
      col('match_spectators').update(id, { status: 'approved', reviewerId: admin._id, rejectReason: '' })
      pushNotify(s.userId, '观众申请通过', '您可以查看该比赛对阵与赛果了', { matchId: s.matchId })
    } else {
      col('match_spectators').update(id, {
        status: 'rejected',
        reviewerId: admin._id,
        rejectReason: reason || '未通过'
      })
    }
    return { ok: true }
  },

  startSubFixture(id, ctx) {
    const u = needUser(ctx)
    const sub = col('sub_fixtures').findOne(id)
    if (!sub) fail('场次不存在')
    const f = col('fixtures').findOne(sub.fixtureId)
    if (!canRefereeFixture(u, f, sub)) fail('仅被指派的裁判或管理员可记分')
    if (!sub.lineupASubmitted || !sub.lineupBSubmitted) fail('双方上场名单均提交后才能开始')
    if (sub.status === 'pending') {
      col('sub_fixtures').update(id, { status: 'live' })
      col('fixtures').update(f._id, { status: 'live' })
    }
    return this.getSubFixture(id, ctx)
  },

  getSubFixture(id, ctx) {
    const user = resolveCtx(ctx).user
    const sub = col('sub_fixtures').findOne(id)
    if (!sub) fail('场次不存在')
    const f = hydrateFixture(col('fixtures').findOne(sub.fixtureId), user)
    const match = hydrateMatch(col('matches').findOne(f.matchId))
    const item = col('match_items').findOne(sub.itemId)
    const both = !!sub.lineupASubmitted && !!sub.lineupBSubmitted
    const canShowA = both || f.viewerOnA
    const canShowB = both || f.viewerOnB
    return {
      ...sub,
      itemName: item?.name || '单项',
      refereeNames: (sub.refereeIds || []).map(userName).filter(Boolean).join('、'),
      playerAIds: canShowA ? sub.playerAIds || [] : [],
      playerBIds: canShowB ? sub.playerBIds || [] : [],
      playersA: canShowA ? sub.playersA || [] : [],
      playersB: canShowB ? sub.playersB || [] : [],
      lineupBothReady: both,
      fixture: f,
      match,
      item
    }
  },

  /**
   * 提交小项上场名单
   * side: 'a' | 'b'
   * playerIds: 队员 members[].id
   */
  submitSubLineup(data = {}, ctx) {
    const u = needUser(ctx)
    const subId = data.subFixtureId || data.id
    const side = data.side === 'b' ? 'b' : 'a'
    const playerIds = Array.isArray(data.playerIds) ? data.playerIds.filter(Boolean) : []
    if (!subId) fail('缺少小项 id')

    const sub = col('sub_fixtures').findOne(subId)
    if (!sub) fail('小项不存在')
    const fixture = col('fixtures').findOne(sub.fixtureId)
    if (!fixture) fail('对阵不存在')
    const match = col('matches').findOne(fixture.matchId)
    if (!match) fail('比赛不存在')
    const item = col('match_items').findOne(sub.itemId)
    if (!item) fail('比赛项目不存在')

    const team = col('teams').findOne(side === 'a' ? fixture.teamAId : fixture.teamBId)
    if (!team) fail('队伍不存在')
    if (!canSubmitLineupForTeam(u, team)) fail('仅本队队长或管理员可提交上场名单')

    const need = Number(item.memberCount) || 1
    if (playerIds.length !== need) fail(`${item.name} 需要选择 ${need} 名队员`)

    const roster = activeMembers(team)
    const picked = playerIds.map((id) => {
      const m = roster.find((x) => x.id === id)
      if (!m) fail('只能选择本队已报名的有效队员')
      return m
    })
    if (new Set(playerIds).size !== playerIds.length) fail('队员不可重复选择')

    const genderNeed = itemGenderNeed(item.name)
    if (genderNeed.total > 0) {
      const male = picked.filter((m) => m.gender !== 'female').length
      const female = picked.filter((m) => m.gender === 'female').length
      if (male !== genderNeed.male || female !== genderNeed.female) {
        fail(`${item.name} 需要男 ${genderNeed.male} / 女 ${genderNeed.female}`)
      }
    }

    // 兼项：汇总本队在本场团体赛各小项名单（含本次）
    const allSubs = col('sub_fixtures').find((s) => s.fixtureId === fixture._id)
    const teamSubs = allSubs.map((s) => {
      const isCurrent = s._id === subId
      let ids = []
      if (isCurrent) ids = playerIds
      else if (side === 'a' && s.lineupASubmitted) ids = s.playerAIds || []
      else if (side === 'b' && s.lineupBSubmitted) ids = s.playerBIds || []
      const members = ids
        .map((id) => roster.find((m) => m.id === id) || (isCurrent ? picked.find((m) => m.id === id) : null))
        .filter(Boolean)
      return { subId: s._id, members }
    })
    const err = validateTeamConcurrent(match, teamSubs)
    if (err) fail(err)

    const snapshot = picked.map((m) => ({
      id: m.id,
      userId: m.userId || '',
      name: m.name,
      gender: m.gender === 'female' ? 'female' : 'male'
    }))

    if (side === 'a') {
      col('sub_fixtures').update(subId, {
        playerAIds: playerIds,
        playersA: snapshot,
        lineupASubmitted: true,
        lineupASubmittedAt: nowIso(),
        lineupABy: u._id
      })
    } else {
      col('sub_fixtures').update(subId, {
        playerBIds: playerIds,
        playersB: snapshot,
        lineupBSubmitted: true,
        lineupBSubmittedAt: nowIso(),
        lineupBBy: u._id
      })
    }

    const next = col('sub_fixtures').findOne(subId)
    if (next.lineupASubmitted && next.lineupBSubmitted) {
      pushNotify(fixture.teamAId ? col('teams').findOne(fixture.teamAId)?.captainId : '', '双方名单已齐', `${item.name} 双方上场名单已提交`, {
        fixtureId: fixture._id,
        subFixtureId: subId
      })
      pushNotify(col('teams').findOne(fixture.teamBId)?.captainId, '双方名单已齐', `${item.name} 双方上场名单已提交`, {
        fixtureId: fixture._id,
        subFixtureId: subId
      })
      ;(next.refereeIds || fixture.refereeIds || []).forEach((rid) => {
        pushNotify(rid, '可开始执裁', `${teamName(fixture.teamAId)} vs ${teamName(fixture.teamBId)} · ${item.name}`, {
          fixtureId: fixture._id,
          subFixtureId: subId
        })
      })
    }

    return hydrateFixture(fixture, u)
  },

  /** 撤回本方上场名单（双方未齐前可改） */
  clearSubLineup(data = {}, ctx) {
    const u = needUser(ctx)
    const subId = data.subFixtureId || data.id
    const side = data.side === 'b' ? 'b' : 'a'
    const sub = col('sub_fixtures').findOne(subId)
    if (!sub) fail('小项不存在')
    if (['live', 'finished', 'confirmed'].includes(sub.status)) fail('比赛已开始，无法撤回名单')
    const fixture = col('fixtures').findOne(sub.fixtureId)
    const team = col('teams').findOne(side === 'a' ? fixture.teamAId : fixture.teamBId)
    if (!canSubmitLineupForTeam(u, team)) fail('无权撤回')
    if (side === 'a') {
      col('sub_fixtures').update(subId, {
        playerAIds: [],
        playersA: [],
        lineupASubmitted: false,
        lineupASubmittedAt: '',
        lineupABy: ''
      })
    } else {
      col('sub_fixtures').update(subId, {
        playerBIds: [],
        playersB: [],
        lineupBSubmitted: false,
        lineupBSubmittedAt: '',
        lineupBBy: ''
      })
    }
    return hydrateFixture(fixture, u)
  },

  addPoint({ subFixtureId, side }, ctx) {
    const u = needUser(ctx)
    const sub = col('sub_fixtures').findOne(subFixtureId)
    if (!sub) fail('场次不存在')
    const f = col('fixtures').findOne(sub.fixtureId)
    if (!canRefereeFixture(u, f, sub)) fail('无权记分')
    const match = col('matches').findOne(f.matchId)
    const rule = match.scoring || { points: 21, capPoints: 30, deuceMargin: 2 }
    if (['finished', 'confirmed'].includes(sub.status)) fail('本场已结束')
    if (sub.status === 'pending') {
      if (!sub.lineupASubmitted || !sub.lineupBSubmitted) fail('双方上场名单均提交后才能记分')
      col('sub_fixtures').update(subFixtureId, { status: 'live' })
    }
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
    let status = 'live'
    let winner = ''
    if (judgeSetEnd(sets[idx].aScore, sets[idx].bScore, rule)) {
      sets[idx].winner = sets[idx].aScore > sets[idx].bScore ? 'a' : 'b'
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
    return this.getSubFixture(subFixtureId, ctx)
  },

  undoPoint(subFixtureId, ctx) {
    const u = needUser(ctx)
    const logs = col('score_logs').find((l) => l.subFixtureId === subFixtureId && l.type === 'add')
    const last = logs[logs.length - 1]
    if (!last) fail('暂无上一步记录')
    const sub = col('sub_fixtures').findOne(subFixtureId)
    const f = col('fixtures').findOne(sub.fixtureId)
    if (!canRefereeFixture(u, f, sub)) fail('无权撤销')
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
    col('sub_fixtures').update(subFixtureId, {
      sets,
      status: 'live',
      winner: '',
      currentSet: sets.filter((s) => s.winner).length + 1
    })
    refreshFixtureResult(f._id)
    return this.getSubFixture(subFixtureId, ctx)
  },

  confirmSubFixture(id, ctx) {
    const u = needUser(ctx)
    const sub = col('sub_fixtures').findOne(id)
    const f = col('fixtures').findOne(sub.fixtureId)
    if (!canRefereeFixture(u, f, sub)) fail('无权确认')
    if (sub.status !== 'finished') fail('比赛尚未结束')
    col('sub_fixtures').update(id, { status: 'confirmed' })
    refreshFixtureResult(f._id)
    return this.getFixture(f._id, ctx)
  },

  getResults(matchId, ctx) {
    const user = resolveCtx(ctx).user
    if (isGuestUser(user)) {
      const g = getGuestResults(matchId)
      if (g) return { ...g, groups: [], fixtures: g.latest || [] }
      fail('无权查看赛果')
    }
    if (matchId === GUEST_MATCH_ID) fail('无权查看赛果')
    if (!canViewMatch(matchId, user)) fail('无权查看赛果，请先参赛或申请观众权限')
    const match = hydrateMatch(col('matches').findOne(matchId))
    const teams = col('teams').find((t) => t.matchId === matchId)
    const fixtures = col('fixtures').find((f) => f.matchId === matchId).map(hydrateFixture)
    return {
      match,
      rank: rankingFromFixtures(teams, fixtures),
      groups: [],
      fixtures: fixtures.filter((f) => ['finished', 'confirmed'].includes(f.status)),
      latest: fixtures.filter((f) => ['finished', 'confirmed'].includes(f.status)).slice(-8).reverse()
    }
  },

  listReferees(data) {
    const matchId = typeof data === 'string' ? data : data?.matchId
    let list = col('users').find(
      (u) =>
        !u.deleted &&
        ((u.roles || []).includes('referee') ||
          (u.roles || []).includes('super_admin') ||
          (u.roles || []).includes('admin'))
    )
    if (matchId) {
      const match = col('matches').findOne(matchId)
      const pool = new Set(match?.refereeIds || [])
      list = list.filter((u) => pool.has(u._id))
    }
    return list
  },

  myRefereeFixtures(payload, ctx) {
    const u = needUser(resolveCtx(payload, ctx))
    const uid = u._id
    const matchIds = new Set(
      col('matches')
        .find((m) => m && !m.deleted && (m.refereeIds || []).includes(uid))
        .map((m) => m._id)
    )
    const subFixtureIds = new Set(
      col('sub_fixtures')
        .find((s) => (s.refereeIds || []).includes(uid))
        .map((s) => s.fixtureId)
    )
    return col('fixtures')
      .find(
        (f) =>
          matchIds.has(f.matchId) || (f.refereeIds || []).includes(uid) || subFixtureIds.has(f._id)
      )
      .map((f) => {
        const h = hydrateFixture(f)
        if (matchIds.has(f.matchId)) {
          h.mySubFixtures = h.subFixtures || []
        } else {
          h.mySubFixtures = (h.subFixtures || []).filter((s) => (s.refereeIds || []).includes(uid))
        }
        return h
      })
  },

  listTeams(matchId) {
    return col('teams')
      .find((t) => t.matchId === matchId)
      .map((t) => ({
        ...t,
        captainName: teamCaptainName(t),
        activeCount: activeMembers(t).length
      }))
  },

  getMyTeam(matchId, ctx) {
    const u = needUser(ctx)
    return (
      col('teams').findOne(
        (t) => t.matchId === matchId && (t.captainId === u._id || (t.members || []).some((m) => m.userId === u._id))
      ) || null
    )
  }
}
