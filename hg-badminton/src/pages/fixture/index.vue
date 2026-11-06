<template>
  <view class="page">
    <hg-nav :title="fromTab ? '对阵表' : '对阵表'" :back="true" />
    <view class="pad">
      <view v-if="error" class="rule-box">{{ error }}
        <button v-if="matchId" class="btn-ghost" style="margin-top:16rpx;" @click="goSpectator">申请观众</button>
      </view>
      <view v-else>
        <view class="section-title">{{ data.match?.name || '单循环对阵' }}
          <view v-if="user.isAdmin && matchId" class="more-row">
            <text class="section-more" @click="goSchedule">排期</text>
            <text class="section-more" @click="goExport">导出对阵表</text>
          </view>
        </view>
        <view v-for="r in rounds" :key="r.name" class="card gcard">
          <view class="gt">{{ r.name }}</view>
          <hg-fixture-card v-for="f in r.list" :key="f._id" :item="f" @click="open(f)" />
        </view>
        <hg-empty v-if="!rounds.length" text="暂无对阵，管理员可生成" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useMatchStore } from '@/stores/match'
import { useUserStore } from '@/stores/user'

const store = useMatchStore()
const user = useUserStore()
const matchId = ref('')
const data = ref({ match: null, fixtures: [] })
const error = ref('')
const fromTab = ref(false)

const rounds = computed(() => {
  const map = {}
  ;(data.value.fixtures || []).forEach((f) => {
    if (!map[f.round]) map[f.round] = []
    map[f.round].push(f)
  })
  return Object.keys(map).map((name) => ({ name, list: map[name] }))
})

async function load() {
  if (!user.hasSession) {
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  const id = matchId.value || store.selectedId
  if (!id) {
    error.value = '请先选择比赛'
    return
  }
  matchId.value = id
  try {
    error.value = ''
    data.value = await api.listFixtures(id)
  } catch (e) {
    error.value = e.message || '无权查看对阵'
    data.value = { match: null, fixtures: [] }
  }
}

function open(f) {
  uni.navigateTo({ url: `/pages/fixture/detail?id=${f._id}` })
}
function goExport() {
  uni.navigateTo({ url: `/pages/match/bracket-export?id=${matchId.value}` })
}
function goSchedule() {
  uni.navigateTo({ url: `/pages/match/schedule?id=${matchId.value}` })
}
function goSpectator() {
  uni.navigateTo({ url: `/pages/match/spectator?id=${matchId.value}` })
}

onLoad((q) => {
  if (q.id) matchId.value = q.id
})
onShow(load)
</script>

<style lang="scss" scoped>
.gcard { overflow: hidden; margin-bottom: 20rpx; padding-bottom: 12rpx; }
.gt { padding: 24rpx 28rpx 8rpx; font-weight: 600; font-size: 28rpx; }
.more-row { display: flex; gap: 24rpx; }
</style>
