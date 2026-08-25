<template>
  <view class="opt" :class="{ selected }" @click="$emit('click')">
    <view class="t">{{ title }}</view>
    <view v-if="desc" class="d">{{ desc }}</view>
  </view>
</template>

<script setup>
defineProps({
  title: String,
  desc: String,
  selected: Boolean
})
defineEmits(['click'])
</script>

<style lang="scss" scoped>
.opt {
  border: 3rpx solid $hg-line;
  border-radius: 24rpx;
  padding: 24rpx;
  margin-bottom: 20rpx;
  background: #fff;
}
.opt.selected {
  border-color: $hg-primary;
  background: $hg-primary-light;
}
.t {
  font-size: 28rpx;
  font-weight: 600;
}
.d {
  font-size: 24rpx;
  color: $hg-text2;
  margin-top: 6rpx;
}
</style>
