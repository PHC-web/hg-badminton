<template>
  <view class="page">
    <hg-nav title="成员审核" />
    <view class="pad">
      <view class="rule-box">审核通过时必须选择组别；已设置的默认组别会自动勾选，可改选。</view>

      <hg-loading v-if="loading && !list.length" />

      <view v-for="u in list" :key="u._id" class="card item">
        <view class="row top">
          <hg-avatar :name="u.realName || u.nickname" :src="u.avatar" />
          <view class="meta">
            <view class="n">{{ u.realName || u.nickname }}</view>
            <view class="s">{{ maskPhone(u.phone) }} · {{ u.department || '未填部门' }}</view>
          </view>
        </view>

        <view class="label">分配组别</view>
        <view class="chips">
          <view
            v-for="g in groups"
            :key="g._id"
            class="chip"
            :class="{ on: (selected[u._id] || []).includes(g._id) }"
            @click="toggle(u._id, g._id)"
          >
            {{ g.name }}
            <text v-if="g.isDefault" class="def">默认</text>
          </view>
        </view>
        <view v-if="!groups.length" class="empty-g">暂无组别，请先在组别管理中创建</view>

        <view class="ops">
          <button class="btn reject" @click="reject(u)">拒绝</button>
          <button class="btn ok" @click="pass(u)">通过</button>
        </view>
      </view>

      <hg-empty v-if="!list.length" text="暂无待审核成员" />
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { maskPhone, toast, confirm } from '@/utils/format'

const list = ref([])
const groups = ref([])
const selected = reactive({})
const defaultGroupId = ref('')

async function load() {
  const [pending, gs, def] = await Promise.all([
    api.listPendingUsers(),
    api.listGroups(),
    api.getDefaultGroup()
  ])
  groups.value = gs || []
  defaultGroupId.value = def?._id || gs?.find((g) => g.isDefault)?._id || ''
  list.value = pending || []
  list.value.forEach((u) => {
    if (!selected[u._id]) {
      selected[u._id] = defaultGroupId.value ? [defaultGroupId.value] : []
    }
  })
}

function toggle(userId, gid) {
  const cur = selected[userId] || []
  if (cur.includes(gid)) selected[userId] = cur.filter((x) => x !== gid)
  else selected[userId] = [...cur, gid]
}

async function pass(u) {
  const groupIds = selected[u._id] || []
  if (!groupIds.length) {
    toast('请选择组别')
    return
  }
  await api.approveUser({ userId: u._id, approved: true, groupIds })
  // 同步本地组别（活动过滤依赖本地库）
  try {
    await api.setUserGroups({ userId: u._id, groupIds })
  } catch (e) {
    /* 云端已写 groupIds 时本地可能已 sync */
  }
  toast('已通过', 'success')
  delete selected[u._id]
  load()
}

async function reject(u) {
  if (!(await confirm(`确定拒绝「${u.realName || u.nickname}」的申请？`))) return
  await api.approveUser({ userId: u._id, approved: false, reason: '未通过审核' })
  toast('已拒绝')
  delete selected[u._id]
  load()
}

onShow(load)
</script>

<style lang="scss" scoped>
.item {
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.top {
  margin-bottom: 20rpx;
}
.meta {
  flex: 1;
  margin-left: 16rpx;
}
.n {
  font-weight: 700;
  font-size: 30rpx;
}
.s {
  font-size: 24rpx;
  color: $hg-text3;
  margin-top: 6rpx;
}
.label {
  font-size: 24rpx;
  color: $hg-text2;
  margin-bottom: 12rpx;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.chip {
  padding: 12rpx 22rpx;
  border-radius: 24rpx;
  background: #F3F6F9;
  font-size: 24rpx;
  color: $hg-text2;
}
.chip.on {
  background: $hg-primary-light;
  color: $hg-primary-deep;
  font-weight: 600;
}
.def {
  margin-left: 6rpx;
  font-size: 20rpx;
  opacity: 0.8;
}
.empty-g {
  font-size: 24rpx;
  color: $hg-lose;
  margin-top: 8rpx;
}
.ops {
  display: flex;
  gap: 16rpx;
  margin-top: 28rpx;
}
.btn {
  flex: 1;
  height: 80rpx;
  border-radius: 40rpx;
  font-size: 28rpx;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
}
.btn::after {
  border: none;
}
.reject {
  background: #F7F8FA;
  color: $hg-text2;
}
.ok {
  background: $hg-primary;
  color: #fff;
}
</style>
