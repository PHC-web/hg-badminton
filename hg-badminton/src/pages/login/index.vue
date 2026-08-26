<template>
  <view class="login" :style="{ paddingTop: bar + 'px' }">
    <view class="glow g1" />
    <view class="glow g2" />
    <view class="glow g3" />

    <view class="stage">
      <view class="brand">
        <view class="mark">🏸</view>
        <view class="name">追光羽毛球</view>
        <view class="tagline">日常活动报名 · 比赛管理</view>
      </view>
    </view>

    <view class="dock" :style="{ paddingBottom: safeBottom + 'px' }">
      <view v-if="step === 'login'" class="dock-inner">
        <button class="btn-login" :loading="loading" @click="doWxLogin">微信一键登录</button>
        <button class="btn-guest" @click="enterGuest">游客模式</button>
      </view>

      <view v-else-if="step === 'profile'" class="panel">
        <view class="panel-title">完善个人资料</view>
        <view class="hint">提交后需超级管理员审核通过才能使用</view>
        <view class="field">
          <text class="field-label">真实姓名<text class="req">*</text></text>
          <input class="input" v-model="form.realName" placeholder="请输入真实姓名" />
        </view>
        <view class="field">
          <text class="field-label">手机号<text class="req">*</text></text>
          <input class="input" v-model="form.phone" type="number" maxlength="11" placeholder="请输入手机号" />
        </view>
        <view class="field">
          <text class="field-label">部门<text class="req">*</text></text>
          <input class="input" v-model="form.department" placeholder="请输入部门" />
        </view>
        <button class="btn-login dark" :loading="loading" @click="saveProfile">提交审核</button>
      </view>

      <view v-else-if="step === 'pending'" class="panel wait">
        <view class="wait-icon">⏳</view>
        <view class="panel-title">等待审核中</view>
        <view class="wait-desc">
          资料已提交，请等待超级管理员审核并分配组别。审核通过后可重新打开小程序进入。
        </view>
        <button class="btn-login dark" :loading="loading" @click="checkStatus">刷新审核状态</button>
        <button class="btn-guest dark-outline" @click="logout">退出登录</button>
      </view>

      <view v-else-if="step === 'rejected'" class="panel wait">
        <view class="wait-icon">!</view>
        <view class="panel-title">未通过审核</view>
        <view class="wait-desc">{{ rejectReason }}</view>
        <button class="btn-login dark" @click="step = 'profile'">修改资料并重新提交</button>
        <button class="btn-guest dark-outline" @click="logout">退出登录</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { useMatchStore } from '@/stores/match'
import { toast } from '@/utils/format'

const sys = uni.getSystemInfoSync()
const bar = sys.statusBarHeight || 0
const safeBottom = Math.max(sys.safeAreaInsets?.bottom || 0, 16)
const user = useUserStore()
const match = useMatchStore()
const step = ref('login')
const loading = ref(false)
const form = reactive({ realName: '', phone: '', department: '' })

const rejectReason = computed(
  () => user.profile?.rejectReason || '审核未通过，请修改资料后重新提交，或联系管理员。'
)

function goHome() {
  uni.switchTab({ url: '/pages/activity/index' })
}

function fillForm(u) {
  form.realName = u?.realName || ''
  form.phone = u?.phone || ''
  form.department = u?.department || ''
}

function syncStep() {
  if (!user.loggedIn) {
    step.value = 'login'
    return
  }
  if (user.needProfile) {
    fillForm(user.profile)
    step.value = 'profile'
    return
  }
  if (user.approveStatus === 'rejected') {
    fillForm(user.profile)
    step.value = 'rejected'
    return
  }
  if (user.needApproval) {
    step.value = 'pending'
    return
  }
  goHome()
}

async function afterLogin() {
  syncStep()
  if (!user.needProfile && !user.needApproval) {
    await match.refreshList().catch(() => {})
    toast('登录成功', 'success')
  }
}

async function doWxLogin() {
  loading.value = true
  try {
    await user.wxLogin()
    await afterLogin()
  } catch (e) {
    // api 层已提示
  } finally {
    loading.value = false
  }
}

function enterGuest() {
  user.enterGuest()
  uni.switchTab({ url: '/pages/activity/index' })
}

async function saveProfile() {
  if (!form.realName || !form.phone || !form.department.trim()) {
    toast('请填写姓名、手机号和部门')
    return
  }
  if (!/^1\d{10}$/.test(form.phone)) {
    toast('手机号格式不正确')
    return
  }
  loading.value = true
  try {
    await user.completeProfile({ ...form })
    toast('已提交，请等待审核')
    syncStep()
  } catch (e) {
    // api 层已提示
  } finally {
    loading.value = false
  }
}

async function checkStatus() {
  loading.value = true
  try {
    await user.refreshProfile()
    if (!user.needApproval && !user.needProfile) {
      await match.refreshList().catch(() => {})
      toast('审核已通过', 'success')
      goHome()
    } else if (user.approveStatus === 'rejected') {
      step.value = 'rejected'
      toast('审核未通过')
    } else {
      toast('仍在审核中')
      step.value = 'pending'
    }
  } finally {
    loading.value = false
  }
}

function logout() {
  user.logout()
  step.value = 'login'
}

onShow(() => {
  if (user.loggedIn) syncStep()
  else step.value = 'login'
})
</script>

<style lang="scss" scoped>
.login {
  min-height: 100vh;
  height: 100vh;
  box-sizing: border-box;
  background: $hg-hero-gradient;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  padding-bottom: 0;
}

.glow {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  filter: blur(2px);
}
.g1 {
  width: 520rpx;
  height: 520rpx;
  right: -160rpx;
  top: 8%;
  background: rgba(255, 255, 255, 0.12);
}
.g2 {
  width: 380rpx;
  height: 380rpx;
  left: -120rpx;
  bottom: 28%;
  background: rgba(43, 159, 224, 0.28);
}
.g3 {
  width: 240rpx;
  height: 240rpx;
  right: 12%;
  bottom: 18%;
  background: rgba(255, 255, 255, 0.08);
}

.stage {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
  padding: 0 48rpx;
}

.brand {
  text-align: center;
  color: #fff;
}
.mark {
  font-size: 112rpx;
  line-height: 1;
  margin-bottom: 28rpx;
  text-shadow: 0 12rpx 40rpx rgba(0, 40, 80, 0.25);
}
.name {
  font-size: 56rpx;
  font-weight: 800;
  letter-spacing: 4rpx;
}
.tagline {
  margin-top: 18rpx;
  font-size: 26rpx;
  opacity: 0.88;
  letter-spacing: 2rpx;
}

.dock {
  z-index: 2;
  padding: 0 40rpx 24rpx;
}
.dock-inner {
  padding-bottom: 24rpx;
}

.btn-login {
  width: 100%;
  height: 96rpx;
  border-radius: 48rpx;
  background: #fff;
  color: $hg-primary-deep;
  font-size: 32rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-shadow: 0 16rpx 40rpx rgba(0, 40, 90, 0.22);
}
.btn-guest {
  width: 100%;
  height: 88rpx;
  margin-top: 20rpx;
  border-radius: 48rpx;
  background: transparent;
  color: #fff;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2rpx solid rgba(255, 255, 255, 0.55);
}
.btn-login.dark {
  background: $hg-primary;
  color: #fff;
  box-shadow: none;
}
.btn-guest.dark-outline {
  color: $hg-text2;
  border-color: $hg-line;
  margin-top: 16rpx;
}
.btn-login::after,
.btn-guest::after {
  border: none;
}

.panel {
  background: #fff;
  border-radius: 32rpx 32rpx 0 0;
  padding: 36rpx 32rpx 20rpx;
  margin: 0 -40rpx;
  padding-left: 40rpx;
  padding-right: 40rpx;
}
.panel-title {
  font-size: 32rpx;
  font-weight: 700;
  color: $hg-text;
  margin-bottom: 12rpx;
}
.hint {
  font-size: 24rpx;
  color: $hg-text3;
  margin-bottom: 24rpx;
  line-height: 1.5;
}
.panel .field-label {
  color: $hg-text2;
}
.panel .input {
  background: #F7F9FC;
}
.wait {
  text-align: center;
  padding-top: 48rpx;
  padding-bottom: 40rpx;
}
.wait-icon {
  font-size: 64rpx;
  margin-bottom: 12rpx;
}
.wait-desc {
  font-size: 26rpx;
  color: $hg-text2;
  line-height: 1.7;
  margin: 8rpx 0 36rpx;
  text-align: left;
}
</style>
