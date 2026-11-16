<template>
  <view class="page">
    <hg-nav title="资料修改审核" />
    <view class="pad">
      <view class="rule-box">通过后，姓名、手机号和部门才会改成新内容。拒绝后仍使用原来的资料。</view>
      <hg-loading v-if="loading && !list.length" />
      <view v-for="item in list" :key="item._id" class="card item">
        <view class="n">{{ item.userName || '未命名' }}</view>
        <view class="line"><text class="k">姓名</text>{{ item.prevRealName || '未填' }} → {{ item.realName || '未填' }}</view>
        <view class="line"><text class="k">手机号</text>{{ item.prevPhone || '未填' }} → {{ item.phone || '未填' }}</view>
        <view class="line"><text class="k">部门</text>{{ item.prevDepartment || '未填' }} → {{ item.department || '未填' }}</view>
        <view class="ops">
          <button class="btn reject" @click="reject(item)">拒绝</button>
          <button class="btn ok" @click="pass(item)">通过</button>
        </view>
      </view>
      <hg-empty v-if="!loading && !list.length" text="暂无待审核的资料修改" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { confirm, toast } from '@/utils/format'

const user = useUserStore()
const list = ref([])
const loading = ref(false)

async function load() {
  loading.value = true
  try {
    list.value = (await api.listProfileChanges()) || []
  } finally {
    loading.value = false
  }
}

async function pass(item) {
  if (!(await confirm(`确定通过「${item.userName || '该成员'}」的资料修改？`))) return
  await api.reviewProfileChange({ id: item._id, approved: true })
  toast('已通过', 'success')
  if (item.userId === user.profile?._id) await user.refreshProfile()
  load()
}

async function reject(item) {
  if (!(await confirm(`确定拒绝「${item.userName || '该成员'}」的资料修改？`))) return
  await api.reviewProfileChange({ id: item._id, approved: false, reason: '未通过审核' })
  toast('已拒绝')
  load()
}

onShow(async () => {
  if (!user.isAdmin) {
    toast('需要管理员权限')
    setTimeout(() => uni.navigateBack(), 400)
    return
  }
  await load()
})
</script>

<style lang="scss" scoped>
.item {
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.n {
  font-weight: 700;
  font-size: 30rpx;
  margin-bottom: 16rpx;
}
.line {
  font-size: 26rpx;
  color: $hg-text2;
  line-height: 1.7;
}
.k {
  display: inline-block;
  width: 96rpx;
  color: $hg-text3;
}
.ops {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
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
  background: #f7f8fa;
  color: $hg-text2;
}
.ok {
  background: $hg-primary;
  color: #fff;
}
</style>
