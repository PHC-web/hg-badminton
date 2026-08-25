import { defineStore } from 'pinia'
import { USER_KEY } from '@/utils/constants'
import { api } from '@/api'
import { hasAnyRole, isAdmin, isSuper } from '@/utils/format'

export const useUserStore = defineStore('user', {
  state: () => ({
    profile: null
  }),
  getters: {
    loggedIn: (s) => !!s.profile,
    roles: (s) => (s.profile?.viewRole ? [s.profile.viewRole] : s.profile?.roles || []),
    isAdmin: (s) => isAdmin(s.profile),
    isSuper: (s) => isSuper(s.profile),
    isCaptain: (s) => hasAnyRole(s.profile, ['super_admin', 'admin', 'captain']),
    isReferee: (s) => hasAnyRole(s.profile, ['super_admin', 'admin', 'referee'])
  },
  actions: {
    restore() {
      this.profile = uni.getStorageSync(USER_KEY) || null
    },
    persist(p) {
      this.profile = p
      if (p) uni.setStorageSync(USER_KEY, p)
      else uni.removeStorageSync(USER_KEY)
    },
    async loginDemo(userId) {
      const u = await api.login({ userId })
      this.persist(u)
      return u
    },
    async switchRole(role) {
      const u = await api.switchViewRole(role)
      this.persist(u)
      return u
    },
    logout() {
      this.persist(null)
    }
  }
})
