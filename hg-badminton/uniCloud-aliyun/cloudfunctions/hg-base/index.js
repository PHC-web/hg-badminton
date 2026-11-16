'use strict'

/**
 * hg-base — 基础数据：登录、资料、角色、联系人、通知、成员审核
 *
 * 环境变量（在本云函数上配置）：
 *   WX_APPID
 *   WX_APP_SECRET
 *   SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
 *   SUPER_ADMIN_EMAIL  审核通知收件人，多个用逗号分隔
 */

const crypto = require('crypto')
const core = require('hg-core')
const hgConfig = require('hg-config')
const { sendMail } = require('./mail')
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

/** 仅本地 dev 网页可带此令牌走账号登录；正式打包不会带上 */
const LOCAL_WEB_LOGIN_TOKEN = 'hg-dev-web-admin-v1'
/** 小程序未发布时，本地网页后台可用此账号进入 */
const WEB_BOOTSTRAP_LOGIN = 'admin'
const WEB_BOOTSTRAP_PASSWORD = '123456Abc'
const WEB_BOOTSTRAP_USER_ID = 'u_web_admin'

function isLocalWebRequest(data = {}) {
  return data.localToken === LOCAL_WEB_LOGIN_TOKEN
}

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(String(password), String(salt), 100000, 32, 'sha256').toString('hex')
}

function newPasswordRecord(password) {
  const passwordSalt = crypto.randomBytes(16).toString('hex')
  return { passwordSalt, passwordHash: hashPassword(password, passwordSalt) }
}

function matchPassword(password, user) {
  if (!user?.passwordSalt || !user?.passwordHash) return false
  const actual = hashPassword(password, user.passwordSalt)
  try {
    return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(user.passwordHash, 'hex'))
  } catch (e) {
    return false
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function formatMailTime(value) {
  const t = value ? new Date(value).getTime() : Date.now()
  if (Number.isNaN(t)) return ''
  const d = new Date(t + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

function normPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '')
  if (digits.length < 11) return ''
  return digits.slice(-11)
}

function identityOf(user) {
  return {
    realName: String(user?.realName || '').trim(),
    phone: normPhone(user?.phone),
    department: String(user?.department || '').trim()
  }
}

function sameIdentity(a, b) {
  return a.realName === b.realName && a.phone === b.phone && a.department === b.department
}

function publicChange(row) {
  if (!row) return null
  return {
    _id: row._id,
    userId: row.userId,
    realName: row.realName || '',
    phone: row.phone || '',
    department: row.department || '',
    prevRealName: row.prevRealName || '',
    prevPhone: row.prevPhone || '',
    prevDepartment: row.prevDepartment || '',
    status: row.status,
    reason: row.reason || '',
    createdAt: row.createdAt || '',
    updatedAt: row.updatedAt || ''
  }
}

async function findPendingProfileChange(userId) {
  if (!userId) return null
  try {
    const { data } = await db.collection('profile_changes').where({ userId, status: 'pending' }).limit(20).get()
    return (data || []).sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))[0] || null
  } catch (e) {
    return null
  }
}

async function attachProfileChange(user) {
  const pub = publicUser(user)
  pub.profileChange = publicChange(await findPendingProfileChange(user._id))
  return pub
}

async function assertPhoneFree(phone, exceptUserId) {
  const target = normPhone(phone)
  if (!/^1\d{10}$/.test(target)) fail('手机号格式不正确')
  const { data } = await db.collection('users').limit(500).get()
  const hit = (data || []).find((item) => item && !item.deleted && item._id !== exceptUserId && normPhone(item.phone) === target)
  if (hit) fail('该手机号已被其他账号使用')
  try {
    const { data: pending } = await db.collection('profile_changes').where({ status: 'pending' }).limit(200).get()
    const other = (pending || []).find((row) => row.userId !== exceptUserId && normPhone(row.phone) === target)
    if (other) fail('该手机号已有待审核的修改')
  } catch (e) {
    /* 审核表尚未建立时不拦截 */
  }
}

async function pushNotify(userId, title, content, extra) {
  if (!userId) return
  try {
    await db.collection('notifications').add({
      _id: nid('n_'),
      userId,
      title,
      content,
      extra: extra || {},
      read: false,
      createdAt: nowIso()
    })
  } catch (e) {
    console.error('[notify]', e && e.message ? e.message : e)
  }
}

function changeText(prev, next) {
  return [
    `姓名：${prev.realName || '未填'} → ${next.realName || '未填'}`,
    `手机号：${prev.phone || '未填'} → ${next.phone || '未填'}`,
    `部门：${prev.department || '未填'} → ${next.department || '未填'}`
  ].join('\n')
}

async function notifyProfileChange(applicant, prev, next) {
  const name = prev.realName || applicant.nickname || '成员'
  const text = changeText(prev, next)
  const { data } = await db.collection('users').limit(300).get()
  const admins = (data || []).filter((item) => item && !item.deleted && core.isAdmin(item) && item._id !== applicant._id)
  await Promise.all(
    admins.map((admin) =>
      pushNotify(admin._id, '资料修改待审核', `${name} 申请修改资料。\n${text}`, {
        type: 'profile_change',
        userId: applicant._id
      })
    )
  )
  await pushNotify(applicant._id, '资料修改已提交', '姓名、手机号和部门已提交审核，通过后才会生效。', {
    type: 'profile_change_submitted'
  })
  try {
    const cfg = hgConfig.getMail()
    if (!cfg.host || !cfg.user || !cfg.pass) return
    const emails = new Set((cfg.adminEmails || []).map((item) => String(item).trim().toLowerCase()))
    admins.forEach((admin) => {
      const email = String(admin.email || '').trim().toLowerCase()
      if (EMAIL_RE.test(email)) emails.add(email)
    })
    const to = [...emails].filter((item) => EMAIL_RE.test(item))
    if (!to.length) return
    await sendMail({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      pass: cfg.pass,
      to,
      subject: '追光羽毛球：有成员申请修改资料',
      text: [`${name} 申请修改个人资料，等待审核。`, '', text, '', '请打开小程序「我的 → 资料修改审核」处理。'].join('\n')
    })
  } catch (e) {
    console.error('[mail] 资料修改通知发送失败', e && e.message ? e.message : e)
  }
}

async function saveProfileChange(user, prev, next) {
  const existing = await findPendingProfileChange(user._id)
  const pendingIdentity = existing
    ? {
        realName: String(existing.realName || '').trim(),
        phone: normPhone(existing.phone),
        department: String(existing.department || '').trim()
      }
    : null
  if (pendingIdentity && sameIdentity(pendingIdentity, next)) return 'pending'
  const now = nowIso()
  const doc = {
    userId: user._id,
    realName: next.realName,
    phone: next.phone,
    department: next.department,
    prevRealName: prev.realName,
    prevPhone: prev.phone,
    prevDepartment: prev.department,
    status: 'pending',
    reason: '',
    reviewerId: '',
    createdAt: existing?.createdAt || now,
    updatedAt: now
  }
  try {
    if (existing) await db.collection('profile_changes').doc(existing._id).update(doc)
    else await db.collection('profile_changes').add({ _id: nid('pc_'), ...doc })
  } catch (e) {
    console.error('[profile-change]', e && e.message ? e.message : e)
    fail('资料修改提交失败，请稍后重试')
  }
  try {
    await notifyProfileChange(user, prev, next)
  } catch (e) {
    console.error('[profile-change-notify]', e && e.message ? e.message : e)
  }
  return 'queued'
}

async function notifyPendingReview(applicant) {
  try {
    const cfg = hgConfig.getMail()
    if (!cfg.host || !cfg.user || !cfg.pass) {
      console.log('[mail] 未配置 SMTP，跳过审核通知')
      return
    }
    const emails = new Set(cfg.adminEmails.map((item) => item.toLowerCase()))
    const { data } = await db.collection('users').where({ roles: 'super_admin' }).limit(50).get()
    ;(data || []).forEach((item) => {
      const email = String(item?.email || '').trim().toLowerCase()
      if (item && !item.deleted && EMAIL_RE.test(email)) emails.add(email)
    })
    const to = [...emails]
    if (!to.length) {
      console.log('[mail] 没有超级管理员邮箱，跳过审核通知')
      return
    }
    const name = applicant.realName || applicant.nickname || '新成员'
    await sendMail({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      pass: cfg.pass,
      to,
      subject: '追光羽毛球：有新成员待审核',
      text: [
        `${name} 提交了成员资料，等待审核。`,
        '',
        `姓名：${name}`,
        `手机号：${applicant.phone || ''}`,
        `部门：${applicant.department || ''}`,
        `提交时间：${formatMailTime(applicant.submittedAt)}`,
        '',
        '请打开小程序「我的 → 成员审核」处理。'
      ].join('\n')
    })
  } catch (e) {
    console.error('[mail] 审核通知发送失败', e && e.message ? e.message : e)
  }
}

async function getUserByLoginName(loginName) {
  if (!loginName) return null
  const { data } = await db.collection('users').where({ loginName }).limit(20).get()
  return (data || []).find((u) => u && !u.deleted) || null
}

async function code2Session(code) {
  const { appId, appSecret } = hgConfig.getWeixin()
  if (!appId || !appSecret) {
    fail('微信登录暂不可用，请联系管理员')
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

let tokenCache = { token: '', expireAt: 0 }

async function getAccessToken() {
  const { appId, appSecret } = hgConfig.getWeixin()
  if (!appId || !appSecret) return ''
  if (tokenCache.token && Date.now() < tokenCache.expireAt) return tokenCache.token
  const res = await uniCloud.httpclient.request('https://api.weixin.qq.com/cgi-bin/token', {
    method: 'GET',
    data: { grant_type: 'client_credential', appid: appId, secret: appSecret },
    dataType: 'json',
    timeout: 10000
  })
  const body = res.data || {}
  if (!body.access_token) return ''
  tokenCache = {
    token: body.access_token,
    expireAt: Date.now() + Math.max(60, Number(body.expires_in || 7200) - 200) * 1000
  }
  return tokenCache.token
}

async function makeWxacode(scene, envVersion = 'release', page = 'pages/mine/web-login', width = 280) {
  const token = await getAccessToken()
  if (!token) return ''
  const res = await uniCloud.httpclient.request(
    `https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      content: JSON.stringify({
        scene,
        page,
        check_path: false,
        env_version: envVersion,
        width
      }),
      dataType: 'arraybuffer',
      timeout: 15000
    }
  )
  const buf = Buffer.from(res.data || [])
  const peek = buf.slice(0, 120).toString('utf8')
  if (peek.includes('errcode') || peek.trim().startsWith('{')) {
    console.error('[wxacode]', peek.slice(0, 200))
    return ''
  }
  return `data:image/png;base64,${buf.toString('base64')}`
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

  async webPasswordLogin(data = {}) {
    if (!isLocalWebRequest(data)) fail('正式环境仅支持微信扫码登录')
    const loginName = String(data.loginName || data.username || '').trim()
    const password = String(data.password || '')
    if (!loginName || !password) fail('请输入账号和密码')

    let u = await getUserByLoginName(loginName)
    if (!u && loginName === WEB_BOOTSTRAP_LOGIN && password === WEB_BOOTSTRAP_PASSWORD) {
      const exist = (await db.collection('users').doc(WEB_BOOTSTRAP_USER_ID).get()).data[0]
      if (exist && !exist.deleted) {
        u = exist
      } else {
        const secret = newPasswordRecord(WEB_BOOTSTRAP_PASSWORD)
        u = {
          _id: WEB_BOOTSTRAP_USER_ID,
          openid: 'web:admin',
          loginName: WEB_BOOTSTRAP_LOGIN,
          ...secret,
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
          approvedAt: nowIso(),
          deleted: false,
          createdAt: nowIso()
        }
        const { _id, ...fields } = u
        await db.collection('users').doc(_id).set(fields)
      }
    }

    if (
      u &&
      loginName === WEB_BOOTSTRAP_LOGIN &&
      password === WEB_BOOTSTRAP_PASSWORD &&
      !matchPassword(password, u)
    ) {
      const secret = newPasswordRecord(WEB_BOOTSTRAP_PASSWORD)
      await db.collection('users').doc(u._id).update(secret)
      u = { ...u, ...secret }
    }

    if (!u || u.deleted || !matchPassword(password, u)) fail('账号或密码错误')
    if (!core.isAdmin(u)) fail('仅管理员可登录网页后台')
    if (!core.isSuper(u) && u.approveStatus && u.approveStatus !== 'approved') {
      fail('账号尚未审核通过')
    }
    return publicUser(u)
  },

  async getProfile(_data, { userId }) {
    const u = await needUser(userId)
    return attachProfileChange(u)
  },

  async updateProfile(data = {}, { userId }) {
    const u = await needUser(userId)
    const nextIdentity = {
      realName: String(data.realName ?? u.realName ?? '').trim(),
      phone: data.phone !== undefined ? normPhone(data.phone) : normPhone(u.phone),
      department: String(data.department ?? u.department ?? '').trim()
    }
    if (data.phone !== undefined) {
      if (!nextIdentity.phone) fail('手机号不能为空')
      if (!/^1\d{10}$/.test(nextIdentity.phone)) fail('手机号格式不正确')
    }
    if (data.submitForReview && !nextIdentity.department) fail('请填写部门')
    if (data.submitForReview && !nextIdentity.realName) fail('请填写真实姓名')

    const current = identityOf(u)
    const identityChanged = !sameIdentity(current, nextIdentity)
    let profileReview = ''
    if (!data.submitForReview && identityChanged) {
      if (!nextIdentity.realName) fail('请填写真实姓名')
      await assertPhoneFree(nextIdentity.phone, u._id)
      profileReview = await saveProfileChange(u, current, nextIdentity)
    }

    const applyIdentity = !!data.submitForReview || !identityChanged
    const patch = {
      gender: data.gender ?? u.gender,
      avatar: data.avatar !== undefined ? data.avatar : u.avatar,
      verified: !!(nextIdentity.phone || u.phone)
    }
    if (applyIdentity) {
      patch.nickname = data.nickname ?? u.nickname
      patch.realName = nextIdentity.realName
      patch.phone = nextIdentity.phone || u.phone
      patch.department = nextIdentity.department
    }
    if (data.email !== undefined && core.isSuper(u)) {
      const email = String(data.email || '').trim()
      if (email && !EMAIL_RE.test(email)) fail('邮箱格式不正确')
      patch.email = email
    }

    let notifyReview = false
    if (data.submitForReview && patch.phone && patch.realName) {
      if (core.isSuper(u) || u.approveStatus === 'approved') {
        patch.approveStatus = 'approved'
      } else {
        notifyReview = u.approveStatus !== 'pending'
        patch.approveStatus = 'pending'
        patch.rejectReason = ''
        patch.submittedAt = nowIso()
      }
    }

    await db.collection('users').doc(u._id).update(patch)
    const saved = await attachProfileChange({ ...u, ...patch })
    if (notifyReview) await notifyPendingReview(saved)
    saved.profileReview = profileReview
    return saved
  },

  async sendTestMail(data = {}, { userId }) {
    const u = await needUser(userId)
    if (!core.isSuper(u)) fail('需要超级管理员权限')
    const email = String(data.email || '').trim()
    if (!EMAIL_RE.test(email)) fail('请填写正确的通知邮箱')
    const cfg = hgConfig.getMail()
    if (!cfg.host || !cfg.user || !cfg.pass) fail('邮件发送服务未配置')
    try {
      await sendMail({
        host: cfg.host,
        port: cfg.port,
        user: cfg.user,
        pass: cfg.pass,
        to: [email],
        subject: '追光羽毛球：测试邮件',
        text: [
          '这是一封测试邮件。',
          '如果收到，说明新成员待审核时可以通知到这个邮箱。',
          '',
          `收件邮箱：${email}`
        ].join('\n')
      })
    } catch (e) {
      const message = e && e.message ? e.message : ''
      console.error('[mail] 测试邮件发送失败', message || e)
      fail(message ? `测试邮件发送失败：${message}` : '测试邮件发送失败')
    }
    console.log('[mail] 测试邮件已发送')
    return { ok: true }
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

  async activityInviteCode(data = {}, { userId }) {
    const u = await needUser(userId)
    if (!core.isAdmin(u)) fail('需要管理员权限')
    const activityId = String(data.activityId || '').trim()
    if (!activityId || activityId.length > 32) fail('活动不存在')
    const { data: rows } = await db.collection('activities').doc(activityId).get()
    const activity = rows && rows[0]
    if (!activity || activity.deleted) fail('活动不存在')
    const envVersion = ['develop', 'trial', 'release'].includes(data.envVersion) ? data.envVersion : 'release'
    const qrBase64 = await makeWxacode(activityId, envVersion, 'pages/activity/register', 430)
    if (!qrBase64) fail('邀请海报生成失败，请稍后重试')
    return {
      qrBase64,
      name: activity.name || '',
      location: activity.location || '',
      startTime: activity.startTime || '',
      endTime: activity.endTime || ''
    }
  },

  async createWebLoginTicket(data = {}) {
    const ticketId = Math.random().toString(36).slice(2, 10)
    const expireAt = Date.now() + 5 * 60 * 1000
    await db.collection('web_login_tickets').doc(ticketId).set({
      status: 'pending',
      userId: '',
      consumed: false,
      createdAt: nowIso(),
      expireAt
    })
    const versions = isLocalWebRequest(data) ? ['develop', 'trial', 'release'] : ['release']
    let qrBase64 = ''
    for (const envVersion of versions) {
      try {
        qrBase64 = await makeWxacode(ticketId, envVersion)
      } catch (e) {
        qrBase64 = ''
      }
      if (qrBase64) break
    }
    return { ticketId, qrBase64, expireAt }
  },

  async pollWebLoginTicket(data = {}) {
    const ticketId = String(data.ticketId || '').trim()
    if (!ticketId) return { status: 'invalid' }
    let t = null
    try {
      const { data: rows } = await db.collection('web_login_tickets').doc(ticketId).get()
      t = rows[0] || null
    } catch (e) {
      return { status: 'invalid' }
    }
    if (!t) return { status: 'invalid' }
    if (t.status === 'pending' && Date.now() > Number(t.expireAt || 0)) return { status: 'expired' }
    if (t.status === 'approved' && t.userId && !t.consumed) {
      const u = await getUser(t.userId)
      if (!u || u.deleted || !core.isAdmin(u)) return { status: 'invalid' }
      await db.collection('web_login_tickets').doc(ticketId).update({
        consumed: true,
        consumedAt: nowIso()
      })
      return { status: 'approved', user: publicUser(u) }
    }
    if (t.consumed) return { status: 'consumed' }
    return { status: t.status || 'pending' }
  },

  async confirmWebLogin(data = {}, { userId }) {
    const u = await needUser(userId)
    if (!core.isAdmin(u)) fail('仅超级管理员/管理员可登录网页后台')
    if (!core.isSuper(u) && u.approveStatus && u.approveStatus !== 'approved') {
      fail('账号尚未审核通过')
    }
    const ticketId = String(data.ticketId || data.scene || '').trim()
    if (!ticketId) fail('缺少登录码')
    let t = null
    try {
      const { data: rows } = await db.collection('web_login_tickets').doc(ticketId).get()
      t = rows[0] || null
    } catch (e) {
      fail('登录码无效或数据表未创建')
    }
    if (!t) fail('登录码无效')
    if (t.status !== 'pending') fail('登录码已使用或已失效')
    if (Date.now() > Number(t.expireAt || 0)) fail('登录码已过期，请在网页刷新二维码')
    await db.collection('web_login_tickets').doc(ticketId).update({
      status: 'approved',
      userId: u._id,
      confirmedAt: nowIso()
    })
    return { ok: true }
  },

  async listProfileChanges(_data, { userId }) {
    const admin = await needUser(userId)
    if (!core.isAdmin(admin)) fail('需要管理员权限')
    let rows = []
    try {
      const { data } = await db.collection('profile_changes').where({ status: 'pending' }).limit(200).get()
      rows = data || []
    } catch (e) {
      rows = []
    }
    const users = {}
    for (const row of rows) {
      if (!users[row.userId]) users[row.userId] = await getUser(row.userId)
    }
    return rows
      .filter((row) => users[row.userId] && !users[row.userId].deleted)
      .map((row) => {
        const owner = users[row.userId]
        return {
          ...publicChange(row),
          userName: owner.realName || owner.nickname || '',
          avatar: owner.avatar || ''
        }
      })
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
  },

  async reviewProfileChange(data = {}, { userId }) {
    const admin = await needUser(userId)
    if (!core.isAdmin(admin)) fail('需要管理员权限')
    const id = data.id || data.changeId
    if (!id) fail('缺少审核记录')
    let row = null
    try {
      const { data: rows } = await db.collection('profile_changes').doc(id).get()
      row = rows[0] || null
    } catch (e) {
      row = null
    }
    if (!row || row.status !== 'pending') fail('该申请已处理')
    if (row.userId === admin._id) fail('不能审核自己的资料修改')
    const target = await getUser(row.userId)
    if (!target || target.deleted) fail('用户不存在')
    const now = nowIso()
    if (data.approved === false) {
      const reason = (data.reason || '').trim() || '未通过审核'
      await db.collection('profile_changes').doc(id).update({
        status: 'rejected',
        reason,
        reviewerId: admin._id,
        reviewedAt: now
      })
      await pushNotify(target._id, '资料修改未通过', `姓名、手机号或部门的修改未通过。${reason}`, {
        type: 'profile_change_rejected'
      })
      return { ok: true }
    }
    await assertPhoneFree(row.phone, target._id)
    const next = {
      realName: String(row.realName || '').trim(),
      phone: normPhone(row.phone),
      department: String(row.department || '').trim()
    }
    if (!next.realName || !/^1\d{10}$/.test(next.phone)) fail('申请内容不完整')
    await db.collection('users').doc(target._id).update({
      realName: next.realName,
      phone: next.phone,
      department: next.department,
      nickname: next.realName || target.nickname,
      verified: true
    })
    await db.collection('profile_changes').doc(id).update({
      status: 'approved',
      reason: '',
      reviewerId: admin._id,
      reviewedAt: now
    })
    await pushNotify(target._id, '资料修改已通过', '姓名、手机号和部门已更新。', {
      type: 'profile_change_approved'
    })
    return { ok: true }
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
