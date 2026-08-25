<template>
  <view class="sw" :class="{ on }" @click="$emit('toggle')"></view>
</template>

<script setup>
defineProps({ on: Boolean })
defineEmits(['toggle'])
</script>

<style lang="scss" scoped>
.sw {
  width: 88rpx;
  height: 52rpx;
  border-radius: 26rpx;
  background: #E6E8EB;
  position: relative;
  flex-shrink: 0;
}
.sw.on {
  background: $hg-primary;
}
.sw::after {
  content: '';
  position: absolute;
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: #fff;
  top: 4rpx;
  left: 4rpx;
  box-shadow: 0 2rpx 6rpx rgba(0, 0, 0, 0.2);
}
.sw.on::after {
  left: 40rpx;
}
</style>
