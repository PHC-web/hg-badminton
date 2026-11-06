<template>
  <view class="page">
    <view class="hero" :style="{ paddingTop: bar + 12 + 'px' }">
      <view class="hero-top">
        <view>
          <view class="greet">你好，{{ greet }}</view>
          <view class="name">日常活动</view>
        </view>
        <view v-if="user.isAdmin" class="pub" @click="goCreate">＋ 发布</view>
      </view>
    </view>
    <view class="pad">
      <view class="section-title">活动列表</view>
      <hg-loading v-if="loading && !list.length" />
      <view v-for="a in list" :key="a._id" class="card item" @click="open(a)">
        <view class="row top">
          <view class="title">{{ a.name }}</view>
          <hg-chip :text="st(a).label" :type="st(a).chip" />
        </view>
        <view class="meta">📅 {{ time(a) }}　📍 {{ a.location }}</view>
        <view class="meta">👥 {{ a.confirmedCount }}/{{ a.maxCount }} 人
          <text v-if="a.queuedCount"> · 候补 {{ a.queuedCount }}</text>
        </view>
        <view class="foot">
          <text>剩余 {{ a.remain }} 名额</text>
          <text class="enter">查看详情 ›</text>
        </view>
      </view>
      <hg-empty v-if="!list.length && !loading" text="暂无活动" />
    </view>
  </view>
</template>

<script setup>
import { ref, computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { activityDisplayStatus, formatDate } from '@/utils/format'
import { requireLogin, guardAppAccess } from '@/utils/nav'

const user = useUserStore()
const list = ref([])
const loading = ref(false)
const bar = uni.getSystemInfoSync().statusBarHeight || 0
const greet = computed(() => {
  if (user.isGuest) return '游客'
  return user.profile?.realName || user.profile?.nickname || '球友'
})

function st(a) {
  return activityDisplayStatus(a)
}
function time(a) {
  return formatDate(a.startTime, true)
}

async function load() {
  if (!guardAppAccess()) return
  if (user.loggedIn && user.needPhone) {
    toastPhone()
  }
  loading.value = true
  try {
    list.value = await api.listActivities({})
  } finally {
    loading.value = false
  }
}

function toastPhone() {
  uni.showModal({
    title: '完善手机号',
    content: '报名活动/比赛需绑定手机号，请前往设置完善',
    success: (r) => {
      if (r.confirm) uni.navigateTo({ url: '/pages/mine/settings' })
    }
  })
}

function open(a) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${a._id}` })
}
function goCreate() {
  if (!requireLogin('登录后可发布活动')) return
  uni.navigateTo({ url: '/pages/activity/create' })
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
.hero-top { display: flex; justify-content: space-between; align-items: center; }
.greet { font-size: 26rpx; opacity: 0.85; }
.name { font-size: 40rpx; font-weight: 700; margin-top: 4rpx; }
.pub {
  background: rgba(255,255,255,0.2);
  border-radius: 24rpx;
  padding: 12rpx 24rpx;
  font-size: 26rpx;
}
.item { padding: 28rpx; margin-bottom: 20rpx; }
.top { justify-content: space-between; align-items: flex-start; }
.title { font-size: 32rpx; font-weight: 700; flex: 1; padding-right: 12rpx; }
.meta { font-size: 24rpx; color: $hg-text2; line-height: 1.7; margin-top: 8rpx; }
.foot {
  display: flex;
  justify-content: space-between;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed $hg-line;
  font-size: 24rpx;
  color: $hg-text3;
}
.enter { color: $hg-primary; font-weight: 600; }
</style>
