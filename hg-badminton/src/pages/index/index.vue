<template>
  <view class="page">
    <view class="hero" :style="{ paddingTop: bar + 12 + 'px' }">
      <view class="hero-top">
        <view>
          <view class="greet">你好，{{ greet }}</view>
          <view class="name">{{ headline }}</view>
        </view>
        <view class="hero-avatar" @click="goMine">{{ avatar }}</view>
      </view>
      <view class="hero-search">
        <input
          class="search-input"
          v-model="keyword"
          placeholder="搜索比赛名称 / 地点"
          placeholder-class="ph"
          confirm-type="search"
          @confirm="load"
        />
      </view>
    </view>
    <view class="stat-cards">
      <view class="stat-card" @click="filter('live')">
        <view class="num">{{ stats.live }}</view>
        <view class="lbl">进行中</view>
      </view>
      <view class="stat-card" @click="filter('upcoming')">
        <view class="num">{{ stats.upcoming }}</view>
        <view class="lbl">未开始</view>
      </view>
      <view class="stat-card" @click="filter('finished')">
        <view class="num">{{ stats.finished }}</view>
        <view class="lbl">已结束</view>
      </view>
      <view class="stat-card" @click="filter('mine')">
        <view class="num">{{ stats.mine }}</view>
        <view class="lbl">我的比赛</view>
      </view>
    </view>
    <view class="pad">
      <view class="section-title">
        <text>比赛列表</text>
        <text class="section-more" @click="filter('all')">{{ filterLabel }} ›</text>
      </view>
      <hg-match-card v-for="m in list" :key="m._id" :item="m" @click="open(m)" />
      <hg-empty v-if="!list.length" text="暂无比赛，管理员可创建一场" />
      <view v-if="user.isAdmin" style="margin-top: 12rpx;">
        <button class="btn-primary" @click="goCreate">＋ 创建比赛</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { useMatchStore } from '@/stores/match'
import { api } from '@/api'
import { openMatch } from '@/utils/nav'
import { initial } from '@/utils/format'

const user = useUserStore()
const store = useMatchStore()
const sys = uni.getSystemInfoSync()
const bar = sys.statusBarHeight || 0
const keyword = ref('')
const mode = ref('all')
const list = ref([])
const stats = computed(() => store.stats)
const greet = computed(() => user.profile?.nickname || '球友')
const avatar = computed(() => initial(user.profile?.nickname || '追'))
const headline = computed(() => {
  if (stats.value.live) return `今日有 ${stats.value.live} 场比赛进行中`
  if (stats.value.upcoming) return '有新比赛正在报名'
  return '欢迎来到追光羽毛球'
})
const filterLabel = computed(() => {
  return { all: '全部', live: '进行中', upcoming: '未开始', finished: '已结束', mine: '我的比赛' }[mode.value]
})

async function load() {
  if (!user.loggedIn) {
    uni.redirectTo({ url: '/pages/login/index' })
    return
  }
  const params = { keyword: keyword.value }
  if (mode.value === 'mine') params.mine = true
  else if (mode.value !== 'all') params.status = mode.value
  list.value = await api.listMatches(params)
  store.stats = await api.stats()
  store.list = await api.listMatches({})
  if (!store.selectedId && store.list.length) {
    const prefer = store.list.find((m) => m.status === 'in_progress') || store.list[0]
    store.select(prefer._id)
  }
}

function filter(m) {
  mode.value = m
  load()
}

function open(m) {
  store.select(m._id)
  if (m.status === 'finished' || m.status === 'closed') {
    uni.switchTab({ url: '/pages/result/index' })
    return
  }
  openMatch(m._id)
}

function goMine() {
  uni.switchTab({ url: '/pages/mine/index' })
}
function goCreate() {
  uni.navigateTo({ url: '/pages/match/create' })
}

onShow(load)
</script>

<style lang="scss" scoped>
.hero {
  background: linear-gradient(135deg, #00B87A 0%, #00875C 60%, #006B48 100%);
  border-radius: 0 0 40rpx 40rpx;
  padding: 28rpx 28rpx 88rpx;
  color: #fff;
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
  font-size: 36rpx;
  font-weight: 700;
  margin-top: 4rpx;
}
.hero-avatar {
  width: 76rpx;
  height: 76rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32rpx;
}
.hero-search {
  margin-top: 28rpx;
  background: rgba(255, 255, 255, 0.18);
  border-radius: 20rpx;
  height: 76rpx;
  display: flex;
  align-items: center;
  padding: 0 24rpx;
}
.search-input {
  flex: 1;
  color: #fff;
  font-size: 26rpx;
  height: 76rpx;
}
.ph {
  color: rgba(255, 255, 255, 0.75);
}
.stat-cards {
  margin: -60rpx 28rpx 0;
  display: flex;
  gap: 16rpx;
}
.stat-card {
  flex: 1;
  background: #fff;
  border-radius: 28rpx;
  padding: 24rpx 8rpx;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
  text-align: center;
}
.num {
  font-size: 40rpx;
  font-weight: 700;
  color: $hg-primary;
}
.lbl {
  font-size: 22rpx;
  color: $hg-text2;
  margin-top: 4rpx;
}
</style>
