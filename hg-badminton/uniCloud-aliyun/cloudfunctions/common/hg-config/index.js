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

function splitEmails(raw) {
  return String(raw || '')
    .split(/[,;，；\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))
}

module.exports = {
  getWeixin() {
    const file = loadFileConfig()
    const appId = (process.env.WX_APPID || file.appId || '').trim()
    const appSecret = (process.env.WX_APP_SECRET || file.appSecret || '').trim()
    return { appId, appSecret }
  },

  /** hg-base 环境变量：SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SUPER_ADMIN_EMAIL */
  getMail() {
    return {
      host: (process.env.SMTP_HOST || '').trim(),
      port: Number(process.env.SMTP_PORT) || 465,
      user: (process.env.SMTP_USER || '').trim(),
      pass: process.env.SMTP_PASS || '',
      adminEmails: splitEmails(process.env.SUPER_ADMIN_EMAIL)
    }
  }
}
