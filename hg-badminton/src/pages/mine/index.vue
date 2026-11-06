<template>
  <view class="page mine-page">
    <hg-nav title="我的" :back="false" />
    <view class="hero">
      <view class="hero-top">
        <view class="row">
          <view class="hero-avatar">
            <image v-if="avatarUrl" class="hero-img" :src="avatarUrl" mode="aspectFill" />
            <text v-else>{{ letter }}</text>
          </view>
          <view>
            <view class="name">{{ displayName }}</view>
            <view class="phone">{{ phoneLine }}</view>
          </view>
        </view>
        <text v-if="user.loggedIn" class="edit" @click="go('/pages/mine/settings')">编辑</text>
      </view>
      <view class="tags">
        <text v-if="user.isGuest" class="mini">游客浏览</text>
        <text v-for="r in roleTags" :key="r" class="mini">{{ r }}</text>
      </view>
    </view>

    <view v-if="user.isGuest" class="guest-body">
      <view class="pad stretch">
        <view class="stat-panel">
          <view class="stat">
            <view class="num">{{ stats.activityCount }}</view>
            <view class="lbl">参加活动次数</view>
          </view>
          <view class="stat-div" />
          <view class="stat">
            <view class="num">{{ stats.matchCount }}</view>
            <view class="lbl">参加比赛次数</view>
          </view>
        </view>

        <view class="login-block">
          <view class="login-title">登录后同步参赛记录</view>
          <view class="login-desc">报名活动、加入队伍、查看完整数据</view>
          <button class="btn-wx" @click="goLogin">微信登录</button>
        </view>
      </view>
    </view>

    <view v-else class="pad">
      <view class="stat-panel logged">
        <view class="stat">
          <view class="num">{{ stats.activityCount }}</view>
          <view class="lbl">参加活动次数</view>
        </view>
        <view class="stat-div" />
        <view class="stat">
          <view class="num">{{ stats.matchCount }}</view>
          <view class="lbl">参加比赛次数</view>
        </view>
      </view>

      <view class="menu-list">
        <view class="menu-item" @click="go('/pages/mine/notify')">
          <view class="mi" style="background:#E8F3FB;">🔔</view>
          <view class="lt">消息通知</view>
          <view class="rs">›</view>
        </view>
        <view v-if="user.isReferee" class="menu-item" @click="go('/pages/mine/referee')">
          <view class="mi" style="background:#FFF3E6;">⚡</view>
          <view class="lt">我执裁的场次</view>
          <view class="rs">›</view>
        </view>
        <view v-if="user.isSuper" class="menu-item" @click="go('/pages/mine/approve')">
          <view class="mi" style="background:#FFF3E6;">✅</view>
          <view class="lt">成员审核</view>
          <view class="rs">待审新用户 ›</view>
        </view>
        <view v-if="user.isAdmin" class="menu-item" @click="go('/pages/mine/groups')">
          <view class="mi" style="background:#E8F3FB;">🚩</view>
          <view class="lt">组别管理</view>
          <view class="rs">A队 / B队等 ›</view>
        </view>
        <view v-if="user.assignable.length" class="menu-item" @click="go('/pages/mine/users')">
          <view class="mi" style="background:#FDE9E9;">👨‍💼</view>
          <view class="lt">角色与组别</view>
          <view class="rs">指定角色/组别 ›</view>
        </view>
        <view v-if="user.isAdmin" class="menu-item" @click="go('/pages/activity/create')">
          <view class="mi" style="background:#EEF2FF;">📅</view>
          <view class="lt">日常活动管理</view>
          <view class="rs">发布 / 修改 ›</view>
        </view>
        <view v-if="user.isAdmin" class="menu-item" @click="go('/pages/match/create')">
          <view class="mi" style="background:#F0EFFF;">🏆</view>
          <view class="lt">比赛管理</view>
          <view class="rs">发布 / 修改 ›</view>
        </view>
        <view v-if="user.isAdmin" class="menu-item" @click="go('/pages/mine/web-login')">
          <view class="mi" style="background:#E8F3FB;">💻</view>
          <view class="lt">网页后台登录</view>
          <view class="rs">扫码确认 ›</view>
        </view>
        <view class="menu-item" @click="go('/pages/mine/settings')">
          <view class="mi" style="background:#F0F1F3;">⚙️</view>
          <view class="lt">设置</view>
          <view class="rs">›</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { roleLabel, maskPhone, initial } from '@/utils/format'
import { guardAppAccess } from '@/utils/nav'

const user = useUserStore()
const stats = reactive({ activityCount: 0, matchCount: 0 })
const letter = computed(() => initial(user.profile?.realName || user.profile?.nickname || '游'))
const avatarUrl = computed(() => user.profile?.avatar || '')
const displayName = computed(() => {
  if (user.isGuest) return '游客'
  return user.profile?.realName || user.profile?.nickname || '未登录'
})
const phoneLine = computed(() => {
  if (user.isGuest) return '浏览模式 · 登录后可报名'
  return `${maskPhone(user.profile?.phone) || '未绑定手机'} · ${user.profile?.department || '未填部门'}`
})
const roleTags = computed(() => (user.profile?.roles || []).map(roleLabel))

function go(url) {
  if (!user.loggedIn) {
    goLogin()
    return
  }
  uni.navigateTo({ url })
}

function goLogin() {
  uni.navigateTo({ url: '/pages/login/index' })
}

async function loadStats() {
  const s = await api.getMyStats()
  stats.activityCount = s.activityCount || 0
  stats.matchCount = s.matchCount || 0
}

onShow(async () => {
  if (!guardAppAccess()) return
  await loadStats()
})
</script>

<style lang="scss" scoped>
.mine-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}
.hero {
  background: $hg-hero-gradient;
  border-radius: 0 0 40rpx 40rpx;
  padding: 12rpx 28rpx 40rpx;
  color: #fff;
  flex-shrink: 0;
}
.hero-top { display: flex; justify-content: space-between; align-items: center; }
.hero-avatar {
  width: 104rpx; height: 104rpx; border-radius: 50%;
  background: rgba(255,255,255,0.25);
  display: flex; align-items: center; justify-content: center;
  font-size: 48rpx; margin-right: 24rpx;
  overflow: hidden;
}
.hero-img {
  width: 100%;
  height: 100%;
  display: block;
}
.name { font-size: 36rpx; font-weight: 700; }
.phone { font-size: 22rpx; opacity: 0.85; margin-top: 4rpx; }
.edit { font-size: 22rpx; opacity: 0.8; }
.tags { display: flex; gap: 12rpx; margin-top: 24rpx; flex-wrap: wrap; }
.mini {
  background: rgba(255,255,255,0.25);
  border-radius: 12rpx;
  padding: 6rpx 16rpx;
  font-size: 22rpx;
}

.guest-body {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.stretch {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-bottom: calc(48rpx + env(safe-area-inset-bottom));
}

.stat-panel {
  background: #fff;
  border-radius: 28rpx;
  padding: 48rpx 24rpx;
  display: flex;
  align-items: center;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
  margin-bottom: 32rpx;
}
.stat-panel.logged {
  padding: 36rpx 24rpx;
  margin-bottom: 24rpx;
}
.stat {
  flex: 1;
  text-align: center;
}
.stat-div {
  width: 1rpx;
  height: 72rpx;
  background: $hg-line;
}
.num {
  font-size: 56rpx;
  font-weight: 800;
  color: $hg-primary;
  line-height: 1.1;
}
.lbl {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: $hg-text2;
}

.login-block {
  background: #fff;
  border-radius: 28rpx;
  padding: 40rpx 36rpx 36rpx;
  text-align: center;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
}
.login-title {
  font-size: 32rpx;
  font-weight: 700;
  color: $hg-text;
}
.login-desc {
  margin-top: 12rpx;
  font-size: 24rpx;
  color: $hg-text3;
  line-height: 1.5;
}
.btn-wx {
  margin-top: 36rpx;
  width: 100%;
  height: 92rpx;
  border-radius: 46rpx;
  background: $hg-primary;
  color: #fff;
  font-size: 30rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  box-shadow: 0 12rpx 28rpx rgba(0, 109, 184, 0.28);
}
.btn-wx::after { border: none; }

.menu-list { background: #fff; border-radius: 28rpx; overflow: hidden; }
.menu-item {
  display: flex;
  align-items: center;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid #F7F8FA;
}
.mi {
  width: 64rpx; height: 64rpx; border-radius: 16rpx;
  display: flex; align-items: center; justify-content: center;
  margin-right: 20rpx; font-size: 28rpx;
}
.lt { flex: 1; font-size: 28rpx; }
.rs { color: $hg-text3; font-size: 24rpx; }
</style>
