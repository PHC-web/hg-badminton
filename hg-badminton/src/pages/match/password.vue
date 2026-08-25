<template>
  <view class="page">
    <hg-nav title="比赛密码" />
    <view class="pad">
      <view class="card box">
        <view class="lock">🔒</view>
        <view class="t">该比赛已开启访问保护</view>
        <view class="d">未在白名单内的用户需要输入比赛密码后查看。输入一次后本机缓存，无需重复输入。</view>
        <view class="field" style="margin-top: 32rpx;">
          <text class="field-label">比赛查看密码<text class="req">*</text></text>
          <input class="input" v-model="password" password placeholder="请输入 4-8 位密码" />
        </view>
        <button class="btn-primary" @click="ok">确认进入</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useMatchStore } from '@/stores/match'
import { toast } from '@/utils/format'

const id = ref('')
const password = ref('')
const store = useMatchStore()

onLoad((q) => {
  id.value = q.id
})

async function ok() {
  await api.verifyPassword({ matchId: id.value, password: password.value })
  toast('验证成功', 'success')
  store.select(id.value)
  uni.redirectTo({ url: `/pages/match/detail?id=${id.value}` })
}
</script>

<style lang="scss" scoped>
.box {
  padding: 48rpx 32rpx;
  text-align: center;
  margin-top: 40rpx;
}
.lock {
  font-size: 72rpx;
}
.t {
  font-size: 32rpx;
  font-weight: 700;
  margin: 16rpx 0 12rpx;
}
.d {
  font-size: 24rpx;
  color: $hg-text2;
  line-height: 1.7;
  text-align: left;
}
</style>
