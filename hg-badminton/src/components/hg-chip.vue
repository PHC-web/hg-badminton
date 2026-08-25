<template>
  <text class="chip" :class="'chip-' + (type || 'gray')">{{ text }}</text>
</template>

<script setup>
defineProps({
  text: String,
  type: { type: String, default: 'gray' }
})
</script>

<style lang="scss" scoped>
.chip {
  display: inline-block;
  padding: 4rpx 16rpx;
  border-radius: 40rpx;
  font-size: 22rpx;
  background: #F0F1F3;
  color: $hg-text2;
  line-height: 1.4;
}
.chip-green {
  background: $hg-primary-light;
  color: $hg-primary-deep;
}
.chip-orange {
  background: $hg-accent-light;
  color: #D75A1A;
}
.chip-red {
  background: #FDECEC;
  color: #C73E44;
}
.chip-gray {
  background: #F0F1F3;
  color: $hg-text3;
}
</style>
