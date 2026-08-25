import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'

export async function openMatch(id, fallback = 'detail') {
  try {
    const m = await api.getMatch(id)
    if (m.access && m.access.needPassword) {
      uni.navigateTo({ url: `/pages/match/password?id=${id}&to=${fallback}` })
      return
    }
    if (fallback === 'result') {
      uni.switchTab({ url: '/pages/result/index' })
      return
    }
    uni.navigateTo({ url: `/pages/match/detail?id=${id}` })
  } catch (e) {
    toast(e.message || '无法打开比赛')
  }
}

export function requireLogin() {
  const user = useUserStore()
  if (!user.loggedIn) {
    uni.navigateTo({ url: '/pages/login/index' })
    return false
  }
  return true
}
