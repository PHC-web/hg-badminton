<template>
  <view class="page">
    <hg-nav title="队员审批" />
    <view class="pad">
      <view v-for="mb in members" :key="mb.id" class="card item">
        <view class="n">{{ mb.name }} · {{ mb.gender==='female'?'女':'男' }}</view>
        <view class="s">{{ mb.phone }} · {{ mb.job || '未填岗位' }} · {{ mb.idCard || '无身份证' }}</view>
        <view class="s">状态：{{ mb.status }}</view>
        <view v-if="mb.status==='pending'" class="row" style="gap:16rpx;margin-top:16rpx;">
          <button class="btn-danger" @click="act(mb,'reject')">驳回</button>
          <button class="btn-primary" @click="act(mb,'approve')">通过</button>
        </view>
        <view v-else-if="mb.status==='cancel_pending'" class="row" style="gap:16rpx;margin-top:16rpx;">
          <button class="btn-ghost" @click="act(mb,'reject_cancel')">不同意退出</button>
          <button class="btn-danger" @click="act(mb,'approve_cancel')">同意退出</button>
        </view>
        <view v-else-if="mb.status==='active' && !mb.isCaptain" style="margin-top:16rpx;">
          <button class="btn-danger" @click="act(mb,'remove')">直接移出</button>
        </view>
      </view>
      <hg-empty v-if="!members.length" text="暂无队员" />
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { toast } from '@/utils/format'

const teamId = ref('')
const team = ref(null)
const members = computed(() => team.value?.members || [])

async function load() {
  const all = await api.listTeams(team.value?.matchId || '')
  // get by id from listTeams of match - better fetch via getMyTeam after we know match
  const matches = await api.listMatches({})
  for (const m of matches) {
    const teams = await api.listTeams(m._id)
    const t = teams.find((x) => x._id === teamId.value)
    if (t) {
      team.value = t
      break
    }
  }
}

async function act(mb, action) {
  await api.reviewTeamMember({ teamId: teamId.value, memberId: mb.id, action })
  toast('已处理', 'success')
  load()
}

onLoad((q) => { teamId.value = q.id })
onShow(() => { if (teamId.value) load() })
</script>

<style lang="scss" scoped>
.item { padding: 28rpx; margin-bottom: 16rpx; }
.n { font-weight: 600; font-size: 30rpx; }
.s { font-size: 24rpx; color: $hg-text3; margin-top: 6rpx; }
</style>
