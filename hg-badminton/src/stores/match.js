import { defineStore } from 'pinia'
import { SELECTED_MATCH_KEY } from '@/utils/constants'
import { api } from '@/api'

export const useMatchStore = defineStore('match', {
  state: () => ({
    selectedId: '',
    list: [],
    stats: { live: 0, upcoming: 0, finished: 0, mine: 0 }
  }),
  actions: {
    restore() {
      this.selectedId = uni.getStorageSync(SELECTED_MATCH_KEY) || ''
    },
    select(id) {
      this.selectedId = id
      uni.setStorageSync(SELECTED_MATCH_KEY, id)
    },
    async refreshList(params) {
      this.list = await api.listMatches(params || {})
      this.stats = await api.stats()
      if (!this.selectedId && this.list.length) {
        const prefer = this.list.find((m) => m.status === 'in_progress') || this.list[0]
        this.select(prefer._id)
      }
      return this.list
    }
  }
})
