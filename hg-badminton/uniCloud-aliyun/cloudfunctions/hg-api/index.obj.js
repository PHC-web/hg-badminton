'use strict'

/**
 * @deprecated 已拆分为 hg-gateway + hg-base / hg-activity / hg-match
 * 保留此云对象仅作兼容转发，请尽快改用 hg-gateway.invoke
 */

module.exports = {
  _before() {
    this.payload = this.getParams()[0] || {}
  },

  async invoke(payload) {
    const gw = uniCloud.importObject('hg-gateway')
    return gw.invoke(payload || this.payload)
  },

  async wxLogin(data) {
    return this._fwd('base', 'wxLogin', data)
  },
  async getProfile(data) {
    return this._fwd('base', 'getProfile', data)
  },
  async updateProfile(data) {
    return this._fwd('base', 'updateProfile', data)
  },
  async listUsers(data) {
    return this._fwd('base', 'listUsers', data)
  },
  async setUserRoles(data) {
    return this._fwd('base', 'setUserRoles', data)
  },

  async _fwd(service, action, data) {
    const payload = data || this.payload || {}
    const gw = uniCloud.importObject('hg-gateway')
    return gw.invoke({
      service,
      action,
      data: payload,
      _userId: payload._userId
    })
  }
}
