<template>
  <view class="page">
    <hg-nav title="比赛照片">
      <template #right><text>{{ list.length }} 张</text></template>
    </hg-nav>
    <view class="sub">🏸 {{ title }} · 全场回顾（全员可上传）</view>
    <view class="photo-grid">
      <view v-for="p in list" :key="p._id" class="ph" @click="preview(p)">
        <image v-if="p.url" class="img" :src="p.url" mode="aspectFill" />
        <view v-else class="bg" :style="{ background: p.color }">🏸</view>
        <view class="tag">{{ p.caption }}</view>
        <view v-if="p.isFeatured" class="star">★</view>
      </view>
      <view class="upload-box" @click="upload">
        <text class="plus">＋</text>
        <text>上传照片</text>
      </view>
    </view>
    <view class="footnote">上传即代表您同意照片用于比赛公开展示 · 管理员可删除不当内容</view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast, confirm } from '@/utils/format'

const user = useUserStore()
const id = ref('')
const title = ref('')
const list = ref([])

async function load() {
  const m = await api.getMatch(id.value)
  title.value = m.name
  list.value = await api.listPhotos({ matchId: id.value })
}

function preview(p) {
  const urls = list.value.filter((x) => x.url).map((x) => x.url)
  if (p.url && urls.length) {
    uni.previewImage({ current: p.url, urls })
  }
  if (user.isAdmin) {
    uni.showActionSheet({
      itemList: [p.isFeatured ? '取消置顶' : '置顶精彩', '删除照片'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          await api.featurePhoto(p._id)
          load()
        } else if (await confirm('确定删除该照片？')) {
          await api.deletePhoto(p._id)
          load()
        }
      }
    })
  }
}

function upload() {
  uni.chooseImage({
    count: 9,
    sizeType: ['compressed'],
    success: async (res) => {
      for (const path of res.tempFilePaths) {
        await api.addPhoto({
          matchId: id.value,
          url: path,
          caption: '比赛瞬间',
          color: ['#2B9FE0', '#E8913A', '#7FB5FF', '#1AAE8F'][Math.floor(Math.random() * 4)]
        })
      }
      toast('上传成功', 'success')
      load()
    }
  })
}

onLoad((q) => {
  id.value = q.id
  load()
})
</script>

<style lang="scss" scoped>
.sub {
  padding: 24rpx 28rpx 0;
  font-size: 26rpx;
  color: $hg-text2;
}
.photo-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8rpx;
  padding: 20rpx 28rpx;
}
.ph, .upload-box {
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
.star {
  position: absolute;
  right: 8rpx;
  top: 8rpx;
  color: $hg-yellow;
  font-size: 28rpx;
}
.upload-box {
  border: 3rpx dashed $hg-primary-line;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: $hg-primary;
  font-size: 22rpx;
  gap: 8rpx;
}
.plus {
  font-size: 52rpx;
}
.footnote {
  font-size: 22rpx;
  color: $hg-text3;
  text-align: center;
  padding: 16rpx 28rpx 40rpx;
}
</style>
