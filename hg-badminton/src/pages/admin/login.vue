<template>
  <view class="wrap hg-admin">
    <view class="card">
      <view class="mark">🏸</view>
      <view class="name">追光羽毛球</view>
      <view class="sub">管理后台 · 仅超级管理员 / 管理员</view>

      <button v-if="localSim" class="btn" :loading="loading" @click="localLogin">本地管理员登录</button>
      <template v-else>
        <image v-if="qr" class="qr" :src="qr" mode="aspectFit" />
        <view v-else class="qr-ph">{{ qrHint }}</view>
        <view class="code">登录码 {{ ticketId || '—' }}</view>
        <view class="tip">
          请用微信扫描上方小程序码，或打开小程序「我的 → 网页后台登录」输入登录码后确认。
          <text v-if="allowPassword">本地开发也可扫开发版小程序码。</text>
        </view>
        <button class="btn ghost" :loading="loading" @click="refreshTicket">刷新二维码</button>

        <template v-if="allowPassword">
          <view class="or">或使用开发账号</view>
          <view class="field">
            <text class="label">账号</text>
            <input class="input" v-model="loginName" placeholder="管理员账号" confirm-type="next" />
          </view>
          <view class="field">
            <text class="label">密码</text>
            <input
              class="input"
              v-model="password"
              password
              placeholder="请输入密码"
              confirm-type="done"
              @confirm="passwordLogin"
            />
          </view>
          <button class="btn" :loading="loading" @click="passwordLogin">账号登录</button>
        </template>
      </template>
    </view>
  </view>
</template>

<script setup>
import { onUnmounted, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
// #ifdef H5
import '@/admin/admin-h5.scss'
// #endif
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { isUserApproved, toast } from '@/utils/format'
import { isLocalSim } from '@/utils/data-mode'
import { isDevWebAdmin } from '@/utils/web-env'

const user = useUserStore()
const localSim = isLocalSim()
const allowPassword = isDevWebAdmin()
const loading = ref(false)
const ticketId = ref('')
const qr = ref('')
const qrHint = ref('正在生成登录码…')
const loginName = ref('admin')
const password = ref('')
let timer = null

function goHome() {
  uni.reLaunch({ url: '/pages/admin/index' })
}

function acceptUser(u) {
  if (!u) return false
  user.persist(u)
  if (!user.isAdmin) {
    user.logout()
    toast('仅管理员可进入网页后台')
    return false
  }
  if (!isUserApproved(u) && !user.isSuper) {
    user.logout()
    toast('账号尚未审核通过')
    return false
  }
  goHome()
  return true
}

async function localLogin() {
  loading.value = true
  try {
    const u = await api.localDevLogin()
    acceptUser(u)
  } finally {
    loading.value = false
  }
}

async function passwordLogin() {
  if (!allowPassword) {
    toast('正式环境仅支持微信扫码登录')
    return
  }
  const name = loginName.value.trim()
  const pwd = password.value
  if (!name || !pwd) {
    toast('请输入账号和密码')
    return
  }
  loading.value = true
  try {
    const u = await api.webPasswordLogin({ loginName: name, password: pwd })
    acceptUser(u)
  } finally {
    loading.value = false
  }
}

async function refreshTicket() {
  loading.value = true
  qrHint.value = '正在生成登录码…'
  try {
    const r = await api.createWebLoginTicket()
    ticketId.value = r.ticketId || ''
    qr.value = r.qrBase64 || ''
    if (!qr.value) qrHint.value = '请在小程序输入登录码确认'
    startPoll()
  } catch (e) {
    qrHint.value = e.message || '生成登录码失败'
  } finally {
    loading.value = false
  }
}

function startPoll() {
  stopPoll()
  timer = setInterval(async () => {
    if (!ticketId.value) return
    try {
      const r = await api.pollWebLoginTicket({ ticketId: ticketId.value })
      if (r.status === 'approved' && r.user) {
        stopPoll()
        acceptUser(r.user)
      } else if (r.status === 'expired' || r.status === 'invalid' || r.status === 'consumed') {
        stopPoll()
        qrHint.value = '登录码已失效，请刷新'
        qr.value = ''
      }
    } catch (e) {
      /* 轮询失败不打断 */
    }
  }, 2000)
}

function stopPoll() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onShow(() => {
  user.restore()
  if (user.loggedIn && user.isAdmin) {
    goHome()
    return
  }
  if (!localSim) refreshTicket()
})

onUnmounted(stopPoll)
</script>

<style lang="scss" scoped>
.wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(145deg, #2b9fe0 0%, #006db8 52%, #004a7c 100%);
  padding: 32px 16px;
}
.card {
  width: 480px;
  max-width: 100%;
  background: #fff;
  border-radius: 20px;
  padding: 40px 36px;
  text-align: center;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18);
  color: #1a2332;
}
.mark { font-size: 48px; }
.name { font-size: 28px; font-weight: 800; margin-top: 8px; color: #1a2332; }
.sub { font-size: 16px; color: #4a5563; margin: 8px 0 24px; }
.qr, .qr-ph {
  width: 240px;
  height: 240px;
  margin: 0 auto 12px;
  border: 1px solid #d5dee7;
  border-radius: 12px;
  background: #fafbfc;
}
.qr-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  color: #4a5563;
  font-size: 16px;
  padding: 16px;
  box-sizing: border-box;
}
.code { font-size: 18px; font-weight: 700; color: #006db8; letter-spacing: 1px; }
.tip { font-size: 15px; color: #3d4a57; line-height: 1.7; margin: 12px 0 20px; text-align: left; }
.or {
  margin: 22px 0 14px;
  font-size: 15px;
  color: #4a5563;
  position: relative;
}
.field { text-align: left; margin-bottom: 14px; }
.label {
  display: block;
  font-size: 15px;
  color: #3d4a57;
  margin-bottom: 6px;
}
.input {
  width: 100%;
  height: 48px;
  border: 1px solid #c5d0db;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 16px;
  color: #1a2332;
  background: #fff;
  box-sizing: border-box;
}
.btn {
  width: 100%;
  height: 48px;
  border: none;
  border-radius: 10px;
  background: #006db8;
  color: #fff;
  font-size: 17px;
  font-weight: 600;
}
.btn.ghost {
  background: #e8f3fb;
  color: #006db8;
}
</style>
