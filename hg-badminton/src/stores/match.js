import { defineStore } from 'pinia'
import { SELECTED_MATCH_KEY } from '@/utils/constants'
import { api } from '@/api'

export const useMatchStore = defineStore('match', {
  state: () => ({
    selectedId: '',
    list: [],
    /** 比赛详情嵌套 tab：intro | register | fixture | result */
    subTab: 'intro'
  }),
  actions: {
    restore() {
      this.selectedId = uni.getStorageSync(SELECTED_MATCH_KEY) || ''
    },
    select(id) {
      this.selectedId = id
      uni.setStorageSync(SELECTED_MATCH_KEY, id)
    },
    setSubTab(tab) {
      this.subTab = tab || 'intro'
    },
    openDetail(id, tab = 'intro') {
      if (id) this.select(id)
      this.setSubTab(tab)
      uni.navigateTo({ url: `/pages/match/detail?id=${id}&tab=${tab}` })
    },
    async refreshList(params) {
      this.list = await api.listMatches(params || {})
      if (!this.selectedId && this.list.length) {
        const prefer = this.list.find((m) => m.status === 'in_progress') || this.list[0]
        this.select(prefer._id)
      }
      return this.list
    }
  }
})
