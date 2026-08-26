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
import { judgeSetEnd, tallySets, judgeTeamWinner } from '@/utils/scoring'
import { roundRobinRounds, rankingFromFixtures } from '@/utils/fixture-gen'

function fail(message) {
  const err = new Error(message)
  err.biz = true
  throw err
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

function hydrateFixture(f) {
  if (!f) return null
  const subs = col('sub_fixtures').find((s) => s.fixtureId === f._id)
  const items = col('match_items').all()
  const itemMap = Object.fromEntries(items.map((i) => [i._id, i]))
  return {
    ...f,
    teamAName: teamName(f.teamAId),
    teamBName: teamName(f.teamBId),
    refereeNames: (f.refereeIds || []).map(userName).join('、'),
    subFixtures: subs.map((s) => ({
      ...s,
      itemName: itemMap[s.itemId]?.name || '单项',
      setText: (s.sets || [])
        .filter((x) => x.winner || (x.aScore && x.bScore))
        .map((x) => `${x.aScore}:${x.bScore}`)
        .join(' · ')
    }))
  }
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
  const teams = col('teams').find((t) => t.matchId === matchId)
  const inTeam = teams.some(
    (t) =>
      t.captainId === user._id ||
      (t.members || []).some((m) => m.userId === user._id && m.status === 'active')
  )
  if (inTeam) return true
  if (col('fixtures').find((f) => f.matchId === matchId && (f.refereeIds || []).includes(user._id)).length) return true
  const sp = col('match_spectators').findOne((s) => s.matchId === matchId && s.userId === user._id && s.status === 'approved')
  return !!sp
}

function createSubFixtures(fixture, match) {
  const items = col('match_items').find((i) => i.matchId === match._id).sort((a, b) => a.sort - b.sort)
  items.forEach((item) => {
    col('sub_fixtures').insert({
      _id: nid('sf_'),
      fixtureId: fixture._id,
      itemId: item._id,
      playerAIds: [],
      playerBIds: [],
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

  /** 将云端用户同步到本地业务库（同机多微信号共享本地数据） */
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
        ...col('matches').find((m) => m.creatorId === user._id).map((m) => m._id)
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
        captainName: userName(t.captainId),
        activeCount: activeMembers(t).length,
        maleCount: genderCount(t.members, 'male'),
        femaleCount: genderCount(t.members, 'female')
      }))
    m.canViewDetail = canViewMatch(id, user)
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
      registerStart: data.registerStart,
      registerEnd: data.registerEnd,
      status: data.publish === false ? 'draft' : 'registering',
      progression: 'round_robin',
      maxTeams: Number(data.maxTeams) || 8,
      maxMalePerTeam: Number(data.maxMalePerTeam) || 4,
      maxFemalePerTeam: Number(data.maxFemalePerTeam) || 4,
      scoring: data.scoring || { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
      teamRule: data.teamRule || { mode: 'firstToWin', itemsWinToWin: 3 },
      notice: data.notice || '',
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
    if (patch.progression) patch.progression = 'round_robin'
    return hydrateMatch(col('matches').update(id, patch))
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

    let team = data._id
      ? col('teams').findOne(data._id)
      : col('teams').findOne((t) => t.matchId === data.matchId && t.captainId === u._id)

    let members = data.members || team?.members || []
    if (!members.some((m) => m.userId === u._id || m.isCaptain)) {
      members = [
        {
          id: nid('mb_'),
          userId: u._id,
          name: u.realName || u.nickname,
          phone: u.phone,
          gender: u.gender || 'male',
          idCard: '',
          job: '',
          status: 'active',
          isCaptain: true
        },
        ...members
      ]
    }

    const active = members.filter((m) => m.status === 'active')
    if (active.filter((m) => m.gender === 'male').length > match.maxMalePerTeam) fail('男队员人数已超限')
    if (active.filter((m) => m.gender === 'female').length > match.maxFemalePerTeam) fail('女队员人数已超限')

    const teams = col('teams').find((t) => t.matchId === data.matchId)
    if (!team && teams.length >= match.maxTeams) fail('报名队伍已满')

    const payload = {
      matchId: data.matchId,
      name: data.name,
      department: data.department,
      slogan: data.slogan || '',
      captainId: team?.captainId || u._id,
      members
    }
    if (team) return col('teams').update(team._id, payload)
    return col('teams').insert({ _id: nid('t_'), ...payload, createdAt: nowIso() })
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
    if (!match) fail('比赛不存在')
    if (match.progression !== 'round_robin') fail('本期仅支持单循环赛')
    const teams = col('teams').find((t) => t.matchId === matchId && activeMembers(t).length > 0)
    if (teams.length < 2) fail('至少需要 2 支有效队伍')
    const old = col('fixtures').find((f) => f.matchId === matchId)
    old.forEach((f) => col('sub_fixtures').removeWhere((s) => s.fixtureId === f._id))
    col('fixtures').removeWhere((f) => f.matchId === matchId)

    const teamIds = teams.map((t) => t._id)
    const rounds = roundRobinRounds(teamIds)
    let count = 0
    rounds.forEach((pairs, ri) => {
      pairs.forEach((p, pi) => {
        const f = {
          _id: nid('f_'),
          matchId,
          round: `第 ${ri + 1} 轮`,
          stage: 'round',
          groupId: '',
          teamAId: p[0],
          teamBId: p[1],
          status: 'pending',
          venue: `场地 ${(pi % 4) + 1}`,
          scheduleTime: match.startDate,
          refereeIds: [],
          result: { winnerTeamId: '', teamAScore: 0, teamBScore: 0 },
          code: `R${ri + 1}-${pi + 1}`,
          createdAt: nowIso()
        }
        col('fixtures').insert(f)
        createSubFixtures(f, match)
        count += 1
      })
    })
    col('matches').update(matchId, { status: 'in_progress' })
    return { count }
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
    const fixtures = col('fixtures').find((f) => f.matchId === matchId).map(hydrateFixture)
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
    const f = hydrateFixture(col('fixtures').findOne(id))
    if (!f) fail('对阵不存在')
    if (!canViewMatch(f.matchId, user)) fail('无权查看')
    f.match = hydrateMatch(col('matches').findOne(f.matchId))
    return f
  },

  assignReferee({ fixtureId, refereeIds }, ctx) {
    needAdmin(ctx)
    return hydrateFixture(col('fixtures').update(fixtureId, { refereeIds: refereeIds || [] }))
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
    if (!(isAdmin(u) || (f.refereeIds || []).includes(u._id))) fail('仅被指派的裁判或管理员可记分')
    if (sub.status === 'pending') {
      col('sub_fixtures').update(id, { status: 'live' })
      col('fixtures').update(f._id, { status: 'live' })
    }
    return this.getSubFixture(id, ctx)
  },

  getSubFixture(id, ctx) {
    const sub = col('sub_fixtures').findOne(id)
    if (!sub) fail('场次不存在')
    const f = hydrateFixture(col('fixtures').findOne(sub.fixtureId))
    const match = hydrateMatch(col('matches').findOne(f.matchId))
    const item = col('match_items').findOne(sub.itemId)
    return { ...sub, fixture: f, match, item }
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
    if (!(isAdmin(u) || (f.refereeIds || []).includes(u._id))) fail('无权确认')
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

  listReferees() {
    return col('users').find((u) => (u.roles || []).includes('referee') || (u.roles || []).includes('super_admin'))
  },

  myRefereeFixtures(payload, ctx) {
    const u = needUser(resolveCtx(payload, ctx))
    return col('fixtures')
      .find((f) => (f.refereeIds || []).includes(u._id))
      .map(hydrateFixture)
  },

  listTeams(matchId) {
    return col('teams')
      .find((t) => t.matchId === matchId)
      .map((t) => ({
        ...t,
        captainName: userName(t.captainId),
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
