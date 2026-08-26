<template>
  <view class="page">
    <hg-nav title="活动报名" />
    <view class="pad">
      <view class="seg">
        <view class="seg-item" :class="{ active: !proxy }" @click="proxy=false">本人报名</view>
        <view class="seg-item" :class="{ active: proxy }" @click="proxy=true">代别人报名</view>
      </view>
      <view class="field"><text class="field-label">真实姓名<text class="req">*</text></text>
        <input class="input" v-model="form.name" />
      </view>
      <view class="field"><text class="field-label">手机号<text class="req">*</text></text>
        <input class="input" v-model="form.phone" type="number" />
      </view>
      <view class="field"><text class="field-label">部门</text>
        <input class="input" v-model="form.department" placeholder="填写一次后会记住" />
      </view>
      <view v-if="proxy && contacts.length" class="section-title">常用报名人员</view>
      <view v-if="proxy" class="contacts">
        <view v-for="(c,i) in contacts" :key="i" class="c" @click="pick(c)">{{ c.name }} · {{ c.phone }}</view>
      </view>
      <button class="btn-primary" @click="submit">确认报名</button>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'

const user = useUserStore()
const id = ref('')
const proxy = ref(false)
const form = reactive({ name: '', phone: '', department: '' })
const contacts = computed(() => user.profile?.contacts || [])

onLoad((q) => {
  id.value = q.id
  form.name = user.profile?.realName || user.profile?.nickname || ''
  form.phone = user.profile?.phone || ''
  form.department = user.profile?.department || ''
})

function pick(c) {
  form.name = c.name
  form.phone = c.phone
  form.department = c.department || ''
}

async function submit() {
  const rec = await api.registerActivity({
    activityId: id.value,
    name: form.name,
    phone: form.phone,
    department: form.department,
    isProxy: proxy.value
  })
  // 刷新本地用户（记忆部门）
  const p = await api.getProfile()
  user.persist(p)
  toast(rec.status === 'queued' ? '已进入候补队列' : '报名成功', 'success')
  setTimeout(() => uni.navigateBack(), 400)
}
</script>

<style lang="scss" scoped>
.seg {
  display: flex;
  background: #EDEEF1;
  border-radius: 20rpx;
  padding: 6rpx;
  margin-bottom: 28rpx;
}
.seg-item {
  flex: 1;
  text-align: center;
  padding: 16rpx 0;
  border-radius: 16rpx;
  font-size: 26rpx;
  color: $hg-text2;
}
.seg-item.active {
  background: #fff;
  color: $hg-primary;
  font-weight: 600;
}
.contacts { display: flex; flex-direction: column; gap: 12rpx; margin-bottom: 24rpx; }
.c {
  background: #fff;
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
  font-size: 26rpx;
  color: $hg-primary;
  box-shadow: 0 4rpx 20rpx rgba(16,24,40,0.05);
}
</style>
