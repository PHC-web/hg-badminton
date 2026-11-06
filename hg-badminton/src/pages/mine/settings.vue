<template>
  <view class="page">
    <hg-nav title="设置" />
    <view class="pad">
      <view class="card form">
        <view class="avatar-block">
          <view class="avatar-wrap">
            <image v-if="form.avatar" class="avatar-img" :src="form.avatar" mode="aspectFill" />
            <view v-else class="avatar-letter">{{ letter }}</view>
          </view>
          <view class="avatar-actions">
            <!-- #ifdef MP-WEIXIN -->
            <button class="avatar-btn" open-type="chooseAvatar" @chooseavatar="onChooseWxAvatar">
              使用微信头像
            </button>
            <!-- #endif -->
            <button class="avatar-btn ghost" :loading="uploading" @click="pickFromAlbum">从相册上传</button>
            <text v-if="form.avatar" class="clear" @click="clearAvatar">清除头像</text>
          </view>
        </view>

        <view class="field">
          <text class="field-label">真实姓名</text>
          <input class="input" v-model="form.realName" />
        </view>
        <view class="field">
          <text class="field-label">手机号<text class="req">*</text></text>
          <input class="input" v-model="form.phone" type="number" />
        </view>
        <view class="field">
          <text class="field-label">部门</text>
          <input class="input" v-model="form.department" />
        </view>
        <button class="btn-primary" :loading="saving" @click="save">保存资料</button>
      </view>

      <template v-if="devEnv">
        <view class="section-title">数据模式</view>
        <view class="menu-list">
          <view class="menu-item mode-row">
            <view class="lt">
              <view>运行模式</view>
              <view class="mode-desc">{{ modeDesc }}</view>
            </view>
            <view class="mode-switch">
              <text class="mode-chip" :class="{ on: dataMode === 'cloud' }" @click="switchMode('cloud')">云端</text>
              <text class="mode-chip" :class="{ on: dataMode === 'local' }" @click="switchMode('local')">本地</text>
            </view>
          </view>
        </view>
      </template>

      <view class="section-title">账号</view>
      <view class="menu-list">
        <view class="menu-item" @click="logout">
          <view class="lt" style="color:#C73E44;">退出登录</view>
        </view>
      </view>
      <view class="ver">追光羽毛球<text v-if="devEnv"> · {{ dataMode === 'local' ? '本地模拟' : '云端' }}</text></view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast, initial, confirm } from '@/utils/format'
import { uploadUserAvatar } from '@/utils/upload'
import { USE_LOCAL_SIM } from '@/utils/constants'
import { isDevEnv } from '@/utils/data-mode'

const user = useUserStore()
const uploading = ref(false)
const saving = ref(false)
const dataMode = ref(api.getDataMode())
const devEnv = isDevEnv()
const form = reactive({ realName: '', phone: '', department: '', avatar: '' })

const letter = computed(() => initial(form.realName || user.profile?.nickname || '我'))
const modeDesc = computed(() => {
  if (USE_LOCAL_SIM) return '编译期已强制本地（USE_LOCAL_SIM=true）'
  return dataMode.value === 'local'
    ? '全部业务走本机存储，适合离线调试'
    : '全部业务走 uniCloud，不写本地业务库'
})

onShow(() => {
  dataMode.value = api.getDataMode()
  form.realName = user.profile?.realName || ''
  form.phone = user.profile?.phone || ''
  form.department = user.profile?.department || ''
  form.avatar = user.profile?.avatar || ''
})

async function switchMode(mode) {
  if (mode === dataMode.value) return
  if (USE_LOCAL_SIM && mode !== 'local') {
    toast('编译期已强制本地模拟')
    return
  }
  const tip =
    mode === 'local'
      ? '切换到本地模拟后，所有数据读写本机，不再访问云端。是否继续？'
      : '切换到云端后，将使用 uniCloud 数据。是否继续？'
  if (!(await confirm(tip))) return
  try {
    api.setDataMode(mode)
    dataMode.value = mode
    if (mode === 'local') {
      try {
        await api.seedDemo(false)
      } catch (e) {
        /* ignore */
      }
    }
    toast(mode === 'local' ? '已切换到本地模拟' : '已切换到云端', 'success')
    user.logout()
    setTimeout(() => uni.reLaunch({ url: '/pages/login/index' }), 400)
  } catch (e) {
    toast(e?.message || '切换失败')
  }
}

async function setAvatarFromPath(filePath) {
  if (!filePath) return
  uploading.value = true
  try {
    const url = await uploadUserAvatar(filePath, user.profile?._id || 'u')
    form.avatar = url
    toast('头像已更新，请保存资料', 'success')
  } catch (e) {
    toast(e?.message || '头像上传失败')
  } finally {
    uploading.value = false
  }
}

function onChooseWxAvatar(e) {
  const url = e?.detail?.avatarUrl
  if (url) setAvatarFromPath(url)
}

function pickFromAlbum() {
  uni.chooseImage({
    count: 1,
    sizeType: ['compressed'],
    sourceType: ['album', 'camera'],
    success: (res) => {
      const path = res.tempFilePaths && res.tempFilePaths[0]
      if (path) setAvatarFromPath(path)
    }
  })
}

function clearAvatar() {
  form.avatar = ''
}

async function save() {
  if (!form.phone) {
    toast('手机号必填')
    return
  }
  if (!/^1\d{10}$/.test(form.phone)) {
    toast('手机号格式不正确')
    return
  }
  saving.value = true
  try {
    const p = await api.updateProfile({
      realName: form.realName,
      phone: form.phone,
      department: form.department,
      nickname: form.realName || user.profile?.nickname,
      avatar: form.avatar || ''
    })
    user.persist(p)
    toast('已保存', 'success')
  } finally {
    saving.value = false
  }
}

function logout() {
  user.logout()
  uni.reLaunch({ url: '/pages/login/index' })
}
</script>

<style lang="scss" scoped>
.form { padding: 32rpx; }
.avatar-block {
  display: flex;
  align-items: center;
  gap: 28rpx;
  margin-bottom: 32rpx;
  padding-bottom: 28rpx;
  border-bottom: 1rpx solid #F0F2F5;
}
.avatar-wrap {
  width: 128rpx;
  height: 128rpx;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: $hg-primary-light;
}
.avatar-img {
  width: 100%;
  height: 100%;
  display: block;
}
.avatar-letter {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48rpx;
  font-weight: 700;
  color: $hg-primary-deep;
}
.avatar-actions {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.avatar-btn {
  margin: 0;
  height: 64rpx;
  line-height: 64rpx;
  border-radius: 32rpx;
  font-size: 24rpx;
  font-weight: 600;
  background: $hg-primary;
  color: #fff;
  border: none;
  padding: 0 20rpx;
}
.avatar-btn.ghost {
  background: $hg-primary-light;
  color: $hg-primary-deep;
}
.avatar-btn::after { border: none; }
.clear {
  font-size: 22rpx;
  color: $hg-text3;
  padding-left: 8rpx;
}
.menu-list { background: #fff; border-radius: 28rpx; overflow: hidden; }
.menu-item { display: flex; padding: 28rpx 32rpx; border-bottom: 1rpx solid #F7F8FA; align-items: center; }
.lt { flex: 1; }
.mode-row { align-items: flex-start; }
.mode-desc {
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 8rpx;
  line-height: 1.5;
}
.mode-switch {
  display: flex;
  gap: 12rpx;
  flex-shrink: 0;
}
.mode-chip {
  padding: 10rpx 22rpx;
  border-radius: 999rpx;
  border: 2rpx solid $hg-line;
  font-size: 24rpx;
  color: $hg-text2;
}
.mode-chip.on {
  border-color: $hg-primary;
  color: $hg-primary;
  background: $hg-primary-light;
  font-weight: 600;
}
.ver {
  text-align: center;
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 40rpx;
  line-height: 1.7;
}
</style>
