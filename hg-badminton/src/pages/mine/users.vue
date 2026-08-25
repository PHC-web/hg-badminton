<template>
  <view class="page">
    <hg-nav title="账号管理" />
    <view class="pad">
      <view v-for="u in list" :key="u._id" class="card item" @click="edit(u)">
        <view class="row">
          <hg-avatar :name="u.nickname" />
          <view class="meta">
            <view class="n">{{ u.nickname }}</view>
            <view class="s">{{ (u.roles || []).map(roleLabel).join(' / ') }}</view>
          </view>
          <text class="go">指定角色 ›</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { ROLE_LIST } from '@/utils/constants'
import { roleLabel, toast } from '@/utils/format'

const list = ref([])
async function load() {
  list.value = await api.listUsers()
}
function edit(u) {
  uni.showActionSheet({
    itemList: ROLE_LIST.map((r) => (u.roles || []).includes(r.key) ? `取消 ${r.label}` : `授予 ${r.label}`),
    success: async (res) => {
      const role = ROLE_LIST[res.tapIndex].key
      let roles = [...(u.roles || [])]
      if (roles.includes(role)) roles = roles.filter((x) => x !== role)
      else roles.push(role)
      if (!roles.length) roles = ['member']
      await api.setUserRoles({ userId: u._id, roles })
      toast('已更新角色')
      load()
    }
  })
}
onShow(load)
</script>

<style lang="scss" scoped>
.item {
  padding: 28rpx;
  margin-bottom: 16rpx;
}
.meta {
  flex: 1;
  margin-left: 16rpx;
}
.n {
  font-weight: 600;
}
.s {
  font-size: 22rpx;
  color: $hg-text3;
}
.go {
  font-size: 24rpx;
  color: $hg-primary;
}
</style>
