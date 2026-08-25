<template>
  <view class="page">
    <hg-nav title="我的比赛" />
    <view class="pad">
      <hg-match-card v-for="m in list" :key="m._id" :item="m" @click="open(m)" />
      <hg-empty v-if="!list.length" text="还没有报名或执裁的比赛" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { openMatch } from '@/utils/nav'

const list = ref([])
async function load() {
  list.value = await api.listMatches({ mine: true })
}
function open(m) {
  openMatch(m._id)
}
onShow(load)
</script>
