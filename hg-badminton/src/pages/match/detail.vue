<template>
  <view class="page">
    <hg-nav :title="m?.name || '比赛'" />
    <view v-if="m" class="detail-hero">
      <view class="tag-row">
        <text class="mini-tag">单循环赛</text>
        <text class="mini-tag">{{ m.scoring?.points }} 分制</text>
        <hg-chip :text="st.label" :type="st.chip" />
      </view>
      <view class="meta">📅 {{ formatRange(m.startDate, m.endDate) }}　📍 {{ m.location }}</view>
    </view>

    <view class="pad" v-if="m">
      <view class="card seg-wrap">
        <view class="seg">
          <view
            v-for="t in tabs"
            :key="t.key"
            class="seg-item"
            :class="{ active: subTab === t.key }"
            @click="switchTab(t.key)"
          >{{ t.label }}</view>
        </view>
      </view>

      <!-- 介绍 -->
      <view v-if="subTab === 'intro'">
        <view class="card" style="overflow: hidden;">
          <view class="info-row"><text class="info-k">状态</text><view class="info-v"><hg-chip :text="st.label" :type="st.chip" /></view></view>
          <view class="info-row"><text class="info-k">报名截止</text><text class="info-v">{{ formatDate(m.registerEnd, true) }}</text></view>
          <view class="info-row"><text class="info-k">队伍上限</text><text class="info-v">{{ m.maxTeams }} 支 · 男 {{ m.maxMalePerTeam }} / 女 {{ m.maxFemalePerTeam }}</text></view>
          <view class="info-row"><text class="info-k">已报队伍</text><text class="info-v">{{ m.teamCount }} 支 · {{ m.memberCount }} 人</text></view>
          <view class="info-row"><text class="info-k">须知</text><text class="info-v">{{ m.notice || '暂无' }}</text></view>
        </view>

        <view class="section-title">参赛队伍</view>
        <view class="card" style="padding: 8rpx 28rpx 20rpx;">
          <view v-for="t in m.teams" :key="t._id" class="team-row">
            <hg-avatar :name="t.name" />
            <view class="tm">
              <view class="tn">{{ t.name }}</view>
              <view class="ts">{{ t.department }} · 队长 {{ t.captainName }} · {{ t.activeCount }} 人（男{{ t.maleCount }}/女{{ t.femaleCount }}）</view>
            </view>
          </view>
          <hg-empty v-if="!(m.teams || []).length" text="暂无队伍" />
        </view>

        <view v-if="user.isGuest" class="rule-box" style="margin-top: 20rpx;">
          游客可浏览比赛介绍、队伍、对阵与赛果。报名与管理功能需登录后使用。
          <button class="btn-primary" style="margin-top: 16rpx;" @click="goLogin">去登录</button>
        </view>
        <view v-else-if="!m.canViewDetail" class="rule-box" style="margin-top: 20rpx;">
          您不是本场参赛者。可申请成为观众，审批通过后查看对阵与赛果。
          <button class="btn-ghost" style="margin-top: 16rpx;" @click="goSpectator">申请观众</button>
        </view>

        <view v-if="user.isAdmin" class="row" style="gap: 16rpx; margin-top: 24rpx;">
          <button class="btn-ghost" @click="gen">生成对阵</button>
          <button class="btn-ghost" @click="goSpReview">观众审核</button>
        </view>
        <view v-if="user.isCaptain && m.myTeam && m.myTeam.captainId === user.profile?._id" style="margin-top: 16rpx;">
          <button class="btn-ghost" @click="goReview">队员审批</button>
        </view>
      </view>

      <!-- 报名 -->
      <view v-if="subTab === 'register'">
        <view class="card info">
          <view class="info-title">报名说明</view>
          <view class="info-meta">队伍 {{ m.teamCount }}/{{ m.maxTeams }} · 男限 {{ m.maxMalePerTeam }} / 女限 {{ m.maxFemalePerTeam }}</view>
          <view class="info-meta">报名截止 {{ formatDate(m.registerEnd, true) }}</view>
        </view>
        <view v-if="user.isGuest" class="rule-box">游客仅可查看报名队伍，登录后可报名参赛。</view>
        <view v-else class="row actions">
          <button v-if="user.isCaptain" class="btn-ghost" @click="goTeam">队伍报名</button>
          <button class="btn-primary" @click="goJoin">申请入队</button>
        </view>
        <view v-if="!user.isGuest && user.isCaptain && m.myTeam?.captainId === user.profile?._id" style="margin-top: 16rpx;">
          <button class="btn-ghost" @click="goReview">队员审批</button>
        </view>
        <view class="section-title">已报名队伍</view>
        <view class="card" style="padding: 8rpx 28rpx 20rpx;">
          <view v-for="t in m.teams || []" :key="t._id" class="team-row">
            <hg-avatar :name="t.name" />
            <view class="tm">
              <view class="tn">{{ t.name }}</view>
              <view class="ts">{{ t.department }} · 队长 {{ t.captainName }} · {{ t.activeCount }} 人</view>
            </view>
          </view>
          <hg-empty v-if="!(m.teams || []).length" text="暂无队伍报名" />
        </view>
      </view>

      <!-- 对阵 -->
      <view v-if="subTab === 'fixture'">
        <view v-if="fixtureError" class="rule-box">
          {{ fixtureError }}
          <button v-if="!user.isGuest" class="btn-ghost" style="margin-top: 16rpx;" @click="goSpectator">申请观众</button>
        </view>
        <view v-else>
          <view v-for="r in rounds" :key="r.name" class="card gcard">
            <view class="gt">{{ r.name }}</view>
            <hg-fixture-card v-for="f in r.list" :key="f._id" :item="f" @click="openFixture(f)" />
          </view>
          <hg-empty v-if="!rounds.length" text="暂无对阵，管理员可在「介绍」中生成" />
          <view v-if="user.isAdmin" style="margin-top: 16rpx;">
            <button class="btn-ghost" @click="gen">生成对阵</button>
          </view>
        </view>
      </view>

      <!-- 赛果 -->
      <view v-if="subTab === 'result'">
        <view v-if="resultError" class="rule-box">
          {{ resultError }}
          <button v-if="!user.isGuest" class="btn-ghost" style="margin-top: 16rpx;" @click="goSpectator">申请观众</button>
        </view>
        <view v-else-if="resultData.match">
          <view class="champion" v-if="champion">
            <view class="t1">🥇 积分榜首位</view>
            <view class="t2">{{ champion.name }}</view>
            <view class="t3">胜 {{ champion.win }} 负 {{ champion.lose }} · {{ champion.points }} 分</view>
          </view>
          <view class="section-title">积分榜</view>
          <view class="card" style="overflow: hidden;">
            <view v-for="(r, i) in resultData.rank" :key="r.teamId" class="rank-row">
              <view class="rk" :class="{ g: i < 2 }">{{ i + 1 }}</view>
              <view class="nm">{{ r.name }}</view>
              <view class="wl">胜 {{ r.win }} 负 {{ r.lose }}</view>
              <view class="pts">{{ r.points }}</view>
            </view>
            <hg-empty v-if="!(resultData.rank || []).length" text="暂无积分（生成对阵并完赛后显示）" />
          </view>
          <view class="section-title">最新赛果</view>
          <hg-fixture-card v-for="f in resultData.latest" :key="f._id" :item="f" @click="openFixture(f)" />
          <hg-empty v-if="!(resultData.latest || []).length" text="暂无完赛记录" />
        </view>
        <hg-empty v-else text="暂无赛果" />
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { useMatchStore } from '@/stores/match'
import { matchStatus, formatRange, formatDate, toast, confirm } from '@/utils/format'
import { requireLogin } from '@/utils/nav'

const user = useUserStore()
const store = useMatchStore()
const id = ref('')
const m = ref(null)
const fixtureData = ref({ fixtures: [] })
const fixtureError = ref('')
const resultData = ref({ match: null, rank: [], latest: [] })
const resultError = ref('')

const tabs = [
  { key: 'intro', label: '介绍' },
  { key: 'register', label: '报名' },
  { key: 'fixture', label: '对阵' },
  { key: 'result', label: '赛果' }
]

const subTab = computed({
  get: () => store.subTab || 'intro',
  set: (v) => store.setSubTab(v)
})

const st = computed(() => matchStatus(m.value?.status))
const champion = computed(() => resultData.value.rank?.[0] || null)
const rounds = computed(() => {
  const map = {}
  ;(fixtureData.value.fixtures || []).forEach((f) => {
    if (!map[f.round]) map[f.round] = []
    map[f.round].push(f)
  })
  return Object.keys(map).map((name) => ({ name, list: map[name] }))
})

async function load() {
  if (!id.value) return
  m.value = await api.getMatch(id.value)
  store.select(id.value)
  await loadSub()
}

async function loadSub() {
  const tab = store.subTab
  if (tab === 'intro' || tab === 'register') return
  if (tab === 'fixture') {
    try {
      fixtureError.value = ''
      fixtureData.value = await api.listFixtures(id.value)
    } catch (e) {
      fixtureError.value = e.message || '无权查看对阵'
      fixtureData.value = { fixtures: [] }
    }
  } else if (tab === 'result') {
    try {
      resultError.value = ''
      resultData.value = await api.getResults(id.value)
    } catch (e) {
      resultError.value = e.message || '无权查看赛果'
      resultData.value = { match: null, rank: [], latest: [] }
    }
  }
}

function switchTab(key) {
  store.setSubTab(key)
  loadSub()
}

async function gen() {
  if (!(await confirm('将按当前有效队伍生成单循环对阵，是否继续？'))) return
  const r = await api.generateFixtures(id.value)
  toast(`已生成 ${r.count} 场`, 'success')
  await load()
  if (store.subTab !== 'fixture') {
    store.setSubTab('fixture')
    await loadSub()
  }
}

function goTeam() {
  if (!requireLogin()) return
  uni.navigateTo({ url: `/pages/match/team?id=${id.value}` })
}
function goJoin() {
  if (!requireLogin()) return
  uni.navigateTo({ url: `/pages/match/join?id=${id.value}` })
}
function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' })
}
function goSpectator() {
  if (!requireLogin()) return
  uni.navigateTo({ url: `/pages/match/spectator?id=${id.value}` })
}
function goSpReview() {
  uni.navigateTo({ url: `/pages/match/spectator-review?id=${id.value}` })
}
function goReview() {
  if (!m.value?.myTeam?._id) return
  uni.navigateTo({ url: `/pages/match/team-review?id=${m.value.myTeam._id}` })
}
function openFixture(f) {
  uni.navigateTo({ url: `/pages/fixture/detail?id=${f._id}` })
}

onLoad((q) => {
  id.value = q.id || ''
  const tab = q.tab || store.subTab || 'intro'
  store.setSubTab(['intro', 'register', 'fixture', 'result'].includes(tab) ? tab : 'intro')
})
onShow(() => {
  if (id.value) load()
})
</script>

<style lang="scss" scoped>
.detail-hero {
  background: $hg-hero-gradient;
  color: #fff;
  padding: 24rpx 32rpx 32rpx;
}
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-bottom: 12rpx;
  align-items: center;
}
.mini-tag {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12rpx;
  padding: 6rpx 16rpx;
  font-size: 22rpx;
}
.meta {
  font-size: 24rpx;
  opacity: 0.9;
  line-height: 1.6;
}
.seg-wrap {
  padding: 12rpx;
  margin-bottom: 20rpx;
}
.seg {
  display: flex;
  background: #EDEEF1;
  border-radius: 20rpx;
  padding: 6rpx;
  gap: 6rpx;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  font-size: 26rpx;
  border-radius: 16rpx;
  color: $hg-text2;
}
.seg-item.active {
  background: #fff;
  color: $hg-primary;
  font-weight: 600;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.08);
}
.info {
  padding: 28rpx;
  margin-bottom: 16rpx;
}
.info-title {
  font-size: 30rpx;
  font-weight: 700;
  margin-bottom: 8rpx;
}
.info-meta {
  font-size: 24rpx;
  color: $hg-text2;
  line-height: 1.7;
}
.actions {
  gap: 16rpx;
  margin-bottom: 8rpx;
}
.team-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #F7F8FA;
}
.tm { flex: 1; }
.tn { font-weight: 600; }
.ts { font-size: 22rpx; color: $hg-text3; }
.gcard {
  overflow: hidden;
  margin-bottom: 20rpx;
  padding-bottom: 12rpx;
}
.gt {
  padding: 24rpx 28rpx 8rpx;
  font-weight: 600;
  font-size: 28rpx;
}
.champion {
  background: $hg-champion-gradient;
  border-radius: 32rpx;
  padding: 32rpx;
  color: $hg-champion-deep;
  margin-bottom: 8rpx;
}
.t1 { font-size: 24rpx; opacity: 0.8; }
.t2 { font-size: 48rpx; font-weight: 800; margin-top: 8rpx; }
.t3 { font-size: 24rpx; margin-top: 8rpx; opacity: 0.85; }
.rank-row {
  display: flex;
  align-items: center;
  padding: 22rpx 24rpx;
  border-bottom: 1rpx solid #F7F8FA;
  font-size: 26rpx;
}
.rk {
  width: 48rpx;
  text-align: center;
  font-weight: 700;
  color: $hg-text3;
}
.rk.g { color: $hg-accent; }
.nm { flex: 1; font-weight: 600; }
.wl {
  font-size: 24rpx;
  color: $hg-text3;
  margin-right: 24rpx;
}
.pts {
  color: $hg-primary;
  font-weight: 700;
}
</style>
