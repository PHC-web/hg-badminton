<template>
  <view class="page">
    <hg-nav title="网页后台登录" />
    <view class="pad">
      <view class="card box">
        <view class="h">确认登录网页管理后台</view>
        <view class="d">仅超级管理员 / 管理员可确认。确认后电脑端将自动进入后台。</view>

        <view v-if="!user.isAdmin" class="rule-box">当前账号没有管理权限，无法登录网页后台。</view>
        <template v-else>
          <view class="field">
            <text class="field-label">登录码</text>
            <input class="input" v-model="ticket" placeholder="扫描小程序码后自动填入，也可手动输入" />
          </view>
          <button class="btn-primary" :loading="saving" @click="confirmLogin">确认登录</button>
        </template>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'
import { requireLogin } from '@/utils/nav'

const user = useUserStore()
const ticket = ref('')
const saving = ref(false)

onLoad((q) => {
  ticket.value = String(q.scene || q.ticket || '').trim()
})

async function confirmLogin() {
  if (!requireLogin()) return
  const id = ticket.value.trim()
  if (!id) {
    toast('缺少登录码')
    return
  }
  saving.value = true
  try {
    await api.confirmWebLogin({ ticketId: id })
    toast('已确认，请回到电脑查看', 'success')
  } finally {
    saving.value = false
  }
}
</script>

<style lang="scss" scoped>
.box { padding: 32rpx; }
.h { font-size: 32rpx; font-weight: 700; margin-bottom: 12rpx; }
.d { font-size: 24rpx; color: $hg-text2; line-height: 1.6; margin-bottom: 28rpx; }
</style>
