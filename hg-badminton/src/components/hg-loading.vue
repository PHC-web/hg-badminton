<template>
  <view class="loading-box">
    <view class="spinner" />
    <text class="loading-text">{{ text }}</text>
  </view>
</template>

<script setup>
defineProps({
  text: { type: String, default: '加载中…' }
})
</script>

<style lang="scss" scoped>
.loading-box {
  padding: 80rpx 40rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.spinner {
  width: 48rpx;
  height: 48rpx;
  border: 4rpx solid $hg-primary-line;
  border-top-color: $hg-primary;
  border-radius: 50%;
  animation: hg-spin 0.8s linear infinite;
}
.loading-text {
  margin-top: 20rpx;
  font-size: 26rpx;
  color: $hg-text3;
}
@keyframes hg-spin {
  to { transform: rotate(360deg); }
}
</style>
