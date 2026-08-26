<template>
  <view class="page">
    <hg-nav title="赛果" :back="false" />
    <view class="pad">
      <hg-match-picker @change="load" />
      <view v-if="error" class="rule-box">{{ error }}
        <button v-if="store.selectedId" class="btn-ghost" style="margin-top:16rpx;" @click="goSpectator">申请观众</button>
      </view>
      <view v-else-if="data.match">
        <view class="champion" v-if="champion">
          <view class="t1">🥇 {{ data.match.name }} · 积分榜首位</view>
          <view class="t2">{{ champion.name }}</view>
          <view class="t3">胜 {{ champion.win }} 负 {{ champion.lose }} · {{ champion.points }} 分</view>
        </view>
        <view class="section-title">积分榜</view>
        <view class="card" style="overflow:hidden;">
          <view v-for="(r, i) in data.rank" :key="r.teamId" class="rank-row">
            <view class="rk" :class="{ g: i < 2 }">{{ i + 1 }}</view>
            <view class="nm">{{ r.name }}</view>
            <view class="wl">胜 {{ r.win }} 负 {{ r.lose }}</view>
            <view class="pts">{{ r.points }}</view>
          </view>
          <hg-empty v-if="!(data.rank||[]).length" text="暂无积分（生成对阵并完赛后显示）" />
        </view>
        <view class="section-title">最新赛果</view>
        <hg-fixture-card v-for="f in data.latest" :key="f._id" :item="f" @click="open(f)" />
        <hg-empty v-if="!(data.latest||[]).length" text="暂无完赛记录" />
      </view>
      <hg-empty v-else text="请先选择一场比赛" />
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useMatchStore } from '@/stores/match'
import { useUserStore } from '@/stores/user'

const store = useMatchStore()
const user = useUserStore()
const data = ref({ match: null, rank: [], latest: [] })
const error = ref('')
const champion = computed(() => data.value.rank?.[0] || null)

async function load() {
  if (!user.hasSession) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  await store.refreshList()
  if (!store.selectedId) return
  try {
    error.value = ''
    data.value = await api.getResults(store.selectedId)
  } catch (e) {
    error.value = e.message || '无权查看'
    data.value = { match: null, rank: [], latest: [] }
  }
}

function open(f) {
  uni.navigateTo({ url: `/pages/fixture/detail?id=${f._id}` })
}
function goSpectator() {
  uni.navigateTo({ url: `/pages/match/spectator?id=${store.selectedId}` })
}

onShow(load)
</script>

<style lang="scss" scoped>
.champion {
  background: $hg-champion-gradient;
  border-radius: 32rpx;
  padding: 32rpx;
  color: $hg-champion-deep;
}
.t1 { font-size: 24rpx; opacity: 0.8; }
.t2 { font-size: 48rpx; font-weight: 800; margin-top: 8rpx; }
.t3 { font-size: 24rpx; margin-top: 8rpx; opacity: 0.85; }
.rank-row {
  display: flex;
  align-items: center;
  padding: 22rpx 24rpx;
  border-bottom: 1rpx solid #F7F8FA;
  font-size: 26rpx;
}
.rk { width: 48rpx; text-align: center; font-weight: 700; color: $hg-text3; }
.rk.g { color: $hg-accent; }
.nm { flex: 1; font-weight: 600; }
.wl { font-size: 24rpx; color: $hg-text3; margin-right: 24rpx; }
.pts { color: $hg-primary; font-weight: 700; }
</style>
