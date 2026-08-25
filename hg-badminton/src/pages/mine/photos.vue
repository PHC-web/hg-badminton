<template>
  <view class="page">
    <hg-nav title="我的照片" />
    <view class="photo-grid">
      <view v-for="p in list" :key="p._id" class="ph" @click="preview(p)">
        <image v-if="p.url" class="img" :src="p.url" mode="aspectFill" />
        <view v-else class="bg" :style="{ background: p.color }">🏸</view>
        <view class="tag">{{ p.caption }}</view>
      </view>
    </view>
    <hg-empty v-if="!list.length" text="还没有上传照片" />
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'

const user = useUserStore()
const list = ref([])
async function load() {
  list.value = await api.listPhotos({ uploaderId: user.profile?._id })
}
function preview(p) {
  const urls = list.value.filter((x) => x.url).map((x) => x.url)
  if (p.url && urls.length) uni.previewImage({ current: p.url, urls })
}
onShow(load)
</script>

<style lang="scss" scoped>
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8rpx;
  padding: 20rpx 28rpx;
}
.ph {
  aspect-ratio: 1;
  border-radius: 12rpx;
  overflow: hidden;
  position: relative;
}
.bg, .img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 60rpx;
}
.tag {
  position: absolute;
  left: 8rpx;
  bottom: 8rpx;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 18rpx;
  border-radius: 8rpx;
  padding: 2rpx 10rpx;
}
</style>
