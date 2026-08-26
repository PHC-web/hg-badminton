<template>
  <view class="page">
    <hg-nav title="消息通知" />
    <view class="pad">
      <view v-for="n in list" :key="n._id" class="card item">
        <view class="n">{{ n.title }}</view>
        <view class="s">{{ n.content }}</view>
        <view class="t">{{ n.createdAt?.slice(0, 16).replace('T', ' ') }}</view>
      </view>
      <hg-empty v-if="!list.length" text="暂无通知（候补补位会推送到这里）" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'

const list = ref([])
onShow(async () => {
  list.value = await api.listNotifications()
})
</script>

<style lang="scss" scoped>
.item { padding: 28rpx; margin-bottom: 16rpx; }
.n { font-weight: 600; font-size: 30rpx; }
.s { font-size: 26rpx; color: $hg-text2; margin-top: 8rpx; line-height: 1.5; }
.t { font-size: 22rpx; color: $hg-text3; margin-top: 10rpx; }
</style>
