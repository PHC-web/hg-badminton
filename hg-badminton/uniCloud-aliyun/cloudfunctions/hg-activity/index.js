'use strict'

/**
 * hg-activity — 日常活动：发布、报名、候补、取消、删除
 */

const core = require('hg-core')
const { db, fail, nid, nowIso, getUser, needUser, createHandler, toTs } = require('hg-shared')
const { WIDTH, HEIGHT, PIECE, renderSlider, randomTargetX, sliderMatches } = require('./slider-captcha')

async function needAdmin(userId) {
  const u = await needUser(userId)
  if (!core.isAdmin(u)) fail('需要管理员权限')
  return u
}

function userGroupIds(user) {
  return Array.isArray(user?.groupIds) ? user.groupIds : []
}

function canSeeActivity(activity, user) {
  if (!user) return false
  if (core.isAdmin(user)) return true
  const allow = activity.allowGroupIds || []
  if (!allow.length) return true
  const mine = userGroupIds(user)
  return allow.some((gid) => mine.includes(gid))
}

function canRegisterActivity(activity, user) {
  return canSeeActivity(activity, user)
}

function normPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 11) return ''
  return digits.slice(-11)
}

function sameRegistrant(a, b) {
  if (a.userId && b.userId && a.userId === b.userId) return true
  const pa = normPhone(a.phone)
  const pb = normPhone(b.phone)
  return !!(pa && pb && pa === pb)
}

/** 同一人（同一 userId 或同一手机号）只保留最早的一条报名 */
async function repairRegistrations(regs) {
  const list = regs || []
  const active = list.filter((r) => r.status !== 'cancelled')
  const parent = active.map((_, i) => i)
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (!sameRegistrant(active[i], active[j])) continue
      const a = find(i)
      const b = find(j)
      if (a !== b) parent[a] = b
    }
  }
  const groups = new Map()
  active.forEach((r, i) => {
    const g = find(i)
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(r)
  })
  const promoteIds = new Set()
  let changed = false
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort(
      (a, b) =>
        String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
        String(a._id || '').localeCompare(String(b._id || ''))
    )
    for (const extra of group.slice(1)) {
      if (extra.status === 'confirmed' && extra.activityId) promoteIds.add(extra.activityId)
      await db.collection('activity_registrations').doc(extra._id).update({ status: 'cancelled' })
      extra.status = 'cancelled'
      changed = true
    }
  }
  if (changed) {
    const queued = list
      .filter((r) => r.status === 'queued')
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    for (let i = 0; i < queued.length; i++) {
      if (queued[i].queueNo === i + 1) continue
      await db.collection('activity_registrations').doc(queued[i]._id).update({ queueNo: i + 1 })
      queued[i].queueNo = i + 1
    }
  }
  for (const id of promoteIds) {
    let guard = 0
    while (guard < 20 && (await promoteQueue(id))) guard++
  }
  return list
}

function registrationNeedsRepair(regs) {
  const active = (regs || []).filter((r) => r && r.status !== 'cancelled')
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      if (active[i].activityId === active[j].activityId && sameRegistrant(active[i], active[j])) return true
    }
  }
  return false
}

async function regsOf(activityId) {
  try {
    const { data } = await db
      .collection('activity_registrations')
      .where({ activityId })
      .limit(500)
      .get()
    return data || []
  } catch (e) {
    return []
  }
}

function registrationStarted(activity, now = Date.now()) {
  if (!activity || !activity.registerStart) return true
  const ts = toTs(activity.registerStart)
  if (!Number.isFinite(ts)) return true
  return now >= ts
}

function isListedReg(activity, reg, now = Date.now()) {
  if (!reg || reg.status === 'cancelled') return false
  if (!reg.inviteEarly) return true
  return registrationStarted(activity, now)
}

function hydrateActivity(a, allRegs = []) {
  if (!a) return null
  const regs = allRegs.filter((r) => r.activityId === a._id && isListedReg(a, r))
  const confirmed = regs.filter((r) => r.status === 'confirmed')
  const queued = regs.filter((r) => r.status === 'queued')
  return {
    ...a,
    confirmedCount: confirmed.length,
    queuedCount: queued.length,
    remain: Math.max(0, (a.maxCount || 0) - confirmed.length)
  }
}

async function getGroup(id) {
  if (!id) return null
  const { data } = await db.collection('groups').doc(id).get()
  const g = data[0]
  if (!g || g.deleted) return null
  return g
}

async function promoteQueue(activityId) {
  const { data: acts } = await db.collection('activities').doc(activityId).get()
  const activity = acts[0]
  if (!activity) return null
  const all = await regsOf(activityId)
  const confirmed = all.filter((r) => r.status === 'confirmed')
  if (confirmed.length >= (activity.maxCount || 0)) return null
  const queue = all
    .filter((r) => r.status === 'queued')
    .sort(
      (a, b) =>
        String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
        (a.queueNo || 0) - (b.queueNo || 0)
    )
  const next = queue[0]
  if (!next) return null
  await db.collection('activity_registrations').doc(next._id).update({ status: 'confirmed', queueNo: 0 })
  for (let i = 0; i < queue.length - 1; i++) {
    await db.collection('activity_registrations').doc(queue[i + 1]._id).update({ queueNo: i + 1 })
  }
  if (next.userId) {
    try {
      await db.collection('notifications').add({
        _id: nid('n_'),
        userId: next.userId,
        title: '候补成功',
        content: `您已从候补队列进入「${activity.name}」正式名单，请按时参加。`,
        extra: { activityId, type: 'queue_promoted' },
        read: false,
        createdAt: nowIso()
      })
    } catch (e) {
      /* 通知表可能未建 */
    }
  }
  return next
}

async function setDoc(collection, id, fields) {
  const { _id, ...rest } = fields
  await db.collection(collection).doc(id).set(rest)
  return { _id: id, ...rest }
}

async function consumeRegisterChallenge(userId, activityId, challengeId, sliderX) {
  if (!challengeId) fail('请先完成滑块验证')
  let row = null
  try {
    const { data } = await db.collection('register_challenges').doc(challengeId).get()
    row = data && data[0]
  } catch (e) {
    row = null
  }
  const now = Date.now()
  if (!row || row.used || row.userId !== userId || row.activityId !== activityId) fail('请重新完成滑块验证')
  if (now > Number(row.expireAt)) fail('验证已过期，请重试')
  if (now - Number(row.createdAt) < 200) fail('请拖动滑块对准缺口')
  if (!sliderMatches(row.targetX, sliderX)) fail('请把滑块对准缺口')
  await db.collection('register_challenges').doc(challengeId).update({ used: true })
}

const actions = {
  /** 批量导入本地活动（迁移用） */
  async importBundle(data = {}, { userId }) {
    await needAdmin(userId)
    const activities = Array.isArray(data.activities) ? data.activities : []
    const registrations = Array.isArray(data.registrations) ? data.registrations : []
    let aCount = 0
    let rCount = 0
    for (const a of activities) {
      if (!a || !a._id) continue
      const exist = (await db.collection('activities').doc(a._id).get()).data[0]
      if (exist) continue
      const { confirmedCount, queuedCount, remain, registrations: _r, myRegistration, canRegister, ...fields } = a
      await setDoc('activities', a._id, {
        name: fields.name || '',
        location: fields.location || '',
        startTime: fields.startTime || '',
        endTime: fields.endTime || fields.startTime || '',
        registerStart: fields.registerStart || '',
        registerEnd: fields.registerEnd || '',
        maxCount: Number(fields.maxCount) || 0,
        allowGroupIds: fields.allowGroupIds || [],
        notice: fields.notice || '',
        status: fields.status || 'open',
        creatorId: fields.creatorId || userId,
        createdAt: fields.createdAt || nowIso()
      })
      aCount += 1
    }
    for (const r of registrations) {
      if (!r || !r._id) continue
      const exist = (await db.collection('activity_registrations').doc(r._id).get()).data[0]
      if (exist) continue
      await setDoc('activity_registrations', r._id, {
        activityId: r.activityId,
        userId: r.userId || '',
        name: r.name || '',
        phone: r.phone || '',
        department: r.department || '',
        isProxy: !!r.isProxy,
        proxyByUserId: r.proxyByUserId || '',
        status: r.status || 'confirmed',
        queueNo: r.queueNo || 0,
        createdAt: r.createdAt || nowIso()
      })
      rCount += 1
    }
    return { activities: aCount, registrations: rCount }
  },

  async listActivities(query = {}, { userId }) {
    const user = await needUser(userId)
    let list = []
    try {
      const { data } = await db.collection('activities').limit(200).get()
      list = data || []
    } catch (e) {
      return []
    }
    // 批量取报名做 hydrate（活动不多时可接受）
    let allRegs = []
    try {
      const { data } = await db.collection('activity_registrations').limit(1000).get()
      allRegs = data || []
    } catch (e) {
      allRegs = []
    }
    if (registrationNeedsRepair(allRegs)) {
      const byActivity = new Map()
      allRegs.forEach((r) => {
        if (!r?.activityId) return
        if (!byActivity.has(r.activityId)) byActivity.set(r.activityId, [])
        byActivity.get(r.activityId).push(r)
      })
      for (const group of byActivity.values()) {
        await repairRegistrations(group)
      }
      try {
        const { data } = await db.collection('activity_registrations').limit(1000).get()
        allRegs = data || []
      } catch (e) {
        /* 沿用已修正的内存结果 */
      }
    }
    list = list
      .filter((a) => !a.deleted)
      .filter((a) => (query.manage && core.isAdmin(user)) || !a.inviteOnly)
      .filter((a) => canSeeActivity(a, user))
      .map((a) => hydrateActivity(a, allRegs))
    if (query.status) list = list.filter((a) => a.status === query.status)
    if (query.keyword) list = list.filter((a) => (a.name || '').includes(query.keyword))
    return list.sort((a, b) => String(b.startTime || '').localeCompare(String(a.startTime || '')))
  },

  async getActivity(data = {}, { userId }) {
    const user = await needUser(userId)
    const id = typeof data === 'string' ? data : data.id || data.activityId
    if (!id) fail('缺少活动 id')
    const { data: rows } = await db.collection('activities').doc(id).get()
    const raw = rows[0]
    if (!raw || raw.deleted) fail('活动不存在')
    if (!canSeeActivity(raw, user)) fail('暂不可报名')
    await repairRegistrations(await regsOf(id))
    const allRegs = (await regsOf(id))
      .filter((r) => r.status !== 'cancelled')
      .sort((x, y) => {
        if (x.status !== y.status) return x.status === 'confirmed' ? -1 : 1
        return String(x.createdAt || '').localeCompare(String(y.createdAt || ''))
      })
    const regs = allRegs.filter((r) => isListedReg(raw, r))
    const a = hydrateActivity(raw, allRegs)
    a.registrations = regs
    a.myRegistration =
      allRegs.find(
        (r) => r.userId === user._id || (normPhone(r.phone) && normPhone(r.phone) === normPhone(user.phone))
      ) || null
    a.canRegister = !!(canRegisterActivity(raw, user) && raw.status === 'open')
    return a
  },

  async createActivity(data = {}, { userId }) {
    const creator = await needAdmin(userId)
    if (!data.name || !data.location) fail('请填写名称和地点')
    if (!data.maxCount || Number(data.maxCount) < 1) fail('请设置报名人数上限')
    const allowGroupIds = Array.isArray(data.allowGroupIds) ? data.allowGroupIds : []
    for (const gid of allowGroupIds) {
      if (!(await getGroup(gid))) fail('所选组别不存在')
    }
    const id = nid('a_')
    const a = {
      _id: id,
      name: data.name,
      location: data.location,
      startTime: data.startTime,
      endTime: data.endTime || data.startTime,
      registerStart: data.registerStart,
      registerEnd: data.registerEnd,
      maxCount: Number(data.maxCount),
      allowGroupIds,
      notice: data.notice || '',
      inviteOnly: !!data.inviteOnly,
      status: data.publish === false ? 'draft' : 'open',
      deleted: false,
      creatorId: creator._id,
      createdAt: nowIso()
    }
    await setDoc('activities', id, a)

    if (data.selfRegister && a.status === 'open') {
      const name = creator.realName || creator.nickname || ''
      const phone = creator.phone || ''
      if (name && phone) {
        const rid = nid('ar_')
        await setDoc('activity_registrations', rid, {
          activityId: id,
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
    return hydrateActivity(a, [])
  },

  async updateActivity(data = {}, { userId }) {
    await needAdmin(userId)
    const { id, ...patch } = data
    if (!id) fail('缺少活动 id')
    const { data: rows } = await db.collection('activities').doc(id).get()
    if (!rows[0] || rows[0].deleted) fail('活动不存在')
    if (patch.allowGroupIds) {
      for (const gid of patch.allowGroupIds) {
        if (!(await getGroup(gid))) fail('所选组别不存在')
      }
    }
    ;[
      'allowRoles',
      '_id',
      'confirmedCount',
      'queuedCount',
      'remain',
      'registrations',
      'myRegistration',
      'canRegister',
      'selfRegister'
    ].forEach((k) => delete patch[k])
    if (patch.maxCount !== undefined) patch.maxCount = Number(patch.maxCount)
    if (patch.inviteOnly !== undefined) patch.inviteOnly = !!patch.inviteOnly
    await db.collection('activities').doc(id).update(patch)
    const { data: next } = await db.collection('activities').doc(id).get()
    return hydrateActivity(next[0], await regsOf(id))
  },

  async deleteActivity(data = {}, { userId }) {
    await needAdmin(userId)
    const id = data.id || data.activityId
    if (!id) fail('缺少活动 id')
    const { data: rows } = await db.collection('activities').doc(id).get()
    if (!rows[0] || rows[0].deleted) fail('活动不存在')
    await db.collection('activities').doc(id).update({
      deleted: true,
      deletedAt: nowIso()
    })
    return { ok: true }
  },

  async registerActivity(data = {}, { userId }) {
    const u = await needUser(userId)
    const activityId = data.activityId
    if (!activityId) fail('缺少活动 id')
    const { data: rows } = await db.collection('activities').doc(activityId).get()
    const activity = rows[0]
    if (!activity || activity.deleted) fail('活动不存在')
    if (activity.status !== 'open') fail('当前不可报名')
    const viaInvite = data.fromInvite === true || data.fromInvite === 'true' || data.fromInvite === 1
    const now = Date.now()
    const startTs = activity.registerStart ? toTs(activity.registerStart) : NaN
    if (!viaInvite && Number.isFinite(startTs) && now < startTs) fail('报名尚未开始')
    if (activity.registerEnd && now > toTs(activity.registerEnd)) fail('报名已结束')
    if (!canRegisterActivity(activity, u)) fail('您所在组别不可报名本活动')

    const self = !data.isProxy
    const name = self
      ? String(u.realName || u.nickname || '').trim()
      : String(data.name || '').trim()
    const phone = normPhone(self ? u.phone : data.phone)
    const department = self ? u.department || '' : data.department || ''
    if (!name || !/^1\d{10}$/.test(phone)) fail(self ? '请先完善个人资料中的姓名和手机号' : '请填写姓名和正确的手机号')
    if (!self && normPhone(u.phone) && phone === normPhone(u.phone)) {
      fail('代报名不能填写本人手机号')
    }

    const existing = await repairRegistrations(await regsOf(activityId))
    const phoneTaken = existing.find((r) => r.status !== 'cancelled' && normPhone(r.phone) === phone)
    if (phoneTaken) fail('该手机号已报名或已在排队')
    if (!data.isProxy && existing.some((r) => r.status !== 'cancelled' && r.userId === u._id)) {
      fail('您已报名或已在排队')
    }
    if (!viaInvite) await consumeRegisterChallenge(u._id, activityId, data.challengeId, data.sliderX)

    const confirmed = existing.filter((r) => r.status === 'confirmed')
    const queued = existing.filter((r) => r.status === 'queued')
    const full = confirmed.length >= (activity.maxCount || 0)
    const rid = nid('ar_')
    const rec = {
      _id: rid,
      activityId,
      userId: data.isProxy ? '' : u._id,
      name,
      phone,
      department,
      isProxy: !!data.isProxy,
      proxyByUserId: data.isProxy ? u._id : '',
      inviteEarly: !!(viaInvite && Number.isFinite(startTs) && now < startTs),
      status: full ? 'queued' : 'confirmed',
      queueNo: full ? queued.length + 1 : 0,
      createdAt: nowIso()
    }
    await setDoc('activity_registrations', rid, rec)
    const after = await repairRegistrations(await regsOf(activityId))
    const saved = after.find((r) => r._id === rid)
    if (!saved || saved.status === 'cancelled') fail('该手机号已报名或已在排队')
    return saved
  },

  async createRegisterChallenge(data = {}, { userId }) {
    const u = await needUser(userId)
    const activityId = data.activityId
    if (!activityId) fail('缺少活动 id')
    const { data: rows } = await db.collection('activities').doc(activityId).get()
    const activity = rows[0]
    if (!activity || activity.deleted || activity.status !== 'open') fail('当前不可报名')
    if (!canRegisterActivity(activity, u)) fail('暂不可报名')
    const targetX = randomTargetX()
    const id = nid('rc_')
    const now = Date.now()
    await setDoc('register_challenges', id, {
      userId: u._id,
      activityId,
      targetX,
      createdAt: now,
      expireAt: now + 2 * 60 * 1000,
      used: false
    })
    const pic = renderSlider(targetX)
    return {
      challengeId: id,
      image: pic.image,
      pieceImage: pic.pieceImage,
      width: WIDTH,
      height: HEIGHT,
      piece: PIECE
    }
  },

  async cancelActivityRegistration(data = {}, { userId }) {
    const u = await needUser(userId)
    const activityId = data.activityId
    if (!activityId) fail('缺少活动 id')
    const { data: rows } = await db.collection('activities').doc(activityId).get()
    const activity = rows[0]
    if (!activity) fail('活动不存在')
    if (activity.registerEnd && Date.now() > toTs(activity.registerEnd)) {
      fail('报名已结束，无法取消')
    }
    let reg = null
    if (data.registrationId) {
      const { data: rs } = await db.collection('activity_registrations').doc(data.registrationId).get()
      reg = rs[0]
    } else {
      const all = await regsOf(activityId)
      reg = all.find(
        (r) => r.status !== 'cancelled' && (r.userId === u._id || r.proxyByUserId === u._id)
      )
    }
    if (!reg) fail('未找到报名记录')
    const can = core.isAdmin(u) || reg.userId === u._id || reg.proxyByUserId === u._id
    if (!can) fail('无权取消该报名')
    const wasConfirmed = reg.status === 'confirmed'
    await db.collection('activity_registrations').doc(reg._id).update({ status: 'cancelled' })
    if (wasConfirmed) await promoteQueue(activityId)
    else {
      const queue = (await regsOf(activityId))
        .filter((r) => r.status === 'queued')
        .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
      for (let i = 0; i < queue.length; i++) {
        await db.collection('activity_registrations').doc(queue[i]._id).update({ queueNo: i + 1 })
      }
    }
    return { ok: true }
  },

  async getMyStats(_data, { userId }) {
    const u = await getUser(userId)
    if (!u) return { activityCount: 0, matchCount: 0 }
    let activityCount = 0
    try {
      const { data } = await db.collection('activity_registrations').where({ userId: u._id }).limit(500).get()
      activityCount = (data || []).filter((r) => r.status !== 'cancelled').length
      if (u.phone) {
        const { data: byPhone } = await db
          .collection('activity_registrations')
          .where({ phone: u.phone })
          .limit(500)
          .get()
        const ids = new Set((data || []).map((r) => r._id))
        ;(byPhone || []).forEach((r) => {
          if (r.status !== 'cancelled' && !ids.has(r._id)) activityCount += 1
        })
      }
    } catch (e) {
      activityCount = 0
    }
    let matchCount = 0
    try {
      const { data: teams } = await db.collection('teams').limit(500).get()
      const matchIds = new Set()
      ;(teams || []).forEach((t) => {
        const inTeam =
          t.captainId === u._id ||
          (t.members || []).some((m) => m.userId === u._id && m.status === 'active')
        if (inTeam) matchIds.add(t.matchId)
      })
      matchCount = matchIds.size
    } catch (e) {
      matchCount = 0
    }
    return { activityCount, matchCount }
  }
}

exports.main = createHandler(actions)
