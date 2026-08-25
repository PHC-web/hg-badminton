<template>
  <view class="page">
    <hg-nav title="设置" />
    <view class="pad">
      <view class="card form">
        <view class="field">
          <text class="field-label">昵称</text>
          <input class="input" v-model="form.nickname" />
        </view>
        <view class="field">
          <text class="field-label">手机号</text>
          <input class="input" v-model="form.phone" type="number" />
        </view>
        <button class="btn-primary" @click="save">保存资料</button>
      </view>
      <view class="section-title">数据</view>
      <view class="menu-list">
        <view class="menu-item" @click="toggleCloud">
          <view class="lt">使用 uniCloud 云端</view>
          <view class="rs">{{ cloudOn ? '已开启' : '本地数据' }} ›</view>
        </view>
        <view class="menu-item" @click="reset">
          <view class="lt">重置演示数据</view>
          <view class="rs">›</view>
        </view>
        <view class="menu-item" @click="logout">
          <view class="lt" style="color: #C73E44;">退出登录</view>
        </view>
      </view>
      <view class="ver">追光羽毛球 v1.0.0 · hg-badminton</view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast, confirm } from '@/utils/format'
import { USE_CLOUD_KEY } from '@/utils/constants'

const user = useUserStore()
const form = reactive({ nickname: '', phone: '' })
const cloudOn = ref(false)

onShow(() => {
  form.nickname = user.profile?.nickname || ''
  form.phone = user.profile?.phone || ''
  cloudOn.value = !!uni.getStorageSync(USE_CLOUD_KEY)
})

async function save() {
  const p = await api.updateProfile({ nickname: form.nickname, phone: form.phone })
  user.persist(p)
  toast('已保存', 'success')
}

function toggleCloud() {
  cloudOn.value = !cloudOn.value
  uni.setStorageSync(USE_CLOUD_KEY, cloudOn.value)
  toast(cloudOn.value ? '已切换到 uniCloud（需先关联云空间）' : '已切换到本地数据')
}

async function reset() {
  if (!(await confirm('将清空本地数据并重新注入演示比赛，是否继续？'))) return
  await api.seedDemo(true)
  toast('已重置', 'success')
}

function logout() {
  user.logout()
  uni.reLaunch({ url: '/pages/login/index' })
}
</script>

<style lang="scss" scoped>
.form {
  padding: 32rpx;
}
.menu-list {
  background: #fff;
  border-radius: 28rpx;
  overflow: hidden;
}
.menu-item {
  display: flex;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid #F7F8FA;
}
.lt {
  flex: 1;
}
.rs {
  color: $hg-text3;
}
.ver {
  text-align: center;
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 48rpx;
}
</style>
