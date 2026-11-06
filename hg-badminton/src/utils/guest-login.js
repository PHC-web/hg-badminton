/** 游客尝试提交时提示登录，确认后回到登录页 */
export function promptGuestLogin() {
  uni.showModal({
    title: '请先登录',
    content: '演示数据仅供浏览，登录后才能提交。',
    confirmText: '去登录',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm) uni.reLaunch({ url: '/pages/login/index' })
    }
  })
}
