<template>
  <view class="page">
    <hg-nav title="比赛详情">
      <template #right><text @click="toggleFav">☆</text></template>
    </hg-nav>
    <view v-if="m" class="detail-hero">
      <view class="tag-row">
        <text class="mini-tag">团体赛</text>
        <text class="mini-tag">{{ prog }}</text>
        <text class="mini-tag">{{ m.scoring?.points }} 分制</text>
      </view>
      <view class="h2">{{ m.name }}</view>
      <view class="meta">📅 {{ range }}　📍 {{ m.location }}</view>
      <view class="meta">👥 {{ m.teamCount }} 支队伍 · {{ m.fixtureCount }} 场 · 报名截止 {{ deadline }}</view>
    </view>
    <view class="detail-tabs">
      <view class="detail-tab" :class="{ active: tab === 'overview' }" @click="tab = 'overview'">概况</view>
      <view class="detail-tab" :class="{ active: tab === 'schedule' }" @click="tab = 'schedule'">赛程</view>
      <view class="detail-tab" :class="{ active: tab === 'rules' }" @click="tab = 'rules'">赛制规则</view>
      <view class="detail-tab" :class="{ active: tab === 'teams' }" @click="tab = 'teams'">队伍</view>
    </view>
    <view class="pad" v-if="m">
      <view v-show="tab === 'overview'">
        <view class="quick-grid">
          <view class="quick-item" @click="goFixture"><view class="ic">🗓️</view><view class="lbl">对阵表</view></view>
          <view class="quick-item" @click="goRegister"><view class="ic">📝</view><view class="lbl">去报名</view></view>
          <view class="quick-item" @click="goResult"><view class="ic">🏆</view><view class="lbl">赛果</view></view>
          <view class="quick-item" @click="goPhoto"><view class="ic">📷</view><view class="lbl">照片墙</view></view>
        </view>
        <view class="card" style="overflow: hidden;">
          <view class="section-title" style="padding: 0 28rpx; margin-top: 24rpx;">比赛信息</view>
          <view class="info-row"><text class="info-k">比赛状态</text><view class="info-v"><hg-chip :text="st.label" :type="st.chip" /></view></view>
          <view class="info-row"><text class="info-k">赛制类型</text><text class="info-v">团体赛（单项制）</text></view>
          <view class="info-row"><text class="info-k">晋级方式</text><text class="info-v">{{ prog }}</text></view>
          <view class="info-row"><text class="info-k">比赛项目</text><text class="info-v">{{ itemNames }}</text></view>
          <view class="info-row"><text class="info-k">记分规则</text><text class="info-v">{{ scoreRule }}</text></view>
          <view class="info-row"><text class="info-k">团体规则</text><text class="info-v">{{ teamRule }}</text></view>
          <view class="info-row"><text class="info-k">比赛公告</text><text class="info-v">{{ m.notice || '暂无' }}</text></view>
        </view>
        <view class="rule-box">📌 记分说明：每球得分制；平分后需连续得 2 分，先到 {{ m.scoring?.capPoints }} 分者胜；每局结束双方交换场地，局间休息 120 秒。</view>
        <view class="row" style="gap: 20rpx; margin-top: 24rpx;">
          <button class="btn-ghost" @click="goFixture">查看对阵</button>
          <button class="btn-primary" @click="goRegister">去报名</button>
        </view>
        <view v-if="user.isAdmin" class="row" style="gap: 20rpx; margin-top: 20rpx;">
          <button class="btn-ghost" @click="gen">⚙ 生成对阵</button>
          <button class="btn-ghost" @click="goReview">审核报名</button>
        </view>
      </view>
      <view v-show="tab === 'schedule'">
        <view class="card" style="overflow: hidden; margin-top: 24rpx;">
          <view class="section-title" style="padding: 0 28rpx; margin-top: 24rpx;">比赛日程</view>
          <view v-for="(s, i) in (m.scheduleNote || [])" :key="i" class="info-row">
            <text class="info-k">{{ s.time }}</text>
            <text class="info-v">{{ s.text }}</text>
          </view>
          <view v-if="!(m.scheduleNote || []).length" class="info-row"><text class="info-v">暂未填写日程，以对阵表时间为准</text></view>
        </view>
      </view>
      <view v-show="tab === 'rules'">
        <view class="card" style="overflow: hidden; margin-top: 24rpx;">
          <view class="section-title" style="padding: 0 28rpx; margin-top: 24rpx;">比赛项目（{{ m.items?.length || 0 }} 项）</view>
          <view style="padding: 12rpx 28rpx 24rpx; display: flex; flex-wrap: wrap; gap: 12rpx;">
            <hg-chip v-for="it in m.items" :key="it._id" :text="it.name + ' · ' + it.memberCount + ' 人'" type="green" />
          </view>
          <view class="info-row"><text class="info-k">记分规则</text><text class="info-v">{{ m.scoring?.points }} 分制</text></view>
          <view class="info-row"><text class="info-k">局数</text><text class="info-v">三局两胜</text></view>
          <view class="info-row"><text class="info-k">平分规则</text><text class="info-v">净胜 {{ m.scoring?.deuceMargin }} 分</text></view>
          <view class="info-row"><text class="info-k">封顶分数</text><text class="info-v">{{ m.scoring?.capPoints }} 分</text></view>
          <view class="info-row"><text class="info-k">团体胜负</text><text class="info-v">{{ teamRule }}</text></view>
          <view class="info-row"><text class="info-k">兼项限制</text><text class="info-v">{{ m.allowDualItem ? '允许兼项' : '默认不允许兼项' }}</text></view>
        </view>
      </view>
      <view v-show="tab === 'teams'">
        <view class="card" style="margin-top: 24rpx; padding: 12rpx 28rpx 20rpx;">
          <view v-for="t in m.teams" :key="t._id" class="team-row">
            <hg-avatar :name="t.name" />
            <view class="tm">
              <view class="tn">{{ t.name }}</view>
              <view class="ts">队长：{{ t.captainName }} · {{ t.members?.length || 0 }} 人 · {{ ts(t).label }}</view>
            </view>
            <hg-chip :text="t.groupName ? t.groupName + ' 组' : ts(t).label" :type="t.groupName ? 'green' : ts(t).chip" />
          </view>
          <hg-empty v-if="!(m.teams || []).length" text="暂无报名队伍" />
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
import { useMatchStore } from '@/stores/match'
import { matchStatus, teamStatus, formatRange, formatDate, toast, confirm } from '@/utils/format'
import { PROGRESSION } from '@/utils/constants'

const user = useUserStore()
const store = useMatchStore()
const id = ref('')
const m = ref(null)
const tab = ref('overview')
const st = computed(() => matchStatus(m.value?.status))
const range = computed(() => formatRange(m.value?.startDate, m.value?.endDate))
const deadline = computed(() => formatDate(m.value?.registerDeadline, true))
const prog = computed(() => PROGRESSION[m.value?.progression]?.label || '')
const itemNames = computed(() => (m.value?.items || []).map((i) => i.name).join(' / '))
const scoreRule = computed(() => {
  const s = m.value?.scoring || {}
  return `${s.points} 分制 · 三局两胜 · 平分净胜 ${s.deuceMargin} 分 · ${s.capPoints} 分封顶`
})
const teamRule = computed(() => {
  const r = m.value?.teamRule || {}
  return r.mode === 'playAll' ? '打满全部单项，按总胜场判定' : `先赢 ${r.itemsWinToWin || 3} 个单项者获胜`
})

function ts(t) {
  return teamStatus(t.registerStatus)
}

async function load() {
  m.value = await api.getMatch(id.value)
  if (m.value?.access?.needPassword) {
    uni.redirectTo({ url: `/pages/match/password?id=${id.value}` })
  }
}

onLoad((q) => {
  id.value = q.id
})
onShow(() => {
  if (id.value) load()
})

function goFixture() {
  store.select(id.value)
  uni.switchTab({ url: '/pages/fixture/index' })
}
function goResult() {
  store.select(id.value)
  uni.switchTab({ url: '/pages/result/index' })
}
function goRegister() {
  uni.navigateTo({ url: `/pages/register/index?id=${id.value}` })
}
function goPhoto() {
  uni.navigateTo({ url: `/pages/photo/index?id=${id.value}` })
}
function goReview() {
  uni.navigateTo({ url: `/pages/register/review?id=${id.value}` })
}
async function gen() {
  if (!(await confirm('将按当前已审核队伍重新生成对阵表，是否继续？'))) return
  const r = await api.generateFixtures(id.value)
  toast(`已生成 ${r.count} 场对阵`, 'success')
  load()
}
function toggleFav() {
  toast('已收藏')
}
</script>

<style lang="scss" scoped>
.detail-hero {
  background: linear-gradient(135deg, #00B87A, #006B48);
  color: #fff;
  padding: 32rpx;
}
.tag-row {
  display: flex;
  gap: 12rpx;
  margin-bottom: 16rpx;
  flex-wrap: wrap;
}
.mini-tag {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 12rpx;
  padding: 6rpx 16rpx;
  font-size: 22rpx;
}
.h2 {
  font-size: 40rpx;
  font-weight: 700;
  margin-bottom: 16rpx;
}
.meta {
  font-size: 24rpx;
  opacity: 0.9;
  line-height: 1.8;
}
.detail-tabs {
  display: flex;
  background: #fff;
  border-radius: 24rpx;
  margin: 24rpx 28rpx 0;
  padding: 8rpx;
}
.detail-tab {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  font-size: 26rpx;
  color: $hg-text2;
  border-radius: 18rpx;
}
.detail-tab.active {
  background: $hg-primary-light;
  color: $hg-primary-deep;
  font-weight: 600;
}
.quick-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
  margin: 20rpx 0;
}
.quick-item {
  background: #fff;
  border-radius: 24rpx;
  padding: 24rpx 8rpx;
  text-align: center;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
}
.ic {
  font-size: 44rpx;
}
.lbl {
  font-size: 22rpx;
  color: $hg-text2;
  margin-top: 8rpx;
}
.team-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #F7F8FA;
}
.tm {
  flex: 1;
}
.tn {
  font-weight: 600;
  font-size: 28rpx;
}
.ts {
  font-size: 22rpx;
  color: $hg-text3;
}
</style>
