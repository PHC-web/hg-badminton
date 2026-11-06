<template>
  <view class="fixture-card" @click="$emit('click')">
    <view class="vs">
      <text class="team">{{ item.teamAName || '待定' }}</text>
      <text class="score">{{ score }}</text>
      <text class="team r">{{ item.teamBName || '待定' }}</text>
    </view>
    <view class="info">
      <text>{{ item.code || item.round }} · {{ venueText }}</text>
      <text>{{ time }}</text>
      <hg-chip :text="st.label" :type="st.chip" />
    </view>
    <view class="refs">裁判：{{ item.refereeNames || '未指派' }}</view>
    <view v-if="(item.mySubFixtures || []).length" class="mine">
      我执裁：{{ item.mySubFixtures.map((s) => s.itemName).join('、') }}
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { fixtureStatus, formatDate } from '@/utils/format'

const props = defineProps({ item: Object })
defineEmits(['click'])
const st = computed(() => fixtureStatus(props.item.status))
const venueText = computed(() => {
  const subs = props.item.subFixtures || []
  const vs = [...new Set(subs.map((s) => s.venue).filter(Boolean))]
  if (vs.length) return vs.join(' / ')
  return props.item.venue || '场地待定'
})
const time = computed(() => {
  const subT = (props.item.subFixtures || []).find((s) => s.scheduleTime)?.scheduleTime
  return formatDate(subT || props.item.scheduleTime, true) || '时间待排'
})
const score = computed(() => {
  const r = props.item.result
  if (r && (r.teamAScore || r.teamBScore) && ['finished', 'confirmed', 'live'].includes(props.item.status)) {
    return `${r.teamAScore} : ${r.teamBScore}`
  }
  if (props.item.status === 'finished' || props.item.status === 'confirmed') {
    return `${r?.teamAScore ?? 0} : ${r?.teamBScore ?? 0}`
  }
  return '—'
})
</script>

<style lang="scss" scoped>
.fixture-card {
  background: #fff;
  border-radius: 24rpx;
  padding: 24rpx;
  margin-bottom: 16rpx;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
}
.vs {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.team {
  font-size: 28rpx;
  font-weight: 600;
  flex: 1;
}
.team.r {
  text-align: right;
}
.score {
  font-size: 40rpx;
  font-weight: 700;
  color: $hg-primary;
  padding: 0 20rpx;
}
.info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 16rpx;
  gap: 8rpx;
}
.refs {
  margin-top: 10rpx;
  font-size: 22rpx;
  color: $hg-text2;
}
.mine {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: $hg-primary;
  font-weight: 600;
}
</style>
