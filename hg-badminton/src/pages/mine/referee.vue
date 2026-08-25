<template>
  <view class="page">
    <hg-nav title="我执裁的场次" />
    <view class="pad">
      <hg-fixture-card v-for="f in list" :key="f._id" :item="f" @click="open(f)" />
      <hg-empty v-if="!list.length" text="暂无执裁场次" />
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
