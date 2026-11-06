<template>
  <view class="page score-page">
    <hg-nav title="裁判记分" dark @right="undo">
      <template #right>↩ 撤销</template>
    </hg-nav>
    <view v-if="sub" class="score-header">
      <view class="setinfo">{{ sub.itemName || sub.item?.name }} · 场地 {{ sub.venue || sub.fixture?.venue || '待定' }} · 第 {{ sub.currentSet }} 局</view>
      <view class="players" v-if="sub.lineupBothReady">
        <text>{{ (sub.playersA || []).map((p) => p.name).join('/') || '—' }}</text>
        <text class="vs">vs</text>
        <text>{{ (sub.playersB || []).map((p) => p.name).join('/') || '—' }}</text>
      </view>
      <view class="teams">
        <text class="tn">{{ sub.fixture?.teamAName }}</text>
        <text class="cs">{{ setA }}<text class="col">:</text>{{ setB }}</text>
        <text class="tn r">{{ sub.fixture?.teamBName }}</text>
      </view>
    </view>
    <view class="notice live">🔄 比分已实时同步 · 观赛端可见</view>
    <view v-if="breakSec > 0" class="notice">⏱ 局间休息 {{ breakSec }} 秒 · 请双方交换场地</view>
    <view v-if="deuce" class="notice">⚖️ 平分！需净胜 2 分，先到 {{ cap }} 分者获胜</view>
    <view v-if="gp" class="notice">🎯 {{ gp === 'a' ? sub.fixture?.teamAName : sub.fixture?.teamBName }} 局点 / 赛点！</view>
    <view class="score-board">
      <view class="cur-label">{{ label }}</view>
      <view class="score-nums">
        <view class="num a">{{ cur.aScore }}</view>
        <view class="colon">:</view>
        <view class="num b">{{ cur.bScore }}</view>
      </view>
      <view class="names">
        <text>{{ sub?.fixture?.teamAName }}</text>
        <text>{{ sub?.fixture?.teamBName }}</text>
      </view>
    </view>
    <view class="btn-col">
      <view class="side">
        <button class="plus plus-a" @click="add('a')">＋1</button>
        <button class="btn-ghost sm" @click="toastSwap">🔃 换边</button>
      </view>
      <view class="side">
        <button class="plus plus-b" @click="add('b')">＋1</button>
        <button class="btn-danger sm" @click="hintEnd">本局结束</button>
      </view>
    </view>
    <view class="card hist">
      <view class="ht">本场比分记录</view>
      <view class="hb">
        <view v-for="(s, i) in history" :key="i">第 {{ i + 1 }} 局：{{ s }}</view>
      </view>
    </view>
    <view class="pad">
      <button class="btn-primary finish" @click="finish">🏁 确认完赛 · 生成赛果</button>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onUnload } from '@dcloudio/uni-app'
import { api } from '@/api'
import { isDeuce, gamePointSide, tallySets, judgeSetEnd } from '@/utils/scoring'
import { toast, confirm } from '@/utils/format'

const id = ref('')
const sub = ref(null)
const breakSec = ref(0)
let timer = null

const rule = computed(() => sub.value?.match?.scoring || { points: 21, capPoints: 30, deuceMargin: 2 })
const cap = computed(() => rule.value.capPoints || 30)
const cur = computed(() => {
  const sets = sub.value?.sets || [{ aScore: 0, bScore: 0 }]
  return sets.find((s) => !s.winner) || sets[sets.length - 1] || { aScore: 0, bScore: 0 }
})
const setA = computed(() => tallySets(sub.value?.sets || []).a)
const setB = computed(() => tallySets(sub.value?.sets || []).b)
const deuce = computed(() => isDeuce(cur.value.aScore, cur.value.bScore, rule.value.points))
const gp = computed(() => gamePointSide(cur.value.aScore, cur.value.bScore, rule.value))
const label = computed(() => {
  if (sub.value?.status === 'finished' || sub.value?.status === 'confirmed') return '比赛已结束 · 请点击「确认完赛」生成赛果'
  return `当前局 · 每球得分制（${rule.value.points - 1} 平后净胜 2 分，${cap.value} 分封顶）`
})
const history = computed(() => {
  return (sub.value?.sets || []).map((s) => {
    if (s.winner) return `${s.aScore} : ${s.bScore}（${s.winner === 'a' ? sub.value.fixture.teamAName : sub.value.fixture.teamBName}胜）`
    return `${s.aScore} : ${s.bScore}（进行中…）`
  })
})

async function load() {
  sub.value = await api.getSubFixture(id.value)
  if (sub.value.status === 'pending') {
    sub.value = await api.startSubFixture(id.value)
  }
  if (sub.value.status === 'set_break') startBreak()
}

function startBreak() {
  breakSec.value = 120
  clearInterval(timer)
  timer = setInterval(() => {
    breakSec.value -= 1
    if (breakSec.value <= 0) clearInterval(timer)
  }, 1000)
}

async function add(side) {
  if (['finished', 'confirmed'].includes(sub.value?.status)) {
    toast('本场比赛已结束')
    return
  }
  const prev = sub.value?.status
  sub.value = await api.addPoint({ subFixtureId: id.value, side })
  if (sub.value.status === 'set_break' && prev !== 'set_break') {
    toast('本局结束，请交换场地')
    startBreak()
  }
  if (sub.value.status === 'finished') toast('🏆 本场单项已结束')
}

async function undo() {
  sub.value = await api.undoPoint(id.value)
  toast('已撤销上一步')
}

function toastSwap() {
  toast('请双方交换场地')
}

function hintEnd() {
  if (!judgeSetEnd(cur.value.aScore, cur.value.bScore, rule.value)) {
    toast('当前比分未达到结束条件（需净胜 2 分或封顶）')
  } else {
    toast('系统已自动判定本局结束')
  }
}

async function finish() {
  if (sub.value.status !== 'finished') {
    toast('请先打完本场单项')
    return
  }
  if (!(await confirm('确认完赛并计入团体赛果？'))) return
  await api.confirmSubFixture(id.value)
  toast('赛果已生成并同步排行榜', 'success')
  uni.redirectTo({ url: `/pages/fixture/detail?id=${sub.value.fixture._id}` })
}

onLoad((q) => {
  id.value = q.id
  load()
})
onUnload(() => clearInterval(timer))
</script>

<style lang="scss" scoped>
.score-page {
  background: $hg-bg;
}
.score-header {
  background: $hg-hero-gradient;
  color: #fff;
  padding: 28rpx 32rpx 32rpx;
  text-align: center;
}
.setinfo {
  font-size: 24rpx;
  opacity: 0.85;
}
.players {
  margin-top: 12rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 12rpx;
  font-size: 24rpx;
  opacity: 0.95;
}
.players .vs {
  opacity: 0.7;
  font-size: 22rpx;
}
.teams {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16rpx;
}
.tn {
  font-size: 28rpx;
  font-weight: 600;
  flex: 1;
}
.tn.r {
  text-align: right;
}
.cs {
  font-size: 60rpx;
  font-weight: 800;
  width: 160rpx;
}
.col {
  opacity: 0.5;
  font-size: 40rpx;
}
.notice {
  background: $hg-accent-light;
  border-radius: 20rpx;
  padding: 18rpx 24rpx;
  margin: 16rpx 28rpx 0;
  font-size: 24rpx;
  color: #C96A2A;
}
.notice.live {
  background: $hg-primary-light;
  color: $hg-primary-deep;
}
.score-board {
  background: #fff;
  border-radius: 32rpx;
  margin: 24rpx 28rpx;
  padding: 36rpx 28rpx 28rpx;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
}
.cur-label {
  text-align: center;
  font-size: 24rpx;
  color: $hg-text3;
  margin-bottom: 20rpx;
}
.score-nums {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.num {
  font-size: 128rpx;
  font-weight: 800;
  line-height: 1;
  width: 200rpx;
  text-align: center;
}
.num.a {
  color: $hg-primary-deep;
}
.colon {
  font-size: 56rpx;
  color: $hg-text3;
  font-weight: 600;
}
.names {
  display: flex;
  justify-content: space-between;
  margin-top: 8rpx;
  font-size: 22rpx;
  color: $hg-text3;
}
.btn-col {
  display: flex;
  justify-content: space-between;
  gap: 28rpx;
  margin: 24rpx 28rpx;
}
.side {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.plus {
  height: 112rpx;
  border-radius: 28rpx;
  border: none;
  font-size: 44rpx;
  font-weight: 700;
}
.plus-a {
  background: $hg-primary-light;
  color: $hg-primary-deep;
}
.plus-b {
  background: #F0F1F3;
  color: $hg-text;
}
.sm {
  height: 88rpx;
  font-size: 26rpx;
}
.hist {
  margin: 0 28rpx;
  padding: 20rpx 28rpx;
}
.ht {
  font-size: 24rpx;
  font-weight: 600;
  margin-bottom: 12rpx;
}
.hb {
  font-size: 24rpx;
  color: $hg-text2;
  line-height: 1.9;
}
.finish {
  background: $hg-accent;
}
</style>
