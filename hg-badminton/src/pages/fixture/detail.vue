<template>
  <view class="page">
    <hg-nav title="团体对阵详情">
      <template #right>
        <text v-if="canScoreAny" @click="goLive">⚡记分</text>
      </template>
    </hg-nav>
    <view v-if="f" class="card head">
      <view class="vs">
        <view class="side">
          <hg-avatar :name="f.teamAName" :size="88" :font="36" />
          <view class="tn">{{ f.teamAName }}</view>
        </view>
        <view class="mid">
          <view class="sc">{{ f.result?.teamAScore ?? 0 }} : {{ f.result?.teamBScore ?? 0 }}</view>
          <view class="st">{{ f.round }} · {{ status }}</view>
        </view>
        <view class="side">
          <hg-avatar :name="f.teamBName" :size="88" :font="36" />
          <view class="tn">{{ f.teamBName }}</view>
        </view>
      </view>
      <view class="meta">
        <text>{{ f.code || f.round }} · 场地 {{ venueText }}</text>
        <text>{{ time }}<text v-if="user.isAdmin" class="go-sch" @click="goSchedule"> · 排期</text></text>
      </view>
      <view class="meta2">裁判汇总：{{ f.refereeNames || '各小项待指派' }}</view>
    </view>

    <view class="section-title" style="padding: 0 28rpx;">
      单项场次（共 {{ (f?.subFixtures || []).length }} 项）
      <text style="font-size: 22rpx; color: #9AA1A9; font-weight: 400;">{{ ruleHint }}</text>
    </view>
    <view class="pad" style="padding-top: 0;">
      <view class="rule-box" v-if="user.isAdmin || f.viewerOnA || f.viewerOnB" style="margin-bottom: 16rpx;">
        每小项需双方队长提交上场名单；双方都提交后，裁判/双方/观众/管理员才可看到完整名单。
      </view>
      <view
        v-for="s in f?.subFixtures || []"
        :key="s._id"
        class="item-slot"
        :class="{ live: s.status === 'live', mine: isMySub(s) }"
      >
        <view class="left" @click="onSubTap(s)">
          <view class="n">
            {{ s.code ? s.code + ' · ' : '' }}{{ s.itemName }}
            <hg-chip v-if="s.lineupBothReady" text="名单已齐" type="green" />
            <hg-chip v-else-if="s.status === 'live'" text="进行中" type="orange" />
            <hg-chip v-else-if="s.status === 'finished' || s.status === 'confirmed'" text="已结束" type="green" />
          </view>
          <view class="s">场地 {{ s.venue || '未分配' }} · {{ formatDate(s.scheduleTime || f.scheduleTime, true) || '未设时间' }}</view>
          <view class="s">裁判 {{ s.refereeNames || '未指派' }}</view>
          <view class="lineup">
            <text>{{ f.teamAName }}：{{ s.playerAText }}</text>
            <text>{{ f.teamBName }}：{{ s.playerBText }}</text>
          </view>
        </view>
        <view class="right">
          <text v-if="s.winner || s.setText" class="score" :class="{ win: s.winner === 'a' }">
            {{ setScore(s) }}
          </text>
          <text class="sets">{{ s.setText }}</text>
          <text v-if="s.canSubmitA" class="go" @click.stop="goLineup(s, 'a')">{{ user.isAdmin ? 'A名单 ›' : '交名单 ›' }}</text>
          <text v-if="s.canSubmitB" class="go" @click.stop="goLineup(s, 'b')">{{ user.isAdmin ? 'B名单 ›' : '交名单 ›' }}</text>
          <text v-if="!s.canSubmitA && !s.canSubmitB" class="go" @click.stop="onSubTap(s)">{{ subActionLabel(s) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { fixtureStatus, formatDate, toast } from '@/utils/format'
import { teamRuleLabel } from '@/utils/match-format'

const user = useUserStore()
const id = ref('')
const f = ref(null)
const status = computed(() => fixtureStatus(f.value?.status).label)
const venueText = computed(() => {
  const subs = f.value?.subFixtures || []
  const vs = [...new Set(subs.map((s) => s.venue).filter(Boolean))]
  if (vs.length) return vs.join(' / ')
  return f.value?.venue || '待定'
})
const time = computed(() => {
  const subT = (f.value?.subFixtures || []).find((s) => s.scheduleTime)?.scheduleTime
  return formatDate(subT || f.value?.scheduleTime, true) || '时间待排'
})
const ruleHint = computed(() => {
  const match = f.value?.match
  if (!match) return ''
  const n = (match.items || f.value?.subFixtures || []).length
  return teamRuleLabel(match.teamRule, n)
})

function isMySub(s) {
  const uid = user.profile?._id
  if (!uid) return false
  if ((f.value?.match?.refereeIds || []).includes(uid)) return true
  return (s.refereeIds || []).includes(uid) || (f.value?.refereeIds || []).includes(uid)
}

function canScoreSub(s) {
  if (!f.value) return false
  if (user.isAdmin) return true
  return isMySub(s)
}

const canScoreAny = computed(() => (f.value?.subFixtures || []).some((s) => canScoreSub(s)))

function setScore(s) {
  const a = (s.sets || []).filter((x) => x.winner === 'a').length
  const b = (s.sets || []).filter((x) => x.winner === 'b').length
  return `${a}:${b}`
}

function subActionLabel(s) {
  if (user.isAdmin) return '管理 ›'
  if (canScoreSub(s) && s.lineupBothReady) return '去记分 ›'
  if (canScoreSub(s) && !s.lineupBothReady) return '待名单 ›'
  return '查看 ›'
}

async function load() {
  f.value = await api.getFixture(id.value)
}

function goLineup(s, side) {
  if (user.isAdmin && s.canSubmitA && s.canSubmitB && !side) {
    uni.showActionSheet({
      itemList: [`提交 ${f.value.teamAName}`, `提交 ${f.value.teamBName}`],
      success: (res) => goLineup(s, res.tapIndex === 0 ? 'a' : 'b')
    })
    return
  }
  const sd = side || (s.canSubmitA ? 'a' : 'b')
  uni.navigateTo({
    url: `/pages/fixture/lineup?fixtureId=${id.value}&subId=${s._id}&side=${sd}`
  })
}

async function onSubTap(s) {
  if (user.isAdmin) {
    const items = ['分配场地号', '设置预计时间', '分配裁判', '清除裁判', '提交上场名单', '进入记分']
    uni.showActionSheet({
      itemList: items,
      success: async (res) => {
        const label = items[res.tapIndex]
        if (label === '分配场地号') await editVenue(s)
        else if (label === '设置预计时间') await editSubTime(s)
        else if (label === '分配裁判') await editReferee(s)
        else if (label === '清除裁判') {
          await api.assignSubFixture({ subFixtureId: s._id, refereeIds: [] })
          toast('已清除裁判', 'success')
          load()
        } else if (label === '提交上场名单') goLineup(s)
        else {
          if (!s.lineupBothReady) {
            toast('双方名单提交后才能记分')
            return
          }
          uni.navigateTo({ url: `/pages/fixture/score?id=${s._id}` })
        }
      }
    })
    return
  }
  if (s.canSubmitA || s.canSubmitB) {
    goLineup(s, s.canSubmitA ? 'a' : 'b')
    return
  }
  if (canScoreSub(s)) {
    if (!s.lineupBothReady) {
      toast('双方名单提交后才能记分')
      return
    }
    uni.navigateTo({ url: `/pages/fixture/score?id=${s._id}` })
    return
  }
  toast(`${s.playerAText} vs ${s.playerBText}`)
}

function pad2(n) {
  return `${n}`.padStart(2, '0')
}

function isoToEdit(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function parseEditTime(text, fallbackIso) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  // HH:mm → 沿用基准日期
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const base = new Date(fallbackIso || Date.now())
    const [hh, mm] = raw.split(':').map(Number)
    base.setHours(hh, mm, 0, 0)
    return base.toISOString()
  }
  const normalized = raw.replace(/\./g, '-').replace('T', ' ')
  const d = new Date(normalized.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) throw new Error('时间格式请用 09:45 或 2025-08-28 09:45')
  return d.toISOString()
}

function editFixtureSchedule() {
  if (!user.isAdmin || !f.value) return
  uni.showActionSheet({
    itemList: ['修改团体预计时间', '修改团体场地号'],
    success: (res) => {
      if (res.tapIndex === 0) editFixtureTime()
      else editFixtureVenue()
    }
  })
}

function editFixtureTime() {
  uni.showModal({
    title: '团体赛预计时间',
    editable: true,
    placeholderText: '09:45 或 2025-08-28 09:45',
    content: isoToEdit(f.value.scheduleTime),
    success: async (r) => {
      if (!r.confirm) return
      try {
        const scheduleTime = parseEditTime(r.content, f.value.scheduleTime || f.value.match?.startDate)
        await api.updateFixtureSchedule({
          fixtureId: f.value._id,
          scheduleTime,
          syncSubTimes: true
        })
        toast('已更新，并同步小项时间', 'success')
        load()
      } catch (e) {
        toast(e?.message || '更新失败')
      }
    }
  })
}

function editFixtureVenue() {
  uni.showModal({
    title: '团体赛场地',
    editable: true,
    placeholderText: '如 1-2号',
    content: f.value.venue || '',
    success: async (r) => {
      if (!r.confirm) return
      await api.updateFixtureSchedule({ fixtureId: f.value._id, venue: (r.content || '').trim() })
      toast('场地已更新', 'success')
      load()
    }
  })
}

function editSubTime(s) {
  return new Promise((resolve) => {
    uni.showModal({
      title: `预计时间 · ${s.itemName}`,
      editable: true,
      placeholderText: '09:45 或 2025-08-28 09:45',
      content: isoToEdit(s.scheduleTime || f.value?.scheduleTime),
      success: async (r) => {
        if (!r.confirm) {
          resolve()
          return
        }
        try {
          const scheduleTime = parseEditTime(r.content, s.scheduleTime || f.value?.scheduleTime || f.value?.match?.startDate)
          await api.assignSubFixture({ subFixtureId: s._id, scheduleTime })
          toast('预计时间已更新', 'success')
          await load()
        } catch (e) {
          toast(e?.message || '更新失败')
        }
        resolve()
      },
      fail: () => resolve()
    })
  })
}

function editVenue(s) {
  return new Promise((resolve) => {
    uni.showModal({
      title: `分配场地 · ${s.itemName}`,
      editable: true,
      placeholderText: s.venue || '如 1号 / 3号',
      content: s.venue || '',
      success: async (r) => {
        if (!r.confirm) {
          resolve()
          return
        }
        const venue = (r.content || '').trim()
        await api.assignSubFixture({ subFixtureId: s._id, venue })
        toast('场地已更新', 'success')
        await load()
        resolve()
      },
      fail: () => resolve()
    })
  })
}

async function editReferee(s) {
  const matchId = f.value?.matchId || f.value?.match?._id
  const refs = await api.listReferees(matchId ? { matchId } : undefined)
  if (!refs.length) {
    toast(matchId ? '请先在比赛中指定本场裁判' : '暂无裁判角色用户')
    return
  }
  uni.showActionSheet({
    itemList: refs.map((r) => {
      const on = (s.refereeIds || []).includes(r._id)
      return `${on ? '✓ ' : ''}${r.realName || r.nickname}`
    }),
    success: async (res) => {
      const pick = refs[res.tapIndex]
      const set = new Set(s.refereeIds || [])
      if (set.has(pick._id)) set.delete(pick._id)
      else set.add(pick._id)
      await api.assignSubFixture({ subFixtureId: s._id, refereeIds: Array.from(set) })
      toast('裁判已更新', 'success')
      load()
    }
  })
}

function goSchedule() {
  const mid = f.value?.matchId || f.value?.match?._id
  if (!mid) return
  uni.navigateTo({ url: `/pages/match/schedule?id=${mid}` })
}

function goLive() {
  const live =
    (f.value?.subFixtures || []).find((s) => canScoreSub(s) && (s.status === 'live' || s.status === 'set_break')) ||
    (f.value?.subFixtures || []).find((s) => canScoreSub(s) && s.status === 'pending')
  if (!live) {
    toast('没有可记分场次')
    return
  }
  uni.navigateTo({ url: `/pages/fixture/score?id=${live._id}` })
}

onLoad((q) => {
  id.value = q.id
})
onShow(() => {
  if (id.value) load()
})
</script>

<style lang="scss" scoped>
.head {
  margin: 24rpx 28rpx 0;
  padding: 32rpx;
}
.vs {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.side {
  text-align: center;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.tn {
  font-size: 26rpx;
  font-weight: 600;
  margin-top: 12rpx;
}
.sc {
  font-size: 68rpx;
  font-weight: 800;
  color: $hg-primary;
}
.st {
  font-size: 22rpx;
  color: $hg-text3;
}
.meta {
  display: flex;
  justify-content: space-between;
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 24rpx;
  padding-top: 20rpx;
  border-top: 1rpx dashed $hg-line;
}
.meta2 {
  font-size: 22rpx;
  color: $hg-text2;
  margin-top: 12rpx;
}
.go-sch {
  color: $hg-primary;
}
.item-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 24rpx;
  padding: 24rpx 28rpx;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
  margin-bottom: 16rpx;
}
.item-slot.live {
  border: 3rpx solid $hg-primary-line;
}
.item-slot.mine {
  background: #F3F9FD;
}
.left { flex: 1; min-width: 0; }
.n {
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8rpx;
  flex-wrap: wrap;
}
.s {
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 6rpx;
}
.right {
  text-align: right;
  font-size: 24rpx;
  color: $hg-text3;
  margin-left: 16rpx;
}
.score {
  font-weight: 700;
  font-size: 28rpx;
  color: $hg-text2;
}
.score.win {
  color: $hg-primary;
}
.sets {
  display: block;
  margin-top: 4rpx;
}
.go {
  display: block;
  color: $hg-primary;
  font-weight: 600;
  margin-top: 4rpx;
}
.lineup {
  margin-top: 10rpx;
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  font-size: 22rpx;
  color: $hg-text2;
  line-height: 1.4;
}
</style>
