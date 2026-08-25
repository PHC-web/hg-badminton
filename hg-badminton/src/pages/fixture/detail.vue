<template>
  <view class="page">
    <hg-nav title="团体对阵详情">
      <template #right>
        <text v-if="canScore" @click="goLive">⚡记分</text>
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
          <view class="st">团体赛 · {{ status }}</view>
        </view>
        <view class="side">
          <hg-avatar :name="f.teamBName" :size="88" :font="36" />
          <view class="tn">{{ f.teamBName }}</view>
        </view>
      </view>
      <view class="meta">
        <text>{{ f.code }} · {{ f.venue }}</text>
        <text>{{ time }}</text>
        <text>裁判：{{ f.refereeNames || '未指派' }}</text>
      </view>
    </view>
    <view class="section-title" style="padding: 0 28rpx;">
      单项场次
      <text style="font-size: 22rpx; color: #9AA1A9; font-weight: 400;">{{ ruleHint }}</text>
    </view>
    <view class="pad" style="padding-top: 0;">
      <view
        v-for="s in f?.subFixtures || []"
        :key="s._id"
        class="item-slot"
        :class="{ live: s.status === 'live' }"
        @click="openSub(s)"
      >
        <view>
          <view class="n">
            {{ s.itemName }}
            <hg-chip v-if="s.status === 'live'" text="进行中" type="orange" />
          </view>
          <view class="s">{{ s.playerA }} vs {{ s.playerB }}</view>
        </view>
        <view class="right">
          <text v-if="s.winner" :style="{ color: s.winner === 'a' ? '#00A870' : '#5B6470', fontWeight: 700, fontSize: '28rpx' }">
            {{ setScore(s) }}
          </text>
          <text class="sets">{{ s.setText }}</text>
          <text v-if="s.status === 'live' || s.status === 'pending'" class="go">{{ canScore ? '去记分 ›' : '查看 ›' }}</text>
        </view>
      </view>
      <button v-if="canScore" class="btn-primary" style="margin-top: 12rpx;" @click="goLive">⚡ 开始记分（裁判）</button>
      <view v-if="user.isAdmin" style="margin-top: 20rpx;">
        <button class="btn-ghost" @click="assign">👨‍⚖️ 指派裁判</button>
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

const user = useUserStore()
const id = ref('')
const f = ref(null)
const status = computed(() => fixtureStatus(f.value?.status).label)
const time = computed(() => formatDate(f.value?.scheduleTime, true))
const ruleHint = computed(() => {
  const r = f.value?.match?.teamRule
  if (!r) return ''
  return r.mode === 'playAll' ? '打满全部单项' : `先赢 ${r.itemsWinToWin || 3} 项获胜`
})
const canScore = computed(() => {
  if (!f.value) return false
  return user.isAdmin || (f.value.refereeIds || []).includes(user.profile?._id)
})

function setScore(s) {
  const a = (s.sets || []).filter((x) => x.winner === 'a').length
  const b = (s.sets || []).filter((x) => x.winner === 'b').length
  return `${a}:${b}`
}

async function load() {
  f.value = await api.getFixture(id.value)
}

function openSub(s) {
  if (!canScore.value && s.status === 'pending') {
    toast('未开始')
    return
  }
  if (canScore.value) {
    uni.navigateTo({ url: `/pages/fixture/score?id=${s._id}` })
  }
}

function goLive() {
  const live = (f.value?.subFixtures || []).find((s) => s.status === 'live' || s.status === 'set_break')
    || (f.value?.subFixtures || []).find((s) => s.status === 'pending')
  if (!live) {
    toast('没有可记分场次')
    return
  }
  uni.navigateTo({ url: `/pages/fixture/score?id=${live._id}` })
}

async function assign() {
  const refs = await api.listReferees()
  uni.showActionSheet({
    itemList: refs.map((r) => r.nickname),
    success: async (res) => {
      const pick = refs[res.tapIndex]
      const ids = Array.from(new Set([...(f.value.refereeIds || []), pick._id]))
      await api.assignReferee({ fixtureId: id.value, refereeIds: ids })
      toast('已指派 ' + pick.nickname, 'success')
      load()
    }
  })
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
.n {
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8rpx;
}
.s {
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 4rpx;
}
.right {
  text-align: right;
  font-size: 24rpx;
  color: $hg-text3;
}
.sets {
  margin-left: 8rpx;
}
.go {
  color: $hg-primary;
  font-weight: 600;
}
</style>
