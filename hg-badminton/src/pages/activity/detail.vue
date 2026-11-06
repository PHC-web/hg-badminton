<template>
  <view class="page">
    <hg-nav title="活动详情" />
    <view v-if="a" class="detail-hero">
      <view class="h2">{{ a.name }}</view>
      <view class="meta">📅 {{ formatDate(a.startTime, true) }}　📍 {{ a.location }}</view>
      <view class="meta">报名 {{ formatDate(a.registerStart, true) }} - {{ formatDate(a.registerEnd, true) }}</view>
    </view>
    <view class="pad" v-if="a">
      <view class="card" style="overflow:hidden;">
        <view class="info-row"><text class="info-k">状态</text><view class="info-v"><hg-chip :text="st.label" :type="st.chip" /></view></view>
        <view class="info-row"><text class="info-k">名额</text><text class="info-v">{{ a.confirmedCount }}/{{ a.maxCount }}（候补 {{ a.queuedCount }}）</text></view>
        <view class="info-row"><text class="info-k">须知</text><text class="info-v">{{ a.notice || '暂无' }}</text></view>
      </view>

      <view class="section-title">正式名单</view>
      <view class="card list">
        <view v-for="r in confirmed" :key="r._id" class="row line">
          <hg-avatar :name="r.name" :size="64" />
          <view class="meta">
            <view class="n">{{ r.name }}{{ r.isProxy ? '（代报）' : '' }}</view>
            <view class="s">{{ r.department || '未填部门' }} · {{ maskPhone(r.phone) }}</view>
          </view>
          <hg-chip text="已报名" type="green" />
        </view>
        <hg-empty v-if="!confirmed.length" text="暂无正式报名" />
      </view>

      <view class="section-title">候补队列</view>
      <view class="card list">
        <view v-for="r in queued" :key="r._id" class="row line">
          <view class="qno">{{ r.queueNo }}</view>
          <view class="meta">
            <view class="n">{{ r.name }}</view>
            <view class="s">{{ r.department || '未填部门' }}</view>
          </view>
          <hg-chip text="排队中" type="orange" />
        </view>
        <hg-empty v-if="!queued.length" text="暂无候补" />
      </view>

      <view style="margin-top: 24rpx;">
        <button v-if="isGuest && st.key === 'open'" class="btn-primary" @click="goReg">去报名</button>
        <button v-else-if="st.key === 'open' && a.myRegistration && a.myRegistration.status !== 'cancelled'" class="btn-danger" @click="cancel">取消报名</button>
        <button v-else-if="st.key === 'open' && a.canRegister" class="btn-primary" @click="goReg">去报名{{ a.remain ? '' : '（排队）' }}</button>
        <view v-else-if="st.key === 'open'" class="rule-box">当前不可报名</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { activityDisplayStatus, formatDate, maskPhone, toast, confirm } from '@/utils/format'

const user = useUserStore()
const id = ref('')
const a = ref(null)
const isGuest = computed(() => user.isGuest)
const st = computed(() => activityDisplayStatus(a.value))
const confirmed = computed(() => (a.value?.registrations || []).filter((r) => r.status === 'confirmed'))
const queued = computed(() => (a.value?.registrations || []).filter((r) => r.status === 'queued'))

async function load() {
  a.value = await api.getActivity(id.value)
}

function goReg() {
  uni.navigateTo({ url: `/pages/activity/register?id=${id.value}` })
}

async function cancel() {
  if (!(await confirm('确定取消报名？取消后若重新报名，需从队伍末尾排起。'))) return
  await api.cancelActivityRegistration({
    activityId: id.value,
    registrationId: a.value.myRegistration?._id
  })
  toast('已取消', 'success')
  load()
}

onLoad((q) => { id.value = q.id })
onShow(() => { if (id.value) load() })
</script>

<style lang="scss" scoped>
.detail-hero {
  background: $hg-hero-gradient;
  color: #fff;
  padding: 32rpx;
}
.h2 { font-size: 40rpx; font-weight: 700; margin-bottom: 12rpx; }
.meta { font-size: 24rpx; opacity: 0.9; line-height: 1.8; }
.list { padding: 8rpx 28rpx 20rpx; }
.line { padding: 20rpx 0; border-bottom: 1rpx solid #F7F8FA; gap: 16rpx; }
.meta { flex: 1; }
.n { font-weight: 600; font-size: 28rpx; }
.s { font-size: 22rpx; color: $hg-text3; }
.qno {
  width: 48rpx; height: 48rpx; border-radius: 50%;
  background: $hg-accent-light; color: $hg-accent-dark;
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 24rpx;
}
</style>
