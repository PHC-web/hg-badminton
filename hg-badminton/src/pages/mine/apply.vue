<template>
  <view class="page">
    <hg-nav title="角色申请" />
    <view class="pad">
      <view class="card info">
        <view>您当前身份：<text class="em">{{ current }}</text></view>
        <view>可申请以下角色，管理员审核通过后生效。每位用户可同时持有多个角色。</view>
      </view>
      <view class="section-title">选择申请角色</view>
      <hg-option
        v-for="r in options"
        :key="r.key"
        :title="r.icon + ' ' + r.label"
        :desc="r.desc"
        :selected="form.applyRole === r.key"
        @click="form.applyRole = r.key"
      />
      <view class="field" style="margin-top: 28rpx;">
        <text class="field-label">申请理由 / 相关资质<text class="req">*</text></text>
        <textarea class="textarea" v-model="form.extra" placeholder="如：持有国家二级裁判证书…" style="min-height: 160rpx;" />
      </view>
      <view class="field">
        <text class="field-label">联系方式（选填）</text>
        <input class="input" v-model="form.phone" placeholder="便于管理员联系确认" />
      </view>
      <view class="card rec">
        <view class="rt">📋 我的申请记录</view>
        <view v-for="a in records" :key="a._id" class="rr">
          <view>
            <text class="rn">{{ label(a.applyRole) }}</text>
            <hg-chip :text="st(a).label" :type="st(a).chip" />
          </view>
          <text class="rd">{{ a.createdAt?.slice(5, 10) }}</text>
        </view>
        <view v-if="!records.length" class="rd">暂无申请记录</view>
      </view>
      <button class="btn-primary" @click="submit">提交申请</button>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { roleLabel, applyStatus, toast } from '@/utils/format'

const user = useUserStore()
const records = ref([])
const form = reactive({ applyRole: 'referee', extra: '', phone: '' })
const current = computed(() => (user.profile?.roles || []).map(roleLabel).join(' / ') || '普通队员')
const options = [
  { key: 'referee', icon: '⚡', label: '裁判', desc: '可执裁比赛场次、实时记分、确认赛果' },
  { key: 'captain', icon: '🚩', label: '队长', desc: '可创建队伍、报名参赛、填报单项名单' },
  { key: 'member', icon: '🏸', label: '队员', desc: '可加入队伍、查看对阵与赛果、上传照片' }
]

function label(k) {
  return roleLabel(k)
}
function st(a) {
  return applyStatus(a.status)
}

async function load() {
  records.value = await api.listMyApplications()
}

async function submit() {
  if (!form.extra) {
    toast('请填写申请理由')
    return
  }
  await api.applyRole({
    applyRole: form.applyRole,
    extra: form.extra,
    phone: form.phone,
    name: user.profile?.nickname
  })
  toast('申请已提交，等待审核', 'success')
  form.extra = ''
  load()
}

onShow(load)
</script>

<style lang="scss" scoped>
.info {
  padding: 28rpx;
  margin-bottom: 24rpx;
  font-size: 26rpx;
  color: $hg-text2;
  line-height: 1.6;
}
.em {
  color: $hg-primary;
  font-weight: 600;
}
.rec {
  padding: 24rpx 28rpx;
  margin-bottom: 24rpx;
}
.rt {
  font-size: 24rpx;
  font-weight: 600;
  margin-bottom: 16rpx;
}
.rr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #F7F8FA;
}
.rn {
  font-size: 26rpx;
  font-weight: 600;
  margin-right: 12rpx;
}
.rd {
  font-size: 22rpx;
  color: $hg-text3;
}
</style>
