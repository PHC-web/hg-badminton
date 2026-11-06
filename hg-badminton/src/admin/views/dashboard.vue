<template>
  <view class="dash">
    <view class="stat" v-for="s in stats" :key="s.k">
      <view class="n">{{ s.n }}</view>
      <view class="l">{{ s.l }}</view>
    </view>
  </view>
  <view class="grid">
    <view class="card" v-for="a in acts" :key="a._id">
      <view class="t">{{ a.name }}</view>
      <view class="m">{{ formatDate(a.startTime, true) }} · {{ a.location }}</view>
    </view>
    <view v-if="!acts.length" class="empty">暂无活动</view>
  </view>
  <view class="grid">
    <view class="card" v-for="m in matches" :key="m._id">
      <view class="t">{{ m.name }}</view>
      <view class="m">{{ formatDate(m.startDate) }} · {{ m.location }} · {{ m.teamCount || 0 }} 队</view>
    </view>
    <view v-if="!matches.length" class="empty">暂无比赛</view>
  </view>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { formatDate } from '@/utils/format'

const acts = ref([])
const matches = ref([])
const stats = ref([
  { k: 'a', n: 0, l: '活动' },
  { k: 'm', n: 0, l: '比赛' },
  { k: 'p', n: 0, l: '待审用户' }
])

onMounted(async () => {
  const [a, m, p] = await Promise.all([
    api.listActivities({}).catch(() => []),
    api.listMatches({}).catch(() => []),
    api.listPendingUsers().catch(() => [])
  ])
  acts.value = (a || []).slice(0, 6)
  matches.value = (m || []).slice(0, 6)
  stats.value = [
    { k: 'a', n: (a || []).length, l: '活动' },
    { k: 'm', n: (m || []).length, l: '比赛' },
    { k: 'p', n: (p || []).length, l: '待审用户' }
  ]
})
</script>

<style lang="scss" scoped>
.dash { display: flex; gap: 16px; margin-bottom: 20px; }
.stat {
  flex: 1;
  background: #fff;
  border-radius: 14px;
  padding: 18px 20px;
  box-shadow: 0 4px 16px rgba(16, 24, 40, 0.05);
}
.n { font-size: 32px; font-weight: 800; color: #006db8; }
.l { font-size: 15px; color: #4a5563; margin-top: 4px; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.card { background: #fff; border-radius: 12px; padding: 14px 16px; }
.t { font-weight: 700; font-size: 17px; color: #1a2332; }
.m { font-size: 15px; color: #4a5563; margin-top: 6px; }
.empty { color: #4a5563; font-size: 16px; padding: 12px; }
</style>
