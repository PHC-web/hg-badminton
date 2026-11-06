import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'

/** 自定义顶栏内容的上边距，避开微信右上角胶囊 */
export function belowCapsuleTop() {
  const sys = uni.getSystemInfoSync()
  const bar = sys.statusBarHeight || 0
  try {
    const menu = uni.getMenuButtonBoundingClientRect?.()
    if (menu && menu.bottom > bar) return menu.bottom + 10
  } catch (e) {
    /* 非微信环境没有胶囊 */
  }
  return bar + 48
}

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
