import { defineStore } from 'pinia'
import { USER_KEY, GUEST_PROFILE, GUEST_USER_ID } from '@/utils/constants'
import { api } from '@/api'
import { isAdmin, isSuper, isCaptain, isReferee, assignableRoles, isUserApproved } from '@/utils/format'

function uniLogin() {
  return new Promise((resolve, reject) => {
    // #ifdef MP-WEIXIN
    uni.login({
      provider: 'weixin',
      success: (res) => {
        if (res.code) resolve(res.code)
        else reject(new Error('未获取到微信登录 code'))
      },
      fail: (err) => reject(new Error(err?.errMsg || '微信登录失败'))
    })
    return
    // #endif
    reject(new Error('请在微信小程序中打开并登录'))
  })
}

export const useUserStore = defineStore('user', {
  state: () => ({
    profile: null
  }),
  getters: {
    /** 已进入系统（含游客） */
    hasSession: (s) => !!s.profile,
    /** 游客浏览 */
    isGuest: (s) => !!(s.profile && s.profile.isGuest),
    /** 真实微信登录用户 */
    loggedIn: (s) => !!(s.profile && !s.profile.isGuest),
    canBrowse: (s) => !!s.profile,
    needProfile: (s) => {
      if (!s.profile || s.profile.isGuest) return false
      if (!s.profile.phone || !s.profile.realName) return true
      // 走审核流时部门必填；已通过的老用户可不补部门
      if (!isUserApproved(s.profile) && !String(s.profile.department || '').trim()) return true
      return false
    },
    /** 已填资料，等待超管审核 */
    needApproval: (s) => {
      if (!s.profile || s.profile.isGuest) return false
      if (!s.profile.phone || !s.profile.realName) return false
      return !isUserApproved(s.profile)
    },
    approveStatus: (s) => s.profile?.approveStatus || '',
    needPhone: (s) => !!(s.profile && !s.profile.isGuest && !s.profile.phone),
    roles: (s) => (s.profile?.isGuest ? [] : s.profile?.roles || []),
    isAdmin: (s) => !s.profile?.isGuest && isAdmin(s.profile),
    isSuper: (s) => !s.profile?.isGuest && isSuper(s.profile),
    isCaptain: (s) => !s.profile?.isGuest && isCaptain(s.profile),
    isReferee: (s) => !s.profile?.isGuest && isReferee(s.profile),
    assignable: (s) => (s.profile?.isGuest ? [] : assignableRoles(s.profile))
  },
  actions: {
    restore() {
      this.profile = uni.getStorageSync(USER_KEY) || null
    },
    persist(p) {
      // 微信用户去掉游客标记，避免列表仍走体验目录
      if (p && (p.openid || (p._id && p._id !== GUEST_USER_ID))) {
        const { isGuest, ...rest } = p
        p = { ...rest, isGuest: false }
      }
      this.profile = p
      if (p) uni.setStorageSync(USER_KEY, p)
      else uni.removeStorageSync(USER_KEY)
    },
    enterGuest() {
      this.persist({ ...GUEST_PROFILE })
      return this.profile
    },
    async wxLogin() {
      if (!api.cloudReady()) {
        const err = new Error('登录服务暂不可用，请稍后重试')
        uni.showToast({ title: err.message, icon: 'none' })
        throw err
      }
      const code = await uniLogin()
      const u = await api.wxLogin({ code })
      this.persist(u)
      return u
    },
    async refreshProfile() {
      if (!this.profile?._id || this.profile.isGuest) return this.profile
      try {
        const u = await api.getProfile()
        this.persist(u)
        return u
      } catch (e) {
        const msg = e?.message || e?.errMsg || ''
        if (/停用|重新登录/.test(msg)) {
          this.persist(null)
          return null
        }
        return this.profile
      }
    },
    async completeProfile(form) {
      const u = await api.updateProfile({
        realName: form.realName,
        phone: form.phone,
        department: form.department || '',
        nickname: form.realName || form.nickname,
        submitForReview: true
      })
      this.persist(u)
      return u
    },
    logout() {
      this.persist(null)
    }
  }
})
