<template>
  <view class="page">
    <hg-nav title="角色审核" />
    <view class="pad">
      <view v-for="a in list" :key="a._id" class="card item">
        <view class="row">
          <view class="meta">
            <view class="n">{{ a.name }} · {{ label(a.applyRole) }}</view>
            <view class="s">{{ a.phone }} · {{ a.extra }}</view>
          </view>
          <hg-chip :text="st(a).label" :type="st(a).chip" />
        </view>
        <view v-if="a.status === 'pending'" class="row" style="gap: 16rpx; margin-top: 20rpx;">
          <button class="btn-danger" @click="act(a, 'reject')">驳回</button>
          <button class="btn-primary" @click="act(a, 'approve')">通过</button>
        </view>
        <view v-if="a.rejectReason" class="reason">原因：{{ a.rejectReason }}</view>
      </view>
      <hg-empty v-if="!list.length" text="暂无申请" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { roleLabel, applyStatus, toast } from '@/utils/format'

const list = ref([])
function label(k) {
  return roleLabel(k)
}
function st(a) {
  return applyStatus(a.status)
}
async function load() {
  list.value = await api.listApplications()
}
async function act(a, action) {
  if (action === 'reject') {
    uni.showModal({
      title: '驳回原因',
      editable: true,
      success: async (res) => {
        if (!res.confirm) return
        await api.reviewApplication({ id: a._id, action, reason: res.content })
        toast('已驳回')
        load()
      }
    })
    return
  }
  await api.reviewApplication({ id: a._id, action })
  toast('已通过', 'success')
  load()
}
onShow(load)
</script>

<style lang="scss" scoped>
.item {
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.meta {
  flex: 1;
}
.n {
  font-weight: 600;
  font-size: 30rpx;
}
.s {
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 6rpx;
}
.reason {
  font-size: 24rpx;
  color: #C73E44;
  margin-top: 12rpx;
}
</style>
