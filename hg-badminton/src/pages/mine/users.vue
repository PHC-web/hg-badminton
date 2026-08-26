<template>
  <view class="page">
    <hg-nav title="角色管理" />
    <view class="pad">
      <view class="rule-box">
        点击用户可调整角色或所属组别。角色：{{ user.isSuper ? '管理员、裁判、队长、队员' : '裁判、队长、队员' }}。
      </view>
      <view v-for="u in list" :key="u._id" class="card item" @click="edit(u)">
        <view class="row">
          <hg-avatar :name="u.realName || u.nickname" :src="u.avatar" />
          <view class="meta">
            <view class="n">{{ u.realName || u.nickname }} · {{ maskPhone(u.phone) }}</view>
            <view class="s">{{ (u.roles || []).map(roleLabel).join(' / ') }}</view>
            <view class="s">组别：{{ (u.groupNames || []).join('、') || '未分配' }}</view>
          </view>
          <text class="go">调整 ›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { ROLES } from '@/utils/constants'
import { roleLabel, maskPhone, toast } from '@/utils/format'

const user = useUserStore()
const list = ref([])
const groups = ref([])

async function load() {
  list.value = await api.listUsers()
  groups.value = await api.listGroups()
}

function edit(u) {
  const items = ['调整角色', '调整组别']
  if (user.isSuper && !(u.roles || []).includes('super_admin') && u._id !== user.profile?._id) {
    items.push('删除人员')
  }
  uni.showActionSheet({
    itemList: items,
    success: (res) => {
      if (res.tapIndex === 0) editRoles(u)
      else if (res.tapIndex === 1) editGroups(u)
      else if (res.tapIndex === 2) removeUser(u)
    }
  })
}

async function removeUser(u) {
  const name = u.realName || u.nickname || '该用户'
  const ok = await new Promise((resolve) => {
    uni.showModal({
      title: '确认删除',
      content: `确定删除「${name}」？原记录保留；对方再次登录需重新填写资料并经超管审核后启用新账号。`,
      success: (r) => resolve(!!r.confirm)
    })
  })
  if (!ok) return
  try {
    await api.deleteUser({ userId: u._id })
    toast('已删除')
    load()
  } catch (e) {
    toast(e?.message || '删除失败')
  }
}

function editRoles(u) {
  const allow = user.assignable
  if (!allow.length) return
  const labels = allow.map((k) => {
    const has = (u.roles || []).includes(k)
    return `${has ? '取消' : '授予'} ${ROLES[k].label}`
  })
  uni.showActionSheet({
    itemList: labels,
    success: async (res) => {
      const role = allow[res.tapIndex]
      let roles = [...(u.roles || [])]
      if (roles.includes(role)) roles = roles.filter((x) => x !== role)
      else roles.push(role)
      if (!roles.includes('member')) roles.push('member')
      if (!roles.length) roles = ['member']
      await api.setUserRoles({ userId: u._id, roles })
      toast('已更新')
      load()
    }
  })
}

function editGroups(u) {
  if (!groups.value.length) {
    toast('请先创建组别')
    uni.navigateTo({ url: '/pages/mine/groups' })
    return
  }
  const labels = groups.value.map((g) => {
    const has = (u.groupIds || []).includes(g._id)
    return `${has ? '移出' : '加入'} ${g.name}`
  })
  uni.showActionSheet({
    itemList: labels,
    success: async (res) => {
      const g = groups.value[res.tapIndex]
      let groupIds = [...(u.groupIds || [])]
      if (groupIds.includes(g._id)) groupIds = groupIds.filter((x) => x !== g._id)
      else groupIds.push(g._id)
      await api.setUserGroups({ userId: u._id, groupIds })
      toast('已更新')
      load()
    }
  })
}

onShow(load)
</script>

<style lang="scss" scoped>
.item { padding: 28rpx; margin-bottom: 16rpx; }
.meta { flex: 1; margin-left: 16rpx; }
.n { font-weight: 600; }
.s { font-size: 22rpx; color: $hg-text3; margin-top: 4rpx; }
.go { font-size: 24rpx; color: $hg-primary; }
</style>
