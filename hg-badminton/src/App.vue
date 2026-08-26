<script>
import { useUserStore } from '@/stores/user'
import { useMatchStore } from '@/stores/match'
import { api } from '@/api'

export default {
  onLaunch() {
    api.init()
    const user = useUserStore()
    const match = useMatchStore()
    user.restore()
    match.restore()
    // 游客会话不跨冷启动保留，保证先进入登录页
    if (user.isGuest) user.logout()
    if (user.loggedIn) {
      user.refreshProfile().then(() => {
        if (user.needProfile || user.needApproval) {
          uni.reLaunch({ url: '/pages/login/index' })
          return
        }
        // 将本机旧活动/组别导入云端（仅一次）
        api.migrateLocalToCloud().catch(() => {})
      })
    }
  }
}
</script>

<style lang="scss">
page {
  background: $hg-bg;
  color: $hg-text;
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Helvetica Neue', 'Microsoft YaHei', sans-serif;
  font-size: 28rpx;
}

view, text {
  box-sizing: border-box;
}

.page {
  min-height: 100vh;
  background: $hg-bg;
  padding-bottom: calc(env(safe-area-inset-bottom) + 20rpx);
}

.pad {
  padding: 24rpx 28rpx;
}

.card {
  background: $hg-card;
  border-radius: $hg-radius;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
}

.section-title {
  font-size: 30rpx;
  font-weight: 600;
  margin: 28rpx 4rpx 16rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-more {
  font-size: 24rpx;
  color: $hg-primary;
  font-weight: 400;
}

.btn-primary {
  background: $hg-primary;
  color: #fff;
  border: none;
  border-radius: 24rpx;
  height: 92rpx;
  font-size: 32rpx;
  font-weight: 600;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-primary:active {
  background: $hg-primary-dark;
}

.btn-ghost {
  background: $hg-primary-light;
  color: $hg-primary-deep;
  border: none;
  border-radius: 24rpx;
  height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-danger {
  background: $hg-lose-light;
  color: $hg-lose;
  border: none;
  border-radius: 24rpx;
  height: 88rpx;
  font-size: 30rpx;
  font-weight: 600;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.field {
  margin-bottom: 28rpx;
}

.field-label {
  display: block;
  font-size: 26rpx;
  color: $hg-text2;
  margin-bottom: 12rpx;
}

.req {
  color: $hg-lose;
  margin-left: 4rpx;
}

.input, .textarea {
  width: 100%;
  height: 88rpx;
  border: 1rpx solid $hg-line;
  border-radius: 20rpx;
  padding: 0 24rpx;
  font-size: 28rpx;
  background: #FAFBFC;
  color: $hg-text;
}

.textarea {
  height: 144rpx;
  padding: 20rpx 24rpx;
}

.row {
  display: flex;
  align-items: center;
}

.info-row {
  display: flex;
  padding: 18rpx 28rpx;
  font-size: 26rpx;
  border-bottom: 1rpx solid #F7F8FA;
}

.info-k {
  width: 144rpx;
  color: $hg-text3;
  flex-shrink: 0;
}

.info-v {
  color: $hg-text;
  flex: 1;
}

.rule-box {
  background: $hg-primary-light;
  border-radius: 20rpx;
  padding: 20rpx 24rpx;
  margin: 20rpx 0;
  font-size: 24rpx;
  color: $hg-primary-deep;
  line-height: 1.8;
}

.bottom-actions {
  position: sticky;
  bottom: 0;
  background: $hg-card;
  padding: 20rpx 28rpx calc(20rpx + env(safe-area-inset-bottom));
  border-top: 1rpx solid $hg-line;
  display: flex;
  gap: 20rpx;
}

button {
  padding: 0;
  margin: 0;
  line-height: 1.2;
}
button::after {
  border: none;
}
</style>
