<template>
  <view class="page">
    <hg-nav title="观众审核" />
    <view class="pad">
      <view v-for="s in list" :key="s._id" class="card item">
        <view class="n">{{ s.userName }} · {{ s.phone }}</view>
        <view class="s">{{ s.reason || '无说明' }}</view>
        <hg-chip :text="s.status" :type="s.status==='approved'?'green':s.status==='pending'?'orange':'red'" />
        <view v-if="s.status==='pending'" class="row" style="gap:16rpx;margin-top:16rpx;">
          <button class="btn-danger" @click="act(s,'reject')">驳回</button>
          <button class="btn-primary" @click="act(s,'approve')">通过</button>
        </view>
      </view>
      <hg-empty v-if="!list.length" text="暂无申请" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { toast } from '@/utils/format'

const id = ref('')
const list = ref([])
async function load() {
  list.value = await api.listSpectators({ matchId: id.value })
}
async function act(s, action) {
  await api.reviewSpectator({ id: s._id, action })
  toast('已处理', 'success')
  load()
}
onLoad((q) => { id.value = q.id })
onShow(() => { if (id.value) load() })
</script>

<style lang="scss" scoped>
.item { padding: 28rpx; margin-bottom: 16rpx; }
.n { font-weight: 600; }
.s { font-size: 24rpx; color: $hg-text3; margin: 8rpx 0; }
</style>
