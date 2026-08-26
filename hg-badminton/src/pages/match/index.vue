<template>
  <view class="page">
    <view class="hero" :style="{ paddingTop: bar + 12 + 'px' }">
      <view class="hero-top">
        <view>
          <view class="greet">比赛</view>
          <view class="name">选择一场比赛</view>
        </view>
        <view v-if="user.isAdmin" class="pub" @click="goCreate">＋ 发布</view>
      </view>
    </view>

    <view class="pad">
      <hg-match-card v-for="m in list" :key="m._id" :item="m" @click="openDetail(m)" />
      <hg-empty v-if="!list.length" text="暂无比赛" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { useMatchStore } from '@/stores/match'
import { requireLogin, guardAppAccess } from '@/utils/nav'

const user = useUserStore()
const store = useMatchStore()
const list = ref([])
const bar = uni.getSystemInfoSync().statusBarHeight || 0

async function load() {
  if (!guardAppAccess()) return
  list.value = await api.listMatches({})
  store.list = list.value
}

function openDetail(m) {
  store.select(m._id)
  let tab = 'intro'
  if (m.status === 'registering') tab = 'register'
  else if (m.status === 'finished' || m.status === 'closed') tab = 'result'
  else if (m.status === 'in_progress') tab = 'fixture'
  store.setSubTab(tab)
  uni.navigateTo({ url: `/pages/match/detail?id=${m._id}&tab=${tab}` })
}

function goCreate() {
  if (!requireLogin('登录后可发布比赛')) return
  uni.navigateTo({ url: '/pages/match/create' })
}

onShow(load)
</script>

<style lang="scss" scoped>
.hero {
  background: $hg-hero-gradient;
  color: #fff;
  padding: 28rpx 28rpx 48rpx;
  border-radius: 0 0 40rpx 40rpx;
}
.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.greet {
  font-size: 26rpx;
  opacity: 0.85;
}
.name {
  font-size: 40rpx;
  font-weight: 700;
  margin-top: 4rpx;
}
.pub {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 24rpx;
  padding: 12rpx 24rpx;
  font-size: 26rpx;
}
</style>
