<template>
  <view class="page">
    <hg-nav title="我的队伍 · 报名" />
    <view class="pad" v-if="match">
      <view class="card team-head">
        <view class="field" style="margin-bottom: 20rpx;">
          <text class="field-label">队名<text class="req">*</text></text>
          <input class="input" v-model="form.name" placeholder="请输入队名" :disabled="locked" />
        </view>
        <view class="row" style="justify-content: space-between;">
          <text style="font-size: 26rpx; color: #5B6470;">队员名单（{{ form.members.length }} 人）</text>
          <text v-if="!locked" style="font-size: 24rpx; color: #00A870;" @click="showAdd = true">＋ 添加队员</text>
        </view>
        <view v-if="form.registerStatus" style="margin-top: 12rpx;">
          <hg-chip :text="st.label" :type="st.chip" />
          <text v-if="form.rejectReason" style="font-size: 22rpx; color: #C73E44; margin-left: 12rpx;">{{ form.rejectReason }}</text>
        </view>
      </view>
      <view class="card" style="margin-top: 20rpx; padding: 8rpx 28rpx;">
        <view v-for="(mb, i) in form.members" :key="i" class="member-row">
          <hg-avatar :name="mb.name" />
          <view>
            <view class="mn">{{ mb.name }}{{ mb.isCaptain ? ' · 队长' : '' }}</view>
            <view class="ms">{{ mb.gender === 'female' ? '女' : '男' }} · {{ mask(mb.phone) }}</view>
          </view>
          <view style="flex: 1;"></view>
          <hg-chip :text="mb.claimed ? '已认领' : '未认领'" :type="mb.claimed ? 'green' : 'gray'" />
        </view>
        <hg-empty v-if="!form.members.length" text="请添加队员" />
      </view>
      <view class="section-title">单项参赛名单</view>
      <view class="item-slot" v-for="it in match.items" :key="it._id" @click="pickItem(it)">
        <view>
          <view class="n">{{ it.name }}</view>
          <view class="s">需 {{ it.memberCount }} 人</view>
        </view>
        <view class="right">{{ lineupText(it) }} ›</view>
      </view>
      <view v-if="!locked" class="row" style="gap: 20rpx; margin-top: 28rpx;">
        <button class="btn-ghost" @click="save(false)">存草稿</button>
        <button class="btn-primary" @click="save(true)">提交报名</button>
      </view>
    </view>

    <view v-if="showAdd" class="mask" @click.self="showAdd = false">
      <view class="sheet">
        <view class="bar"></view>
        <view class="h3">添加队员</view>
        <view class="field"><text class="field-label">姓名<text class="req">*</text></text>
          <input class="input" v-model="nm.name" placeholder="请输入队员姓名" />
        </view>
        <view class="field"><text class="field-label">性别<text class="req">*</text></text>
          <view class="row" style="gap: 20rpx;">
            <view class="opt" :class="{ on: nm.gender === 'male' }" @click="nm.gender = 'male'">男</view>
            <view class="opt" :class="{ on: nm.gender === 'female' }" @click="nm.gender = 'female'">女</view>
          </view>
        </view>
        <view class="field"><text class="field-label">手机号<text class="req">*</text></text>
          <input class="input" v-model="nm.phone" type="number" placeholder="用于邀请队员认领" />
        </view>
        <view class="row" style="gap: 20rpx;">
          <button class="btn-ghost" @click="showAdd = false">取消</button>
          <button class="btn-primary" @click="addMember">确认添加</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { teamStatus, maskPhone, toast } from '@/utils/format'

const user = useUserStore()
const matchId = ref('')
const match = ref(null)
const showAdd = ref(false)
const form = reactive({ name: '', members: [], lineup: {}, registerStatus: 'draft', rejectReason: '', _id: '' })
const nm = reactive({ name: '', gender: 'male', phone: '' })
const st = computed(() => teamStatus(form.registerStatus))
const locked = computed(() => form.registerStatus === 'submitted' || form.registerStatus === 'approved')

function mask(p) {
  return maskPhone(p)
}

function lineupText(it) {
  const ids = form.lineup[it._id] || []
  if (!ids.length) return '待选择'
  return ids
    .map((id) => form.members.find((m) => m.userId === id)?.name)
    .filter(Boolean)
    .join('、') || '待选择'
}

async function load() {
  match.value = await api.getMatch(matchId.value)
  const t = await api.getMyTeam(matchId.value)
  if (t) {
    Object.assign(form, {
      _id: t._id,
      name: t.name,
      members: t.members || [],
      lineup: t.lineup || {},
      registerStatus: t.registerStatus,
      rejectReason: t.rejectReason || ''
    })
  } else if (user.profile) {
    form.members = [
      {
        userId: user.profile._id,
        name: user.profile.nickname,
        gender: user.profile.gender || 'male',
        phone: user.profile.phone,
        claimed: true,
        isCaptain: true
      }
    ]
  }
}

function addMember() {
  if (!nm.name || !nm.phone) {
    toast('请填写姓名和手机号')
    return
  }
  form.members.push({
    userId: 'local_' + Date.now(),
    name: nm.name,
    gender: nm.gender,
    phone: nm.phone,
    claimed: false
  })
  nm.name = ''
  nm.phone = ''
  showAdd.value = false
}

function pickItem(it) {
  if (locked.value) return
  const names = form.members.map((m) => m.name)
  if (!names.length) {
    toast('请先添加队员')
    return
  }
  uni.showActionSheet({
    itemList: names,
    success: (res) => {
      const mb = form.members[res.tapIndex]
      const cur = form.lineup[it._id] || []
      if (cur.includes(mb.userId)) {
        form.lineup[it._id] = cur.filter((x) => x !== mb.userId)
      } else {
        const next = [...cur, mb.userId].slice(0, it.memberCount)
        form.lineup = { ...form.lineup, [it._id]: next }
      }
    }
  })
}

async function save(submit) {
  if (!form.name) {
    toast('请填写队名')
    return
  }
  await api.saveTeam({
    _id: form._id,
    matchId: matchId.value,
    name: form.name,
    members: form.members,
    lineup: form.lineup,
    submit
  })
  toast(submit ? '报名已提交，等待审核' : '已保存草稿', 'success')
  if (submit) setTimeout(() => uni.navigateBack(), 400)
  else load()
}

onLoad((q) => {
  matchId.value = q.id
  load()
})
</script>

<style lang="scss" scoped>
.team-head {
  padding: 32rpx;
}
.member-row {
  display: flex;
  align-items: center;
  gap: 20rpx;
  padding: 20rpx 0;
  border-bottom: 1rpx solid #F7F8FA;
}
.mn {
  font-size: 28rpx;
  font-weight: 600;
}
.ms {
  font-size: 22rpx;
  color: $hg-text3;
}
.item-slot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-radius: 24rpx;
  padding: 24rpx 28rpx;
  box-shadow: 0 4rpx 20rpx rgba(16, 24, 40, 0.05);
  margin-bottom: 16rpx;
}
.n {
  font-size: 28rpx;
  font-weight: 600;
}
.s {
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 4rpx;
}
.right {
  color: $hg-primary;
  font-size: 24rpx;
}
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  z-index: 50;
  display: flex;
  align-items: flex-end;
}
.sheet {
  background: #fff;
  width: 100%;
  border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx 32rpx 52rpx;
}
.bar {
  width: 72rpx;
  height: 8rpx;
  background: #E6E8EB;
  border-radius: 4rpx;
  margin: 0 auto 24rpx;
}
.h3 {
  font-size: 32rpx;
  font-weight: 600;
  margin-bottom: 24rpx;
}
.opt {
  flex: 1;
  text-align: center;
  padding: 20rpx;
  border: 3rpx solid $hg-line;
  border-radius: 24rpx;
}
.opt.on {
  border-color: $hg-primary;
  background: $hg-primary-light;
}
</style>
