<template>
  <view class="match-card" @click="$emit('click')">
    <view class="top">
      <view class="left">
        <view class="mname">{{ item.name }}</view>
        <view class="meta">📅 {{ range }}　📍 {{ item.location }}</view>
        <view class="meta">👥 {{ item.teamCount || 0 }} 支队伍 · {{ item.fixtureCount || 0 }} 场 · {{ item.memberCount || 0 }} 名队员</view>
      </view>
      <hg-chip :text="st.label" :type="st.chip" />
    </view>
    <view class="foot">
      <text class="dot-line">
        <text class="dot" :class="['dot-' + (st.chip || 'gray')]"></text>
        {{ foot }}
      </text>
      <text class="enter">{{ enter }} ›</text>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { matchStatus, formatRange, daysUntil } from '@/utils/format'

const props = defineProps({ item: Object })
defineEmits(['click'])

const st = computed(() => matchStatus(props.item.status))
const range = computed(() => formatRange(props.item.startDate, props.item.endDate))
const foot = computed(() => {
  const m = props.item
  if (m.status === 'in_progress') return '比赛进行中'
  if (m.status === 'registering') {
    const d = daysUntil(m.registerDeadline)
    return d != null ? `距截止 ${d} 天` : '报名中'
  }
  if (m.status === 'finished' || m.status === 'closed') return m.championName ? `冠军：${m.championName}` : '冠军已产生'
  return st.value.label
})
const enter = computed(() => {
  if (props.item.status === 'registering') return '我要报名'
  if (props.item.status === 'finished' || props.item.status === 'closed') return '查看赛果'
  return '查看详情'
})
</script>

<style lang="scss" scoped>
.match-card {
  background: #fff;
  border-radius: 28rpx;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}
.left {
  flex: 1;
  padding-right: 12rpx;
}
.mname {
  font-size: 32rpx;
  font-weight: 700;
  margin-bottom: 10rpx;
}
.meta {
  font-size: 24rpx;
  color: $hg-text2;
  line-height: 1.7;
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx dashed $hg-line;
  font-size: 24rpx;
  color: $hg-text3;
}
.dot {
  display: inline-block;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  margin-right: 8rpx;
  background: $hg-text3;
}
.dot-green { background: $hg-primary; }
.dot-orange { background: $hg-accent; }
.dot-gray { background: $hg-text3; }
.enter {
  color: $hg-primary;
  font-weight: 600;
}
</style>
