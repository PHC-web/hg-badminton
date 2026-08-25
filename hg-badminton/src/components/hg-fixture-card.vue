<template>
  <view class="fixture-card" @click="$emit('click')">
    <view class="vs">
      <text class="team">{{ item.teamAName || '待定' }}</text>
      <text class="score">{{ score }}</text>
      <text class="team r">{{ item.teamBName || '待定' }}</text>
    </view>
    <view class="info">
      <text>{{ item.code }} · {{ item.venue }}</text>
      <text>{{ time }}</text>
      <hg-chip :text="st.label" :type="st.chip" />
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { fixtureStatus, formatDate } from '@/utils/format'

const props = defineProps({ item: Object })
defineEmits(['click'])
const st = computed(() => fixtureStatus(props.item.status))
const time = computed(() => formatDate(props.item.scheduleTime, true))
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
}
</style>
