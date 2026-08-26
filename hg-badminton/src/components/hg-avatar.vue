<template>
  <view class="avatar" :style="{ width: size + 'rpx', height: size + 'rpx', fontSize: font + 'rpx' }">
    <image v-if="src" class="img" :src="src" mode="aspectFill" />
    <text v-else>{{ letter }}</text>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { initial } from '@/utils/format'

const props = defineProps({
  name: String,
  src: { type: String, default: '' },
  size: { type: Number, default: 72 },
  font: { type: Number, default: 28 }
})
const letter = computed(() => initial(props.name))
</script>

<style lang="scss" scoped>
.avatar {
  border-radius: 50%;
  background: $hg-primary-light;
  color: $hg-primary-deep;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
  flex-shrink: 0;
  overflow: hidden;
}
.img {
  width: 100%;
  height: 100%;
  display: block;
}
</style>
