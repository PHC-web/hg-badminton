<template>
  <view class="avatar" :style="{ width: size + 'rpx', height: size + 'rpx', fontSize: font + 'rpx' }">
    {{ letter }}
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { initial } from '@/utils/format'

const props = defineProps({
  name: String,
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
}
</style>
