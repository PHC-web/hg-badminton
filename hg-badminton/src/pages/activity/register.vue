<template>
  <view class="page">
    <hg-nav title="活动报名" />
    <view class="pad" v-if="ready">
      <view class="seg">
        <view class="seg-item" :class="{ active: !proxy }" @click="setProxy(false)">本人报名</view>
        <view class="seg-item" :class="{ active: proxy }" @click="setProxy(true)">代别人报名</view>
      </view>
      <view class="field"><text class="field-label">真实姓名<text class="req">*</text></text>
        <input class="input" :class="{ locked: !proxy }" v-model="form.name" :disabled="!proxy" />
      </view>
      <view class="field"><text class="field-label">手机号<text class="req">*</text></text>
        <input class="input" :class="{ locked: !proxy }" v-model="form.phone" type="number" :disabled="!proxy" />
      </view>
      <view class="field"><text class="field-label">部门</text>
        <input class="input" :class="{ locked: !proxy }" v-model="form.department" :disabled="!proxy" :placeholder="proxy ? '填写一次后会记住' : ''" />
      </view>
      <view v-if="proxy && contacts.length" class="section-title">常用报名人员</view>
      <view v-if="proxy" class="contacts">
        <view v-for="(c,i) in contacts" :key="i" class="c" @click="pick(c)">{{ c.name }} · {{ c.phone }}</view>
      </view>
      <button class="btn-primary" :loading="submitting" @click="submit">确认报名</button>
    </view>

    <view v-if="captcha.open" class="mask" @touchmove.stop.prevent>
      <view class="sheet">
        <view class="sheet-title">拖动滑块，对准缺口</view>
        <view class="board">
          <image class="board-img" :src="captcha.image" mode="widthFix" @load="measureBoard" />
          <image class="piece" :src="captcha.pieceImage" mode="scaleToFill" :style="pieceStyle" />
        </view>
        <view class="track" @touchstart="onStart" @touchmove.stop.prevent="onMove" @touchend="onEnd">
          <view class="track-fill" :style="{ width: captcha.left + 'px' }" />
          <view class="knob" :style="knobStyle">↔</view>
        </view>
        <view class="sheet-ops">
          <text class="op" @click="closeCaptcha">取消</text>
          <text class="op" @click="loadChallenge">换一张</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref, computed, getCurrentInstance } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'
import { activityIdFromQuery, isInviteEntry, saveInviteReturn, takeInviteReturn } from '@/utils/invite'

const user = useUserStore()
const inst = getCurrentInstance()
const id = ref('')
const proxy = ref(false)
const fromInvite = ref(false)
const ready = ref(false)
const submitting = ref(false)
const form = reactive({ name: '', phone: '', department: '' })
const captcha = reactive({
  open: false,
  id: '',
  image: '',
  pieceImage: '',
  width: 300,
  height: 156,
  piece: 56,
  boardW: 0,
  left: 0
})
const contacts = computed(() => user.profile?.contacts || [])
const piecePx = computed(() => (captcha.boardW && captcha.width ? (captcha.boardW * captcha.piece) / captcha.width : 56))
const pieceStyle = computed(() => ({
  width: piecePx.value + 'px',
  height: piecePx.value + 'px',
  transform: `translate(${captcha.left}px, -50%)`
}))
const knobStyle = computed(() => ({
  width: piecePx.value + 'px',
  transform: `translateX(${captcha.left}px)`
}))
let drag = null

function fillForm() {
  form.name = user.profile?.realName || user.profile?.nickname || ''
  form.phone = user.profile?.phone || ''
  form.department = user.profile?.department || ''
}

function setProxy(next) {
  proxy.value = next
  if (!next) fillForm()
}

function signupFields() {
  if (proxy.value) {
    return {
      name: String(form.name || '').trim(),
      phone: String(form.phone || '').replace(/\D/g, ''),
      department: form.department || ''
    }
  }
  return {
    name: String(user.profile?.realName || user.profile?.nickname || '').trim(),
    phone: String(user.profile?.phone || '').replace(/\D/g, ''),
    department: user.profile?.department || ''
  }
}

function deny() {
  takeInviteReturn()
  setTimeout(() => uni.switchTab({ url: '/pages/activity/index' }), 1200)
}

onLoad(async (q) => {
  id.value = activityIdFromQuery(q)
  fromInvite.value = isInviteEntry(q)
  if (!id.value) {
    toast('活动不存在')
    setTimeout(() => uni.switchTab({ url: '/pages/activity/index' }), 600)
    return
  }
  if (!user.loggedIn || user.needProfile || user.needApproval) {
    saveInviteReturn(id.value)
    uni.reLaunch({ url: '/pages/login/index' })
    return
  }
  fillForm()
  try {
    await api.getActivity(id.value)
    takeInviteReturn()
    ready.value = true
  } catch (e) {
    const msg = e?.message || ''
    if (msg.includes('暂不可报名') || msg.includes('组别')) deny()
    else {
      setTimeout(() => {
        uni.navigateBack({ fail: () => uni.switchTab({ url: '/pages/activity/index' }) })
      }, 600)
    }
  }
})

function pick(c) {
  form.name = c.name
  form.phone = c.phone
  form.department = c.department || ''
}

async function submit() {
  const fields = signupFields()
  if (!fields.name || !/^1\d{10}$/.test(fields.phone)) {
    toast(proxy.value ? '请填写姓名和正确的手机号' : '请先在个人资料中完善姓名和手机号')
    return
  }
  if (fromInvite.value) {
    await doRegister()
    return
  }
  await loadChallenge()
}

function measureBoard() {
  uni.createSelectorQuery()
    .in(inst.proxy)
    .select('.board')
    .boundingClientRect((rect) => {
      captcha.boardW = rect?.width || 0
    })
    .exec()
}

async function loadChallenge() {
  captcha.left = 0
  const pack = await api.createRegisterChallenge({ activityId: id.value })
  captcha.id = pack.challengeId
  captcha.width = pack.width || 300
  captcha.height = pack.height || 156
  captcha.piece = pack.piece || 56
  captcha.image = pack.image
  captcha.pieceImage = pack.pieceImage || ''
  captcha.open = true
}

function closeCaptcha() {
  captcha.open = false
  drag = null
}

function maxLeft() {
  return Math.max(0, captcha.boardW - piecePx.value)
}

function onStart(e) {
  const t = e.touches && e.touches[0]
  if (!t || submitting.value) return
  drag = { x: t.clientX, left: captcha.left }
}

function onMove(e) {
  if (!drag) return
  const t = e.touches && e.touches[0]
  if (!t) return
  const next = drag.left + (t.clientX - drag.x)
  captcha.left = Math.min(maxLeft(), Math.max(0, next))
}

function onEnd() {
  if (!drag || submitting.value) return
  drag = null
  if (captcha.left < 8) return
  const sliderX = captcha.boardW ? (captcha.left / captcha.boardW) * captcha.width : 0
  doRegister(sliderX)
}

async function doRegister(sliderX) {
  if (submitting.value) return
  submitting.value = true
  try {
    const fields = signupFields()
    const rec = await api.registerActivity({
      activityId: id.value,
      name: fields.name,
      phone: fields.phone,
      department: fields.department,
      isProxy: proxy.value,
      fromInvite: fromInvite.value,
      challengeId: captcha.id,
      sliderX
    })
    captcha.open = false
    const p = await api.getProfile()
    user.persist(p)
    toast(rec.status === 'queued' ? '已进入候补队列' : '报名成功', 'success')
    setTimeout(() => {
      if (fromInvite.value) uni.redirectTo({ url: `/pages/activity/detail?id=${id.value}` })
      else uni.navigateBack()
    }, 400)
  } catch (e) {
    const msg = e?.message || ''
    if (!fromInvite.value && /滑块|验证|缺口/.test(msg)) {
      captcha.left = 0
      loadChallenge().catch(() => {})
    }
  } finally {
    submitting.value = false
  }
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
.input.locked {
  color: $hg-text2;
  background: #f3f5f8;
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
.mask {
  position: fixed;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  background: rgba(16, 24, 40, 0.45);
  z-index: 30;
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  background: #fff;
  border-radius: 28rpx 28rpx 0 0;
  padding: 32rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
}
.sheet-title {
  font-size: 32rpx;
  font-weight: 700;
  margin-bottom: 24rpx;
}
.board {
  position: relative;
  width: 100%;
}
.board-img {
  width: 100%;
  display: block;
  border-radius: 16rpx;
}
.piece {
  position: absolute;
  left: 0;
  top: 50%;
  background: transparent;
}
.track {
  position: relative;
  height: 80rpx;
  margin-top: 24rpx;
  background: #e7f2fb;
  border-radius: 40rpx;
  overflow: hidden;
}
.track-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: #b9dcf3;
}
.knob {
  position: absolute;
  left: 0;
  top: 0;
  height: 80rpx;
  background: $hg-primary;
  color: #fff;
  border-radius: 40rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 700;
}
.sheet-ops {
  display: flex;
  justify-content: space-between;
  margin-top: 24rpx;
}
.op {
  color: $hg-primary;
  font-size: 26rpx;
}
</style>
