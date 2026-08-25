<template>
  <view class="page login">
    <view class="hero" :style="{ paddingTop: bar + 40 + 'px' }">
      <view class="logo">🏸</view>
      <view class="app">追光羽毛球</view>
      <view class="sub">比赛创建 · 报名 · 对阵 · 记分 · 赛果</view>
    </view>
    <view class="pad">
      <view class="card box">
        <view class="tip">选择体验身份，立即进入演示数据</view>
        <view class="demo" v-for="d in demos" :key="d.id" @click="enter(d.id)">
          <hg-avatar :name="d.name" />
          <view class="meta">
            <view class="n">{{ d.name }}</view>
            <view class="r">{{ d.role }}</view>
          </view>
          <text class="go">进入 ›</text>
        </view>
      </view>
      <button class="btn-ghost" style="margin-top: 24rpx;" @click="guest">以队员身份进入</button>
      <view class="foot">第一版支持微信小程序与 H5 · 关联 uniCloud 后可切换云端数据</view>
    </view>
  </view>
</template>

<script setup>
import { useUserStore } from '@/stores/user'
import { useMatchStore } from '@/stores/match'
import { toast } from '@/utils/format'

const sys = uni.getSystemInfoSync()
const bar = sys.statusBarHeight || 0
const user = useUserStore()
const match = useMatchStore()

const demos = [
  { id: 'u_lin', name: '林教练', role: '超级管理员 / 全角色' },
  { id: 'u_li', name: '李飞', role: '队长 · 飞羽俱乐部' },
  { id: 'u_wang', name: '王浩然', role: '裁判' },
  { id: 'u_zhang', name: '张思雨', role: '队员' }
]

async function enter(id) {
  await user.loginDemo(id)
  await match.refreshList()
  toast('登录成功', 'success')
  uni.switchTab({ url: '/pages/index/index' })
}

async function guest() {
  await user.loginDemo('u_zhang')
  await match.refreshList()
  uni.switchTab({ url: '/pages/index/index' })
}
</script>

<style lang="scss" scoped>
.login {
  min-height: 100vh;
  background: $hg-bg;
}
.hero {
  background: linear-gradient(135deg, #00B87A, #006B48);
  color: #fff;
  text-align: center;
  padding: 80rpx 40rpx 80rpx;
  border-radius: 0 0 48rpx 48rpx;
}
.logo {
  font-size: 88rpx;
}
.app {
  font-size: 48rpx;
  font-weight: 800;
  margin-top: 12rpx;
}
.sub {
  font-size: 24rpx;
  opacity: 0.85;
  margin-top: 12rpx;
}
.box {
  padding: 28rpx;
  margin-top: -20rpx;
}
.tip {
  font-size: 24rpx;
  color: $hg-text2;
  margin-bottom: 16rpx;
}
.demo {
  display: flex;
  align-items: center;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #F7F8FA;
}
.meta {
  flex: 1;
  margin-left: 16rpx;
}
.n {
  font-size: 30rpx;
  font-weight: 600;
}
.r {
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 4rpx;
}
.go {
  color: $hg-primary;
  font-size: 24rpx;
}
.foot {
  text-align: center;
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 40rpx;
  line-height: 1.6;
}
</style>
