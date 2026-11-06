'use strict'

/**
 * hg-gateway — 统一网关入口
 *
 * 客户端只调用本云对象：
 *   uniCloud.importObject('hg-gateway').invoke({ service, action, data, _userId })
 *
 * service:
 *   base     → hg-base      登录 / 用户 / 角色 / 通知
 *   activity → hg-activity  日常活动
 *   match    → hg-match     比赛
 */

const SERVICE_MAP = {
  base: 'hg-base',
  activity: 'hg-activity',
  match: 'hg-match'
}

function fail(message, errCode = 'BIZ') {
  const err = new Error(message)
  err.errCode = errCode
  err.errMsg = message
  throw err
}

function pickErrMsg(err) {
  if (!err) return ''
  if (typeof err === 'string') return err
  return (
    err.errMsg ||
    err.message ||
    err.error?.message ||
    err.error?.errMsg ||
    (typeof err.error === 'string' ? err.error : '') ||
    ''
  )
}

function extractError(res) {
  if (!res) return '云函数无响应'

  // callFunction 自身失败
  if (res.success === false) {
    return pickErrMsg(res.error) || pickErrMsg(res) || '云函数调用失败'
  }

  const r = res.result
  if (r == null) return null

  // createHandler 约定：{ ok: false, message }
  if (typeof r === 'object' && r.ok === false) {
    return r.message || r.errMsg || '业务处理失败'
  }

  // 兼容旧抛错形态被包进 result
  if (typeof r === 'object' && (r.errCode || r.code === 'BIZ') && (r.errMsg || r.message)) {
    return r.errMsg || r.message
  }

  return null
}

function unwrapResult(res) {
  const r = res && res.result
  if (r && typeof r === 'object' && r.ok === true && 'data' in r) {
    return r.data
  }
  return r
}

async function callService(serviceKey, action, data, userId) {
  const name = SERVICE_MAP[serviceKey]
  if (!name) fail(`未知服务：${serviceKey || '(空)'}，可选 base / activity / match`)
  if (!action) fail('缺少 action')

  let res
  try {
    res = await uniCloud.callFunction({
      name,
      data: {
        action,
        data: data !== undefined ? data : {},
        _userId: userId || ''
      }
    })
  } catch (e) {
    fail(pickErrMsg(e) || '服务暂时不可用，请稍后重试')
  }

  const errMsg = extractError(res)
  if (errMsg) fail(errMsg)

  return unwrapResult(res)
}

module.exports = {
  _before() {
    try {
      const args = this.getParams()[0]
      this.payload = args && typeof args === 'object' ? args : {}
    } catch (e) {
      this.payload = {}
    }
  },

  /**
   * @param {object} payload
   * @param {string} payload.service  base | activity | match
   * @param {string} payload.action   业务动作名
   * @param {object} [payload.data]   业务参数
   * @param {string} [payload._userId] 当前用户 id
   */
  async invoke(payload = {}) {
    payload = payload && typeof payload === 'object' ? payload : this.payload || {}
    return callService(
      payload.service,
      payload.action,
      payload.data !== undefined ? payload.data : {},
      payload._userId || ''
    )
  },

  async ping() {
    return {
      ok: true,
      services: Object.keys(SERVICE_MAP),
      time: Date.now()
    }
  }
}
