<template>
  <view class="page">
    <hg-nav title="队伍报名" />
    <view class="pad">
      <view class="field"><text class="field-label">队名<text class="req">*</text></text>
        <input class="input" v-model="form.name" />
      </view>
      <view class="field"><text class="field-label">部门<text class="req">*</text></text>
        <input class="input" v-model="form.department" />
      </view>
      <view class="field"><text class="field-label">队伍宣言</text>
        <input class="input" v-model="form.slogan" placeholder="选填" />
      </view>
      <view class="section-title">
        <text>队员（{{ form.members.length }}）</text>
        <text class="section-more" @click="showAdd=true">＋ 添加</text>
      </view>
      <view class="card" style="padding: 8rpx 28rpx;">
        <view v-for="(mb,i) in form.members" :key="mb.id || i" class="row line">
          <view class="meta">
            <view class="n">{{ mb.name }} · {{ mb.gender==='female'?'女':'男' }}</view>
            <view class="s">{{ mb.phone }} · {{ mb.job || '未填岗位' }} · {{ mb.status }}</view>
          </view>
        </view>
      </view>
      <button class="btn-primary" style="margin-top: 28rpx;" @click="save">保存队伍</button>
    </view>

    <view v-if="showAdd" class="mask" @click.self="showAdd=false">
      <view class="sheet">
        <view class="h3">录入队员</view>
        <view class="field"><text class="field-label">姓名*</text><input class="input" v-model="nm.name" /></view>
        <view class="field"><text class="field-label">手机号*</text><input class="input" v-model="nm.phone" /></view>
        <view class="field"><text class="field-label">性别</text>
          <view class="row" style="gap:16rpx;">
            <view class="opt" :class="{on: nm.gender==='male'}" @click="nm.gender='male'">男</view>
            <view class="opt" :class="{on: nm.gender==='female'}" @click="nm.gender='female'">女</view>
          </view>
        </view>
        <view class="field"><text class="field-label">身份证号</text><input class="input" v-model="nm.idCard" /></view>
        <view class="field"><text class="field-label">岗位</text><input class="input" v-model="nm.job" /></view>
        <button class="btn-primary" @click="add">确认</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'

const user = useUserStore()
const matchId = ref('')
const showAdd = ref(false)
const form = reactive({ _id: '', name: '', department: '', slogan: '', members: [] })
const nm = reactive({ name: '', phone: '', gender: 'male', idCard: '', job: '' })

onLoad(async (q) => {
  matchId.value = q.id
  form.department = user.profile?.department || ''
  const t = await api.getMyTeam(matchId.value)
  if (t) {
    Object.assign(form, {
      _id: t._id,
      name: t.name,
      department: t.department,
      slogan: t.slogan || '',
      members: t.members || []
    })
  }
})

function add() {
  if (!nm.name || !nm.phone) {
    toast('请填写姓名手机号')
    return
  }
  form.members.push({
    id: 'mb_' + Date.now(),
    userId: '',
    name: nm.name,
    phone: nm.phone,
    gender: nm.gender,
    idCard: nm.idCard,
    job: nm.job,
    status: 'active'
  })
  showAdd.value = false
  Object.assign(nm, { name: '', phone: '', gender: 'male', idCard: '', job: '' })
}

async function save() {
  await api.saveTeam({
    _id: form._id,
    matchId: matchId.value,
    name: form.name,
    department: form.department,
    slogan: form.slogan,
    members: form.members
  })
  toast('已保存', 'success')
  uni.navigateBack()
}
</script>

<style lang="scss" scoped>
.line { padding: 20rpx 0; border-bottom: 1rpx solid #F7F8FA; }
.meta { flex: 1; }
.n { font-weight: 600; }
.s { font-size: 22rpx; color: $hg-text3; }
.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  z-index: 50; display: flex; align-items: flex-end;
}
.sheet {
  background: #fff; width: 100%; border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx 32rpx 52rpx;
}
.h3 { font-size: 32rpx; font-weight: 600; margin-bottom: 20rpx; }
.opt {
  flex: 1; text-align: center; padding: 20rpx;
  border: 3rpx solid $hg-line; border-radius: 20rpx;
}
.opt.on { border-color: $hg-primary; background: $hg-primary-light; }
</style>
