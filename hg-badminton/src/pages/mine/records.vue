<template>
  <view class="page">
    <hg-nav :title="title" />
    <view class="pad">
      <view class="filters">
        <view class="seg">
          <view class="seg-item" :class="{ active: mode === 'year' }" @click="mode = 'year'">按年</view>
          <view class="seg-item" :class="{ active: mode === 'month' }" @click="mode = 'month'">按月</view>
        </view>
        <picker v-if="mode === 'year'" mode="date" fields="year" :value="year" @change="onYear">
          <view class="input picker">{{ year }}年</view>
        </picker>
        <picker v-else mode="date" fields="month" :value="month" @change="onMonth">
          <view class="input picker">{{ monthLabel }}</view>
        </picker>
      </view>

      <hg-loading v-if="loading && !shown.length" />
      <view v-for="item in shown" :key="item._id" class="card item" @click="open(item)">
        <view class="row top">
          <view class="title">{{ item.name }}</view>
          <hg-chip :text="chip(item).label" :type="chip(item).chip" />
        </view>
        <view class="meta">📅 {{ when(item) }}<text v-if="place(item)">　📍 {{ place(item) }}</text></view>
        <view v-if="kind === 'activity'" class="meta">{{ regText(item) }}</view>
        <view v-else-if="item.matchNo" class="meta">编号 {{ item.matchNo }}</view>
        <view class="foot"><text class="enter">查看详情 ›</text></view>
      </view>
      <hg-empty v-if="!loading && !shown.length" :text="emptyText" />
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useMatchStore } from '@/stores/match'
import { activityDisplayStatus, formatDate, formatRange, matchStatus, regStatus } from '@/utils/format'

const kind = ref('activity')
const list = ref([])
const loading = ref(false)
const mode = ref('year')
const now = new Date()
const year = ref(String(now.getFullYear()))
const month = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
const matchStore = useMatchStore()

const title = computed(() => (kind.value === 'match' ? '参加的比赛' : '参加的活动'))
const monthLabel = computed(() => {
  const [y, m] = month.value.split('-')
  return `${y}年${Number(m)}月`
})
const emptyText = computed(() => {
  const what = kind.value === 'match' ? '比赛' : '活动'
  return mode.value === 'year' ? `${year.value}年还没有参加的${what}` : `${monthLabel.value}还没有参加的${what}`
})
const shown = computed(() =>
  list.value.filter((item) => {
    const parts = beijingParts(kind.value === 'match' ? item.startDate : item.startTime)
    if (!parts) return false
    return mode.value === 'year' ? parts.year === year.value : parts.month === month.value
  })
)

function beijingParts(value) {
  const text = String(value || '').trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) || (/^\d{4}-\d{2}-\d{2}T/.test(text) && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text))) {
    return { year: text.slice(0, 4), month: text.slice(0, 7) }
  }
  const time = Date.parse(text)
  if (Number.isNaN(time)) return null
  const date = new Date(time + 8 * 3600 * 1000)
  const y = String(date.getUTCFullYear())
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return { year: y, month: `${y}-${m}` }
}

function onYear(e) {
  year.value = String(e.detail.value || '').slice(0, 4) || year.value
}

function onMonth(e) {
  month.value = String(e.detail.value || '').slice(0, 7) || month.value
}

function chip(item) {
  return kind.value === 'match' ? matchStatus(item.status) : activityDisplayStatus(item)
}

function when(item) {
  if (kind.value === 'match') return formatRange(item.startDate, item.endDate) || '时间待定'
  return formatDate(item.startTime, true) || '时间待定'
}

function place(item) {
  return item.location || ''
}

function regText(item) {
  return regStatus(item.regStatus).label
}

function open(item) {
  if (kind.value === 'match') {
    matchStore.select(item._id)
    uni.navigateTo({ url: `/pages/match/detail?id=${item._id}` })
    return
  }
  uni.navigateTo({ url: `/pages/activity/detail?id=${item._id}` })
}

async function load() {
  loading.value = true
  try {
    list.value = kind.value === 'match' ? await api.listMyMatches() : await api.listMyActivities()
  } finally {
    loading.value = false
  }
}

onLoad((query) => {
  kind.value = query?.type === 'match' ? 'match' : 'activity'
})

onShow(load)
</script>

<style lang="scss" scoped>
.filters {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 24rpx;
}
.seg {
  display: flex;
  background: #fff;
  border-radius: 20rpx;
  padding: 6rpx;
  flex-shrink: 0;
}
.seg-item {
  min-width: 96rpx;
  text-align: center;
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
  font-size: 26rpx;
  color: $hg-text2;
}
.seg-item.active {
  background: $hg-primary;
  color: #fff;
  font-weight: 600;
}
.picker {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 240rpx;
}
.item { padding: 28rpx; margin-bottom: 20rpx; }
.top { justify-content: space-between; align-items: flex-start; }
.title { font-size: 32rpx; font-weight: 700; flex: 1; padding-right: 12rpx; }
.meta { font-size: 24rpx; color: $hg-text2; line-height: 1.7; margin-top: 8rpx; }
.foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 16rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed $hg-line;
}
.enter { font-size: 24rpx; color: $hg-primary; }
</style>
