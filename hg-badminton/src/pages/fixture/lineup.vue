<template>
  <view class="page">
    <hg-nav :title="title" />
    <view class="pad" v-if="ready">
      <view class="card head">
        <view class="h">{{ itemName }} · {{ side === 'a' ? teamAName : teamBName }}</view>
        <view class="s">需选 {{ needCount }} 人 · {{ genderHint }}</view>
        <view class="s" v-if="concurrentHint">{{ concurrentHint }}</view>
      </view>

      <view class="section-title">选择上场队员</view>
      <view
        v-for="m in roster"
        :key="m.id"
        class="row item"
        :class="{ on: selected.includes(m.id), disabled: isDisabled(m) }"
        @click="toggle(m)"
      >
        <view class="meta">
          <view class="n">{{ m.name }} · {{ m.gender === 'female' ? '女' : '男' }}</view>
          <view class="t">{{ m.job || '队员' }}{{ usedCount(m.id) > 0 ? ` · 已兼 ${usedCount(m.id)} 项` : '' }}</view>
        </view>
        <text class="mark">{{ selected.includes(m.id) ? '✓' : '' }}</text>
      </view>
      <hg-empty v-if="!roster.length" text="本队暂无有效队员" />

      <button class="btn-primary" style="margin-top: 28rpx;" :loading="saving" @click="submit">提交上场名单</button>
      <button v-if="alreadySubmitted" class="btn-ghost" style="margin-top: 16rpx;" @click="withdraw">撤回名单</button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast, confirm } from '@/utils/format'
import { itemGenderNeed, normalizeConcurrent } from '@/utils/concurrent'

const user = useUserStore()
const fixtureId = ref('')
const subId = ref('')
const side = ref('a')
const saving = ref(false)
const ready = ref(false)
const fixture = ref(null)
const match = ref(null)
const roster = ref([])
const selected = ref([])
const alreadySubmitted = ref(false)
const otherSubsUsage = ref(new Map())

const sub = computed(() => (fixture.value?.subFixtures || []).find((s) => s._id === subId.value))
const itemName = computed(() => sub.value?.itemName || '小项')
const needCount = computed(() => Number(sub.value?.memberCount) || 1)
const teamAName = computed(() => fixture.value?.teamAName || 'A队')
const teamBName = computed(() => fixture.value?.teamBName || 'B队')
const title = computed(() => `上场名单 · ${itemName.value}`)

const genderHint = computed(() => {
  const g = itemGenderNeed(itemName.value)
  if (!g.total) return '请按项目要求选择'
  return `要求：男 ${g.male} / 女 ${g.female}`
})

const concurrentHint = computed(() => {
  const c = normalizeConcurrent(match.value?.concurrent)
  if (!c.enabled) return '本场不允许兼项'
  const parts = []
  if (c.allowMale) parts.push(`男可兼：最多${c.maxMalePeople}人，每人${c.maxMaleItems}项`)
  else parts.push('男不可兼项')
  if (c.allowFemale) parts.push(`女可兼：最多${c.maxFemalePeople}人，每人${c.maxFemaleItems}项`)
  else parts.push('女不可兼项')
  return parts.join('；')
})

function usedCount(memberId) {
  return otherSubsUsage.value.get(memberId) || 0
}

function isDisabled(m) {
  if (selected.value.includes(m.id)) return false
  if (selected.value.length >= needCount.value) return true
  return false
}

function toggle(m) {
  if (isDisabled(m) && !selected.value.includes(m.id)) return
  const i = selected.value.indexOf(m.id)
  if (i >= 0) selected.value.splice(i, 1)
  else selected.value.push(m.id)
}

async function load() {
  fixture.value = await api.getFixture(fixtureId.value)
  match.value = fixture.value.match
  const s = sub.value
  if (!s) {
    toast('小项不存在')
    return
  }

  // 管理员未归属任一方时，按传入 side；队长自动校正
  if (!user.isAdmin) {
    if (fixture.value.viewerOnA) side.value = 'a'
    else if (fixture.value.viewerOnB) side.value = 'b'
    else {
      toast('仅本队队长可提交')
      return
    }
  }

  const teams = await api.listTeams(fixture.value.matchId)
  const teamId = side.value === 'a' ? fixture.value.teamAId : fixture.value.teamBId
  const team = (teams || []).find((t) => t._id === teamId)
  roster.value = (team?.members || []).filter((m) => m.status === 'active')

  alreadySubmitted.value = side.value === 'a' ? !!s.lineupASubmitted : !!s.lineupBSubmitted
  if (side.value === 'a' && s.lineupASubmitted) selected.value = [...(s.playerAIds || [])]
  if (side.value === 'b' && s.lineupBSubmitted) selected.value = [...(s.playerBIds || [])]

  // 统计其他小项已用次数（本队）
  const usage = new Map()
  ;(fixture.value.subFixtures || []).forEach((x) => {
    if (x._id === subId.value) return
    const ids = side.value === 'a' ? (x.lineupASubmitted ? x.playerAIds : []) : x.lineupBSubmitted ? x.playerBIds : []
    ;(ids || []).forEach((id) => usage.set(id, (usage.get(id) || 0) + 1))
  })
  otherSubsUsage.value = usage
  ready.value = true
}

async function submit() {
  if (selected.value.length !== needCount.value) {
    toast(`请选择 ${needCount.value} 名队员`)
    return
  }
  saving.value = true
  try {
    await api.submitSubLineup({
      subFixtureId: subId.value,
      side: side.value,
      playerIds: selected.value
    })
    toast('名单已提交', 'success')
    uni.navigateBack()
  } catch (e) {
    toast(e?.message || '提交失败')
  } finally {
    saving.value = false
  }
}

async function withdraw() {
  if (!(await confirm('确定撤回本方上场名单？'))) return
  await api.clearSubLineup({ subFixtureId: subId.value, side: side.value })
  toast('已撤回')
  selected.value = []
  alreadySubmitted.value = false
  load()
}

onLoad(async (q) => {
  fixtureId.value = q.fixtureId || ''
  subId.value = q.subId || ''
  side.value = q.side === 'b' ? 'b' : 'a'
  await load()
})
</script>

<style lang="scss" scoped>
.head { padding: 28rpx; margin-bottom: 16rpx; }
.h { font-weight: 700; font-size: 30rpx; }
.s { font-size: 22rpx; color: $hg-text3; margin-top: 8rpx; line-height: 1.5; }
.item {
  background: #fff;
  border-radius: 20rpx;
  padding: 24rpx 28rpx;
  margin-bottom: 12rpx;
  border: 3rpx solid transparent;
  box-shadow: 0 4rpx 16rpx rgba(16, 24, 40, 0.04);
}
.item.on {
  border-color: $hg-primary;
  background: $hg-primary-light;
}
.item.disabled { opacity: 0.45; }
.meta { flex: 1; }
.n { font-weight: 600; }
.t { font-size: 22rpx; color: $hg-text3; margin-top: 4rpx; }
.mark { color: $hg-primary; font-weight: 700; font-size: 32rpx; width: 40rpx; text-align: center; }
</style>
