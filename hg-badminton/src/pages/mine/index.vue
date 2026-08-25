<template>
  <view class="page">
    <hg-nav title="我的" :back="false" />
    <view class="hero">
      <view class="hero-top">
        <view class="row">
          <view class="hero-avatar">{{ letter }}</view>
          <view>
            <view class="name">{{ user.profile?.nickname || '未登录' }}</view>
            <view class="phone">{{ phone }} · {{ user.profile?.verified ? '已实名' : '未实名' }}</view>
          </view>
        </view>
        <text class="edit" @click="go('/pages/mine/settings')">编辑资料</text>
      </view>
      <view class="tags">
        <text v-for="r in roleTags" :key="r" class="mini">{{ r }}</text>
      </view>
    </view>
    <view class="pad">
      <view class="section-title">
        角色模拟
        <text style="font-size: 22rpx; color: #9AA1A9; font-weight: 400;">切换查看不同身份入口</text>
      </view>
      <view class="role-switch">
        <view
          v-for="r in ROLE_LIST"
          :key="r.key"
          class="role-btn"
          :class="{ on: user.profile?.viewRole === r.key }"
          @click="switchRole(r.key)"
        >{{ r.icon }} {{ r.label }}</view>
      </view>
      <view class="section-title">常用功能</view>
      <view class="menu-list">
        <view class="menu-item" @click="go('/pages/mine/matches')">
          <view class="mi" style="background: #E6F7F0;">🏸</view>
          <view class="lt">我报名的比赛</view>
          <view class="rs">›</view>
        </view>
        <view class="menu-item" @click="go('/pages/mine/referee')">
          <view class="mi" style="background: #FFF1E8;">⚡</view>
          <view class="lt">我执裁的场次</view>
          <view class="rs">›</view>
        </view>
        <view class="menu-item" @click="goTeam">
          <view class="mi" style="background: #EEF2FF;">🚩</view>
          <view class="lt">我的队伍</view>
          <view class="rs">›</view>
        </view>
        <view class="menu-item" @click="go('/pages/mine/photos')">
          <view class="mi" style="background: #FDF2E3;">📷</view>
          <view class="lt">我上传的照片</view>
          <view class="rs">›</view>
        </view>
        <view class="menu-item" @click="go('/pages/mine/apply')">
          <view class="mi" style="background: #E8F5E9;">📝</view>
          <view class="lt">角色申请</view>
          <view class="rs">申请裁判/队长 ›</view>
        </view>
        <view v-if="user.isAdmin" class="menu-item" @click="go('/pages/match/create')">
          <view class="mi" style="background: #F0EFFF;">🛡️</view>
          <view class="lt">创建比赛（管理）</view>
          <view class="rs">›</view>
        </view>
        <view v-if="user.isAdmin" class="menu-item" @click="go('/pages/mine/apply-manage')">
          <view class="mi" style="background: #E8F5E9;">✅</view>
          <view class="lt">角色申请审核</view>
          <view class="rs">›</view>
        </view>
        <view v-if="user.isSuper" class="menu-item" @click="go('/pages/mine/users')">
          <view class="mi" style="background: #FDE9E9;">👨‍💼</view>
          <view class="lt">管理员 / 裁判管理（超管）</view>
          <view class="rs">›</view>
        </view>
        <view class="menu-item" @click="go('/pages/mine/settings')">
          <view class="mi" style="background: #F0F1F3;">⚙️</view>
          <view class="lt">设置</view>
          <view class="rs">›</view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/stores/user'
import { useMatchStore } from '@/stores/match'
import { ROLE_LIST } from '@/utils/constants'
import { roleLabel, maskPhone, initial, toast } from '@/utils/format'

const user = useUserStore()
const match = useMatchStore()
const letter = computed(() => initial(user.profile?.nickname || '追'))
const phone = computed(() => maskPhone(user.profile?.phone) || '未绑定手机')
const roleTags = computed(() => (user.profile?.roles || []).map(roleLabel))

async function switchRole(role) {
  await user.switchRole(role)
  toast('已切换为「' + roleLabel(role) + '」视角')
}

function go(url) {
  if (!user.loggedIn) {
    uni.navigateTo({ url: '/pages/login/index' })
    return
  }
  uni.navigateTo({ url })
}

function goTeam() {
  if (!match.selectedId) {
    toast('请先在首页选择一场比赛')
    return
  }
  uni.navigateTo({ url: `/pages/register/index?id=${match.selectedId}` })
}

onShow(() => {
  if (!user.loggedIn) uni.navigateTo({ url: '/pages/login/index' })
})
</script>

<style lang="scss" scoped>
.hero {
  background: linear-gradient(135deg, #00B87A, #006B48);
  border-radius: 0 0 40rpx 40rpx;
  padding: 12rpx 28rpx 40rpx;
  color: #fff;
}
.hero-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.hero-avatar {
  width: 104rpx;
  height: 104rpx;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  margin-right: 24rpx;
}
.name {
  font-size: 36rpx;
  font-weight: 700;
}
.phone {
  font-size: 22rpx;
  opacity: 0.85;
  margin-top: 4rpx;
}
.edit {
  font-size: 22rpx;
  opacity: 0.8;
}
.tags {
  display: flex;
  gap: 12rpx;
  margin-top: 24rpx;
  flex-wrap: wrap;
}
.mini {
  background: rgba(255, 255, 255, 0.25);
  border-radius: 12rpx;
  padding: 6rpx 18rpx;
  font-size: 22rpx;
}
.role-switch {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.role-btn {
  border: 3rpx solid $hg-line;
  background: #fff;
  border-radius: 40rpx;
  padding: 14rpx 28rpx;
  font-size: 26rpx;
  color: $hg-text2;
}
.role-btn.on {
  border-color: $hg-primary;
  background: $hg-primary-light;
  color: $hg-primary-deep;
  font-weight: 600;
}
.menu-list {
  background: #fff;
  border-radius: 28rpx;
  overflow: hidden;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
}
.menu-item {
  display: flex;
  align-items: center;
  padding: 28rpx 32rpx;
  border-bottom: 1rpx solid #F7F8FA;
}
.mi {
  width: 56rpx;
  height: 56rpx;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  margin-right: 24rpx;
}
.lt {
  flex: 1;
  font-size: 28rpx;
}
.rs {
  color: $hg-text3;
  font-size: 24rpx;
}
</style>
