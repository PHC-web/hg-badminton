'use strict'

/**
 * hg-activity — 日常活动：发布、报名、候补、取消、删除
 */

const core = require('hg-core')
const { db, fail, nid, nowIso, getUser, needUser, createHandler } = require('hg-shared')

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

function hydrateActivity(a, allRegs = []) {
  if (!a) return null
  const regs = allRegs.filter((r) => r.activityId === a._id && r.status !== 'cancelled')
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
    list = list
      .filter((a) => !a.deleted)
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
    if (!canSeeActivity(raw, user)) fail('活动不存在')
    const regs = (await regsOf(id))
      .filter((r) => r.status !== 'cancelled')
      .sort((x, y) => {
        if (x.status !== y.status) return x.status === 'confirmed' ? -1 : 1
        return String(x.createdAt || '').localeCompare(String(y.createdAt || ''))
      })
    const a = hydrateActivity(raw, regs)
    a.registrations = regs
    a.myRegistration =
      regs.find((r) => r.userId === user._id || (r.phone && r.phone === user.phone)) || null
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
    const now = Date.now()
    if (activity.registerStart && now < new Date(activity.registerStart).getTime()) fail('报名尚未开始')
    if (activity.registerEnd && now > new Date(activity.registerEnd).getTime()) fail('报名已结束')
    if (!canRegisterActivity(activity, u)) fail('您所在组别不可报名本活动')

    const name = data.name || u.realName || u.nickname
    const phone = data.phone || u.phone
    const department = data.department || u.department || ''
    if (!name || !phone) fail('请填写姓名和手机号')

    // 补全资料
    const userPatch = {}
    if (!u.realName && name) userPatch.realName = name
    if (!u.phone && phone) userPatch.phone = phone
    if (department && !u.department) userPatch.department = department
    if (Object.keys(userPatch).length) {
      await db.collection('users').doc(u._id).update(userPatch)
    }

    const existing = await regsOf(activityId)
    const exist = existing.find(
      (r) => r.status !== 'cancelled' && (r.userId === u._id || r.phone === phone)
    )
    if (exist && !data.isProxy) fail('您已报名或已在排队')

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
      status: full ? 'queued' : 'confirmed',
      queueNo: full ? queued.length + 1 : 0,
      createdAt: nowIso()
    }
    await setDoc('activity_registrations', rid, rec)
    return rec
  },

  async cancelActivityRegistration(data = {}, { userId }) {
    const u = await needUser(userId)
    const activityId = data.activityId
    if (!activityId) fail('缺少活动 id')
    const { data: rows } = await db.collection('activities').doc(activityId).get()
    const activity = rows[0]
    if (!activity) fail('活动不存在')
    if (activity.registerEnd && Date.now() > new Date(activity.registerEnd).getTime()) {
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
