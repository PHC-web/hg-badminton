<template>
  <view class="page">
    <hg-nav title="申请观众" />
    <view class="pad">
      <view class="rule-box">非本场裁判、队长或队员需申请观众权限，管理员审批通过后可查看对阵与赛果。超级管理员/管理员无需申请即可查看。</view>
      <view class="field">
        <text class="field-label">申请说明</text>
        <textarea class="textarea" v-model="reason" placeholder="如：想观摩学习赛制" />
      </view>
      <button class="btn-primary" @click="submit">提交申请</button>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { toast } from '@/utils/format'

const id = ref('')
const reason = ref('')
onLoad((q) => { id.value = q.id })

async function submit() {
  await api.applySpectator({ matchId: id.value, reason: reason.value })
  toast('已提交', 'success')
  setTimeout(() => uni.navigateBack(), 400)
}
</script>
