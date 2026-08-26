'use strict'

/**
 * 微信配置读取优先级：
 * 1. 云函数环境变量 WX_APPID / WX_APP_SECRET（推荐，在 uniCloud 控制台配置）
 * 2. 本地 config.json（仅开发兜底，勿提交密钥）
 */

let fileCached = null

function loadFileConfig() {
  if (fileCached) return fileCached
  try {
    // eslint-disable-next-line import/no-unresolved
    fileCached = require('./config.json')
  } catch (e) {
    fileCached = { appId: '', appSecret: '' }
  }
  return fileCached
}

module.exports = {
  getWeixin() {
    const file = loadFileConfig()
    const appId = (process.env.WX_APPID || file.appId || '').trim()
    const appSecret = (process.env.WX_APP_SECRET || file.appSecret || '').trim()
    return { appId, appSecret }
  }
}
