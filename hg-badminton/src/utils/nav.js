import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'

export function openMatch(id) {
  uni.navigateTo({ url: `/pages/match/detail?id=${id}` })
}

/** 需要真实登录（游客不可） */
export function requireLogin(message = '登录后即可使用该功能') {
  const user = useUserStore()
  if (!user.loggedIn) {
    toast(message)
    uni.navigateTo({ url: '/pages/login/index' })
    return false
  }
  if (user.needProfile || user.needApproval) {
    toast(user.needApproval ? '请等待管理员审核' : '请先完善资料')
    uni.reLaunch({ url: '/pages/login/index' })
    return false
  }
  return true
}

/** Tab / 主流程：游客可浏览；正式用户须资料齐全且已审核 */
export function guardAppAccess() {
  const user = useUserStore()
  if (!user.hasSession) {
    uni.reLaunch({ url: '/pages/login/index' })
    return false
  }
  if (user.isGuest) return true
  if (user.needProfile || user.needApproval) {
    uni.reLaunch({ url: '/pages/login/index' })
    return false
  }
  return true
}
