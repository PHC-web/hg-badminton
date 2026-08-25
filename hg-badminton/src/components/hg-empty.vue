<template>
  <view class="empty">
    <text class="ic">{{ icon }}</text>
    <text class="t">{{ text }}</text>
  </view>
</template>

<script setup>
defineProps({
  text: { type: String, default: '暂无数据' },
  icon: { type: String, default: '🏸' }
})
</script>

<style lang="scss" scoped>
.empty {
  padding: 80rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  color: $hg-text3;
}
.ic {
  font-size: 64rpx;
  margin-bottom: 16rpx;
}
.t {
  font-size: 26rpx;
}
</style>
