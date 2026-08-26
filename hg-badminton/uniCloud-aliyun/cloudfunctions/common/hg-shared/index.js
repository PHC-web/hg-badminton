'use strict'

const db = uniCloud.database()

function fail(message, errCode = 'BIZ') {
  const err = new Error(message)
  err.errCode = errCode
  err.errMsg = message
  throw err
}

function nid(prefix = '') {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function nowIso() {
  return new Date().toISOString()
}

function publicUser(u) {
  if (!u) return null
  const { sessionKey, ...rest } = u
  return rest
}

async function getUser(id) {
  if (!id) return null
  const { data } = await db.collection('users').doc(id).get()
  return data[0] || null
}

/** 按 openid 取当前有效用户（跳过软删除；同 openid 可有多条历史记录） */
async function getUserByOpenid(openid) {
  if (!openid) return null
  const { data } = await db.collection('users').where({ openid }).limit(50).get()
  return (data || []).find((u) => u && !u.deleted) || null
}

async function needUser(userId) {
  const u = await getUser(userId)
  if (!u) fail('请先登录')
  if (u.deleted) fail('账号已停用，请重新登录注册')
  return u
}

async function needAdmin(userId, isAdminFn) {
  const u = await needUser(userId)
  if (!isAdminFn(u)) fail('需要管理员权限')
  return u
}

/**
 * 云函数统一入口包装：{ action, data, _userId }
 * 始终返回 { ok, data|message }，避免未捕获异常导致网关 HTTP 500
 */
function createHandler(actions) {
  return async (event = {}) => {
    try {
      const action = event.action
      const data = event.data !== undefined ? event.data : {}
      const userId = event._userId || ''
      if (!action || typeof actions[action] !== 'function') {
        return { ok: false, errCode: 'NOT_FOUND', message: `未知动作：${action || '(空)'}` }
      }
      const result = await actions[action](data, { userId, event })
      return { ok: true, data: result }
    } catch (e) {
      return {
        ok: false,
        errCode: e.errCode || 'BIZ',
        message: e.errMsg || e.message || '业务处理失败'
      }
    }
  }
}

module.exports = {
  db,
  fail,
  nid,
  nowIso,
  publicUser,
  getUser,
  getUserByOpenid,
  needUser,
  needAdmin,
  createHandler
}
