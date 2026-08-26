'use strict'

/**
 * hg-base — 基础数据：登录、资料、角色、联系人、通知、成员审核
 *
 * 环境变量（在本云函数上配置）：
 *   WX_APPID
 *   WX_APP_SECRET
 */

const core = require('hg-core')
const hgConfig = require('hg-config')
const {
  db,
  fail,
  nid,
  nowIso,
  publicUser,
  getUser,
  getUserByOpenid,
  needUser,
  createHandler
} = require('hg-shared')

async function code2Session(code) {
  const { appId, appSecret } = hgConfig.getWeixin()
  if (!appId || !appSecret) {
    fail('未配置微信密钥：请在云函数 hg-base 环境变量设置 WX_APPID、WX_APP_SECRET')
  }
  const res = await uniCloud.httpclient.request('https://api.weixin.qq.com/sns/jscode2session', {
    method: 'GET',
    data: {
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: 'authorization_code'
    },
    dataType: 'json',
    timeout: 10000
  })
  const body = res.data || {}
  if (body.errcode) fail(`微信登录失败：${body.errmsg || body.errcode}`)
  if (!body.openid) fail('微信登录失败：未返回 openid')
  return body
}

const actions = {
  async wxLogin(data = {}) {
    const code = data.code
    if (!code) fail('缺少微信登录 code')

    const session = await code2Session(code)
    const openid = session.openid
    const unionid = session.unionid || ''

    // 软删后同 openid 再建新账号，走重新填资料 + 超管审核
    let u = await getUserByOpenid(openid)
    if (!u) {
      const id = nid('u_')
      u = {
        _id: id,
        openid,
        unionid,
        phone: '',
        realName: '',
        nickname: data.nickname || '微信用户',
        department: '',
        gender: data.gender || 'male',
        roles: ['member'],
        groupIds: [],
        contacts: [],
        avatar: data.avatar || '',
        verified: false,
        approveStatus: '',
        rejectReason: '',
        deleted: false,
        createdAt: nowIso()
      }
      const { _id, ...fields } = u
      await db.collection('users').doc(_id).set(fields)
    } else {
      const patch = { unionid: unionid || u.unionid || '' }
      if (data.nickname) patch.nickname = data.nickname
      if (data.avatar) patch.avatar = data.avatar
      if (Object.keys(patch).length) {
        await db.collection('users').doc(u._id).update(patch)
        u = { ...u, ...patch }
      }
    }
    return publicUser(u)
  },

  async getProfile(_data, { userId }) {
    const u = await needUser(userId)
    return publicUser(u)
  },

  async updateProfile(data = {}, { userId }) {
    const u = await needUser(userId)
    if (data.phone !== undefined && !data.phone) fail('手机号不能为空')
    if (data.phone && !/^1\d{10}$/.test(String(data.phone))) fail('手机号格式不正确')
    if (data.submitForReview && !String(data.department ?? u.department ?? '').trim()) {
      fail('请填写部门')
    }

    const patch = {
      nickname: data.nickname ?? u.nickname,
      realName: data.realName ?? u.realName,
      phone: data.phone ?? u.phone,
      department: data.department ?? u.department,
      gender: data.gender ?? u.gender,
      avatar: data.avatar !== undefined ? data.avatar : u.avatar,
      verified: !!(data.phone || u.phone)
    }

    if (data.submitForReview && patch.phone && patch.realName) {
      if (core.isSuper(u) || u.approveStatus === 'approved') {
        patch.approveStatus = 'approved'
      } else {
        patch.approveStatus = 'pending'
        patch.rejectReason = ''
        patch.submittedAt = nowIso()
      }
    }

    await db.collection('users').doc(u._id).update(patch)
    return publicUser({ ...u, ...patch })
  },

  async addContact(contact = {}, { userId }) {
    const u = await needUser(userId)
    if (!contact.name || !contact.phone) fail('请填写姓名和手机号')
    const contacts = [...(u.contacts || [])]
    const i = contacts.findIndex((c) => c.phone === contact.phone)
    if (i >= 0) contacts[i] = { ...contacts[i], ...contact }
    else contacts.unshift(contact)
    await db.collection('users').doc(u._id).update({ contacts: contacts.slice(0, 20) })
    return publicUser({ ...u, contacts: contacts.slice(0, 20) })
  },

  async listUsers(_data, { userId }) {
    const admin = await needUser(userId)
    if (!core.isAdmin(admin)) fail('需要管理员权限')
    const { data } = await db.collection('users').limit(500).get()
    let groups = []
    try {
      groups = (await db.collection('groups').limit(200).get()).data || []
    } catch (e) {
      groups = []
    }
    const nameOf = (id) => {
      const g = groups.find((x) => x._id === id)
      return g && !g.deleted ? g.name : ''
    }
    return data
      .filter((u) => u && !u.deleted)
      .map((u) => {
        const pub = publicUser(u)
        pub.groupNames = (u.groupIds || []).map(nameOf).filter(Boolean)
        return pub
      })
  },

  async listPendingUsers(_data, { userId }) {
    const admin = await needUser(userId)
    if (!core.isSuper(admin)) fail('需要超级管理员权限')
    const { data } = await db
      .collection('users')
      .where({ approveStatus: 'pending' })
      .limit(200)
      .get()
    return data
      .filter((u) => !u.deleted)
      .map(publicUser)
      .sort((a, b) => String(b.submittedAt || b.createdAt || '').localeCompare(String(a.submittedAt || a.createdAt || '')))
  },

  async approveUser(data = {}, { userId }) {
    const admin = await needUser(userId)
    if (!core.isSuper(admin)) fail('需要超级管理员权限')
    const target = await getUser(data.userId)
    if (!target || target.deleted) fail('用户不存在')

    if (data.approved === false) {
      const patch = {
        approveStatus: 'rejected',
        rejectReason: (data.reason || '').trim() || '未通过审核',
        groupIds: []
      }
      await db.collection('users').doc(target._id).update(patch)
      return publicUser({ ...target, ...patch })
    }

    if (target.approveStatus !== 'pending' && target.approveStatus !== 'approved') {
      fail('该用户不在待审核状态')
    }

    const ids = Array.isArray(data.groupIds) ? data.groupIds.filter(Boolean) : []
    if (!ids.length) fail('请为用户选择组别')

    for (const gid of ids) {
      const { data: gs } = await db.collection('groups').doc(gid).get()
      if (!gs[0] || gs[0].deleted) fail('组别不存在')
    }

    const patch = {
      approveStatus: 'approved',
      rejectReason: '',
      groupIds: Array.from(new Set(ids)),
      verified: true,
      approvedAt: nowIso()
    }
    await db.collection('users').doc(target._id).update(patch)
    return publicUser({ ...target, ...patch })
  },

  async setUserRoles(data = {}, { userId }) {
    const admin = await needUser(userId)
    const allow = core.assignableRoles(admin)
    if (!allow.length) fail('无权指定角色')
    let roles = data.roles
    if (!Array.isArray(roles) || !roles.length) fail('至少保留一个角色')
    roles = Array.from(new Set(roles.includes('member') ? roles : [...roles, 'member']))
    for (const r of roles) {
      if (r === 'member') continue
      if (r === 'super_admin') fail('无法在此指定该角色')
      if (!allow.includes(r)) fail(`无权指定角色：${r}`)
    }
    const target = await getUser(data.userId)
    if (!target) fail('用户不存在')
    if ((target.roles || []).includes('super_admin') && !core.isSuper(admin)) {
      fail('不可修改超级管理员')
    }
    await db.collection('users').doc(target._id).update({ roles })
    return publicUser({ ...target, roles })
  },

  async setUserGroups(data = {}, { userId }) {
    const admin = await needUser(userId)
    if (!core.isAdmin(admin)) fail('需要管理员权限')
    const target = await getUser(data.userId)
    if (!target || target.deleted) fail('用户不存在')
    const ids = Array.isArray(data.groupIds) ? data.groupIds.filter(Boolean) : []
    for (const gid of ids) {
      const { data: gs } = await db.collection('groups').doc(gid).get()
      if (!gs[0] || gs[0].deleted) fail('组别不存在')
    }
    await db.collection('users').doc(target._id).update({ groupIds: Array.from(new Set(ids)) })
    return publicUser({ ...target, groupIds: Array.from(new Set(ids)) })
  },

  async listGroups(_data, { userId }) {
    await needUser(userId)
    try {
      const { data } = await db.collection('groups').limit(200).get()
      return (data || [])
        .filter((g) => !g.deleted)
        .slice()
        .sort((a, b) => {
          if (a.isDefault && !b.isDefault) return -1
          if (!a.isDefault && b.isDefault) return 1
          return String(a.name || '').localeCompare(String(b.name || ''), 'zh')
        })
    } catch (e) {
      return []
    }
  },

  async getDefaultGroup(_data, { userId }) {
    await needUser(userId)
    try {
      const { data } = await db.collection('groups').where({ isDefault: true }).limit(5).get()
      return (data || []).find((g) => !g.deleted) || null
    } catch (e) {
      return null
    }
  },

  async createGroup(data = {}, { userId }) {
    const admin = await needUser(userId)
    if (!core.isAdmin(admin)) fail('需要管理员权限')
    const name = (data.name || '').trim()
    if (!name) fail('请填写组别名称')
    const { data: exists } = await db.collection('groups').where({ name }).limit(10).get()
    if ((exists || []).some((g) => !g.deleted)) fail('组别名称已存在')
    if (data.isDefault) {
      const { data: defs } = await db.collection('groups').where({ isDefault: true }).get()
      for (const g of defs || []) {
        if (!g.deleted) await db.collection('groups').doc(g._id).update({ isDefault: false })
      }
    }
    const id = nid('g_')
    const g = {
      name,
      isDefault: !!data.isDefault,
      deleted: false,
      createdAt: nowIso(),
      creatorId: admin._id
    }
    await db.collection('groups').doc(id).set(g)
    return { _id: id, ...g }
  },

  async updateGroup(data = {}, { userId }) {
    const admin = await needUser(userId)
    if (!core.isAdmin(admin)) fail('需要管理员权限')
    const id = data.id
    if (!id) fail('缺少组别 id')
    const { data: rows } = await db.collection('groups').doc(id).get()
    if (!rows[0] || rows[0].deleted) fail('组别不存在')
    const patch = {}
    if (data.name !== undefined) {
      const n = (data.name || '').trim()
      if (!n) fail('请填写组别名称')
      const { data: same } = await db.collection('groups').where({ name: n }).limit(10).get()
      if ((same || []).some((g) => !g.deleted && g._id !== id)) fail('组别名称已存在')
      patch.name = n
    }
    if (data.isDefault !== undefined) {
      if (data.isDefault) {
        const { data: defs } = await db.collection('groups').where({ isDefault: true }).get()
        for (const g of defs || []) {
          if (g._id !== id && !g.deleted) await db.collection('groups').doc(g._id).update({ isDefault: false })
        }
      }
      patch.isDefault = !!data.isDefault
    }
    await db.collection('groups').doc(id).update(patch)
    const { data: next } = await db.collection('groups').doc(id).get()
    return next[0]
  },

  async setDefaultGroup(data = {}, { userId }) {
    const admin = await needUser(userId)
    if (!core.isAdmin(admin)) fail('需要管理员权限')
    const id = data.id
    if (!id) fail('缺少组别 id')
    const { data: rows } = await db.collection('groups').doc(id).get()
    if (!rows[0] || rows[0].deleted) fail('组别不存在')
    const { data: defs } = await db.collection('groups').where({ isDefault: true }).get()
    for (const g of defs || []) {
      if (g._id !== id && !g.deleted) await db.collection('groups').doc(g._id).update({ isDefault: false })
    }
    await db.collection('groups').doc(id).update({ isDefault: true })
    const { data: next } = await db.collection('groups').doc(id).get()
    return next[0]
  },

  async deleteGroup(data = {}, { userId }) {
    const admin = await needUser(userId)
    if (!core.isAdmin(admin)) fail('需要管理员权限')
    const id = data.id
    if (!id) fail('缺少组别 id')
    const { data: rows } = await db.collection('groups').doc(id).get()
    if (!rows[0] || rows[0].deleted) fail('组别不存在')

    // 仍有人员归属时不允许删除
    try {
      const { data: users } = await db.collection('users').limit(500).get()
      const members = (users || []).filter(
        (u) => u && !u.deleted && Array.isArray(u.groupIds) && u.groupIds.includes(id)
      )
      if (members.length) {
        fail(`该组别仍有 ${members.length} 名人员，请先清空人员后再删除`)
      }
    } catch (e) {
      if (e.errCode || e.errMsg) throw e
      fail('校验组别人员失败，请稍后重试')
    }

    // 活动保留 allowGroupIds 引用：其他组别成员因组别不匹配而看不见，活动记录本身不删
    await db.collection('groups').doc(id).update({
      deleted: true,
      deletedAt: nowIso(),
      isDefault: false
    })
    return { ok: true }
  },

  async deleteUser(data = {}, { userId }) {
    const admin = await needUser(userId)
    if (!core.isSuper(admin)) fail('需要超级管理员权限')
    const target = await getUser(data.userId)
    if (!target || target.deleted) fail('用户不存在')
    if ((target.roles || []).includes('super_admin')) fail('不可删除超级管理员')
    if (target._id === admin._id) fail('不可删除自己')
    // 软删保留原记录；同 openid 再次登录会新建账号并重新走审核
    await db.collection('users').doc(target._id).update({
      deleted: true,
      deletedAt: nowIso()
    })
    return { ok: true }
  },

  /** 批量导入本地组别 */
  async importGroups(data = {}, { userId }) {
    const admin = await needUser(userId)
    if (!core.isAdmin(admin)) fail('需要管理员权限')
    const groups = Array.isArray(data.groups) ? data.groups : []
    let count = 0
    for (const g of groups) {
      if (!g || !g._id) continue
      const exist = (await db.collection('groups').doc(g._id).get()).data[0]
      if (exist) continue
      await db.collection('groups').doc(g._id).set({
        name: g.name || '',
        isDefault: !!g.isDefault,
        createdAt: g.createdAt || nowIso(),
        creatorId: g.creatorId || admin._id
      })
      count += 1
    }
    return { groups: count }
  },

  async listNotifications(_data, { userId }) {
    await needUser(userId)
    try {
      const { data } = await db
        .collection('notifications')
        .where({ userId })
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get()
      return data
    } catch (e) {
      return []
    }
  }
}

exports.main = createHandler(actions)
