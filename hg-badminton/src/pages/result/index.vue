<template>
  <view class="page">
    <hg-nav title="赛果" :back="false" />
    <view class="pad">
      <hg-match-picker prefer="finished" @change="load" />
      <view v-if="data.match">
        <view class="champion" v-if="champion">
          <view class="t1">🥇 {{ data.match.name }} · 冠军</view>
          <view class="t2">{{ champion.name }}</view>
          <view class="t3">{{ champHint }}</view>
        </view>
        <view class="section-title">
          团体赛积分榜
          <text class="section-more" @click="toastRule">排名规则 ›</text>
        </view>
        <view class="card" style="overflow: hidden;">
          <view v-for="(r, i) in data.rank" :key="r.teamId" class="rank-row">
            <view class="rk" :class="{ g: i < 2, s: i === 2 || i === 3 }">{{ i + 1 }}</view>
            <view class="nm">{{ r.name }}</view>
            <view class="wl">胜 {{ r.win }} 负 {{ r.lose }}</view>
            <view class="pts">{{ r.points }}</view>
          </view>
          <hg-empty v-if="!(data.rank || []).length" text="暂无积分数据" />
        </view>
        <view v-for="g in data.groups" :key="g._id">
          <view class="section-title">{{ g.groupName }} 组积分</view>
          <view class="card" style="overflow: hidden;">
            <view v-for="(r, i) in g.rank" :key="r.teamId" class="rank-row">
              <view class="rk">{{ i + 1 }}</view>
              <view class="nm">{{ r.name }}</view>
              <view class="pts">{{ r.points }}</view>
            </view>
          </view>
        </view>
        <view class="section-title">最新赛果</view>
        <hg-fixture-card v-for="f in data.latest" :key="f._id" :item="f" @click="open(f)" />
        <hg-empty v-if="!(data.latest || []).length" text="暂无完赛记录" />
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
import { toast } from '@/utils/format'

const store = useMatchStore()
const user = useUserStore()
const data = ref({ match: null, rank: [], groups: [], latest: [] })
const champion = computed(() => {
  if (data.value.rank?.[0]) return data.value.rank[0]
  if (data.value.match?.championName) return { name: data.value.match.championName }
  return null
})
const champHint = computed(() => {
  const f = (data.value.latest || []).find((x) => x.round === '决赛')
  if (f) return `团体决赛 ${f.result?.teamAScore} : ${f.result?.teamBScore}`
  return '按胜场积分排名'
})

async function load() {
  if (!user.loggedIn) {
    uni.navigateTo({ url: '/pages/login/index' })
    return
  }
  await store.refreshList()
  if (!store.selectedId) return
  data.value = await api.getResults(store.selectedId)
}

function open(f) {
  uni.navigateTo({ url: `/pages/fixture/detail?id=${f._id}` })
}
function toastRule() {
  toast('循环赛：胜 2 分 / 负 1 分；同分按净胜局')
}

onShow(load)
</script>

<style lang="scss" scoped>
.champion {
  background: linear-gradient(135deg, #FFC53D, #F79B2A);
  border-radius: 32rpx;
  padding: 32rpx;
  color: #7A4B00;
}
.t1 {
  font-size: 24rpx;
  opacity: 0.8;
}
.t2 {
  font-size: 48rpx;
  font-weight: 800;
  margin-top: 8rpx;
}
.t3 {
  font-size: 24rpx;
  margin-top: 8rpx;
  opacity: 0.85;
}
.rank-row {
  display: flex;
  align-items: center;
  padding: 22rpx 24rpx;
  border-bottom: 1rpx solid #F7F8FA;
  font-size: 26rpx;
}
.rk {
  width: 48rpx;
  text-align: center;
  font-weight: 700;
  color: $hg-text3;
}
.rk.g {
  color: #F79B2A;
}
.rk.s {
  color: $hg-text3;
}
.nm {
  flex: 1;
  font-weight: 600;
}
.wl {
  font-size: 24rpx;
  color: $hg-text3;
  margin-right: 24rpx;
}
.pts {
  color: $hg-primary;
  font-weight: 700;
}
</style>
