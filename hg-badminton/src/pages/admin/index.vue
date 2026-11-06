<template>
  <view class="shell hg-admin">
    <view class="side">
      <view class="brand">🏸 追光后台</view>
      <view
        v-for="n in navs"
        :key="n.key"
        class="nav"
        :class="{ on: tab === n.key }"
        @click="tab = n.key"
      >{{ n.label }}</view>
      <view class="who">{{ user.profile?.realName || user.profile?.nickname }}</view>
      <view class="out" @click="logout">退出登录</view>
    </view>
    <view class="main">
      <admin-dashboard v-if="tab === 'home'" />
      <admin-activities v-else-if="tab === 'activities'" />
      <admin-matches v-else-if="tab === 'matches'" />
      <admin-users v-else-if="tab === 'users'" />
      <admin-groups v-else-if="tab === 'groups'" />
    </view>
  </view>
</template>

<script setup>
import { ref } from 'vue'
// #ifdef H5
import '@/admin/admin-h5.scss'
// #endif
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import AdminDashboard from '@/admin/views/dashboard.vue'
import AdminActivities from '@/admin/views/activities.vue'
import AdminMatches from '@/admin/views/matches.vue'
import AdminUsers from '@/admin/views/users.vue'
import AdminGroups from '@/admin/views/groups.vue'

const user = useUserStore()
const tab = ref('home')
const navs = [
  { key: 'home', label: '总览' },
  { key: 'activities', label: '日常活动' },
  { key: 'matches', label: '比赛' },
  { key: 'users', label: '用户与审核' },
  { key: 'groups', label: '组别' }
]

onShow(() => {
  user.restore()
  if (!user.loggedIn || !user.isAdmin) {
    uni.reLaunch({ url: '/pages/admin/login' })
  }
})

function logout() {
  user.logout()
  uni.reLaunch({ url: '/pages/admin/login' })
}
</script>

<style lang="scss" scoped>
.shell {
  min-height: 100vh;
  display: flex;
  background: #f3f6f9;
}
.side {
  width: 220px;
  flex-shrink: 0;
  background: #0b3d66;
  color: #fff;
  padding: 20px 14px;
  box-sizing: border-box;
}
.brand { font-size: 20px; font-weight: 800; padding: 8px 10px 20px; }
.nav {
  padding: 12px 12px;
  border-radius: 8px;
  font-size: 16px;
  color: #fff;
  margin-bottom: 4px;
}
.nav.on { background: rgba(255, 255, 255, 0.18); color: #fff; font-weight: 700; }
.who { margin-top: 32px; font-size: 14px; color: #d6eaf8; padding: 0 12px; }
.out { padding: 10px 12px; font-size: 15px; color: #9ad0f5; }
.main { flex: 1; padding: 24px 28px; min-width: 0; font-size: 16px; color: #1a2332; }
</style>
