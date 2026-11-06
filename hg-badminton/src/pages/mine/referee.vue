<template>
  <view class="page">
    <hg-nav title="我执裁的场次" />
    <view class="pad">
      <view class="rule-box" style="margin-bottom: 16rpx;">
        以下为已分配给您的团体赛。卡片中会标注您负责的小项（男单/女双等）。
      </view>
      <hg-fixture-card v-for="f in list" :key="f._id" :item="f" @click="open(f)" />
      <hg-empty v-if="!list.length" text="暂无执裁场次，等待管理员分配" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'

const list = ref([])
async function load() {
  list.value = await api.myRefereeFixtures()
}
function open(f) {
  uni.navigateTo({ url: `/pages/fixture/detail?id=${f._id}` })
}
onShow(load)
</script>
