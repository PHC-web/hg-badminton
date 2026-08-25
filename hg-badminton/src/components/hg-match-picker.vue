<template>
  <view>
    <view class="card picker" @click="open = !open">
      <view>
        <view class="k">当前比赛</view>
        <view class="n">{{ currentName }}</view>
      </view>
      <text class="sw">切换 ›</text>
    </view>
    <view v-if="open" class="card list">
      <view
        v-for="m in list"
        :key="m._id"
        class="item"
        @click="pick(m)"
      >
        <hg-chip :text="label(m)" :type="chip(m)" />
        <text class="mn">{{ m.name }}</text>
      </view>
      <view v-if="!list.length" class="item"><text class="mn">暂无比赛</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useMatchStore } from '@/stores/match'
import { matchStatus } from '@/utils/format'

const props = defineProps({ prefer: { type: String, default: 'live' } })
const emit = defineEmits(['change'])
const store = useMatchStore()
const open = ref(false)
const list = computed(() => store.list)
const currentName = computed(() => list.value.find((m) => m._id === store.selectedId)?.name || '请选择比赛')

function label(m) {
  return matchStatus(m.status).label
}
function chip(m) {
  return matchStatus(m.status).chip
}
function pick(m) {
  store.select(m._id)
  open.value = false
  emit('change', m._id)
}
</script>

<style lang="scss" scoped>
.picker {
  padding: 28rpx;
  margin-bottom: 20rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.k {
  font-size: 22rpx;
  color: $hg-text3;
  margin-bottom: 4rpx;
}
.n {
  font-size: 30rpx;
  font-weight: 700;
}
.sw {
  font-size: 24rpx;
  color: $hg-primary;
}
.list {
  padding: 8rpx 0;
  margin-bottom: 20rpx;
}
.item {
  padding: 20rpx 28rpx;
  border-bottom: 1rpx solid #F7F8FA;
  display: flex;
  align-items: center;
  font-size: 26rpx;
}
.mn {
  margin-left: 16rpx;
}
</style>
