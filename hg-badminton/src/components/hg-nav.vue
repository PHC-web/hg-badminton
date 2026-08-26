<template>
  <view class="nav" :class="{ dark }" :style="{ paddingTop: bar + 'px' }">
    <view class="inner">
      <view v-if="back" class="side left" @click="goBack">‹</view>
      <view v-else class="side left"></view>
      <text class="title">{{ title }}</text>
      <view class="side right" @click="$emit('right')">
        <slot name="right"></slot>
      </view>
    </view>
  </view>
  <view :style="{ height: bar + 44 + 'px' }"></view>
</template>

<script setup>
import { ref } from 'vue'

defineProps({
  title: { type: String, default: '' },
  back: { type: Boolean, default: true },
  dark: { type: Boolean, default: false }
})
defineEmits(['right'])

const sys = uni.getSystemInfoSync()
const bar = ref(sys.statusBarHeight || 0)

function goBack() {
  const pages = getCurrentPages()
  if (pages.length > 1) uni.navigateBack()
  else uni.switchTab({ url: '/pages/activity/index' })
}
</script>

<style lang="scss" scoped>
.nav {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  z-index: 20;
  background: #fff;
}
.nav.dark {
  background: $hg-hero-gradient;
  color: #fff;
}
.inner {
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.title {
  font-size: 34rpx;
  font-weight: 600;
}
.side {
  position: absolute;
  top: 0;
  height: 44px;
  min-width: 80rpx;
  display: flex;
  align-items: center;
  padding: 0 16rpx;
  font-size: 26rpx;
}
.left {
  left: 8rpx;
  font-size: 44rpx;
  color: $hg-text;
}
.dark .left,
.dark .title,
.dark .right {
  color: #fff;
}
.right {
  right: 12rpx;
  color: $hg-primary;
  font-weight: 500;
}
</style>
