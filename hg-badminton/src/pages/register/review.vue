<template>
  <view class="page">
    <hg-nav title="报名审核" />
    <view class="pad">
      <view v-for="t in list" :key="t._id" class="card team">
        <view class="row">
          <hg-avatar :name="t.name" />
          <view class="meta">
            <view class="n">{{ t.name }}</view>
            <view class="s">队长：{{ t.captainName }} · {{ t.members?.length || 0 }} 人</view>
          </view>
          <hg-chip :text="st(t).label" :type="st(t).chip" />
        </view>
        <view v-if="t.rejectReason" class="reason">驳回原因：{{ t.rejectReason }}</view>
        <view v-if="t.registerStatus === 'submitted'" class="row" style="gap: 16rpx; margin-top: 20rpx;">
          <button class="btn-danger" @click="reject(t)">驳回</button>
          <button class="btn-primary" @click="approve(t)">通过</button>
        </view>
      </view>
      <hg-empty v-if="!list.length" text="暂无报名" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { teamStatus, toast } from '@/utils/format'

const id = ref('')
const list = ref([])

function st(t) {
  return teamStatus(t.registerStatus)
}

async function load() {
  list.value = await api.listTeams(id.value)
}

async function approve(t) {
  await api.reviewTeam({ teamId: t._id, action: 'approve' })
  toast('已通过', 'success')
  load()
}

function reject(t) {
  uni.showModal({
    title: '驳回原因',
    editable: true,
    placeholderText: '请填写原因',
    success: async (res) => {
      if (!res.confirm) return
      await api.reviewTeam({ teamId: t._id, action: 'reject', reason: res.content })
      toast('已驳回')
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
.team {
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.meta {
  flex: 1;
  margin-left: 16rpx;
}
.n {
  font-weight: 600;
  font-size: 30rpx;
}
.s {
  font-size: 22rpx;
  color: $hg-text3;
}
.reason {
  font-size: 24rpx;
  color: #C73E44;
  margin-top: 12rpx;
}
</style>
