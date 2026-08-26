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
      <view class="section-title">账号</view>
      <view class="menu-list">
        <view class="menu-item" @click="logout">
          <view class="lt" style="color:#C73E44;">退出登录</view>
        </view>
      </view>
      <view class="ver">追光羽毛球</view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast, initial } from '@/utils/format'
import { uploadUserAvatar } from '@/utils/upload'

const user = useUserStore()
const uploading = ref(false)
const saving = ref(false)
const form = reactive({ realName: '', phone: '', department: '', avatar: '' })

const letter = computed(() => initial(form.realName || user.profile?.nickname || '我'))

onShow(() => {
  form.realName = user.profile?.realName || ''
  form.phone = user.profile?.phone || ''
  form.department = user.profile?.department || ''
  form.avatar = user.profile?.avatar || ''
})

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
.menu-item { display: flex; padding: 28rpx 32rpx; border-bottom: 1rpx solid #F7F8FA; }
.lt { flex: 1; }
.ver {
  text-align: center;
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 40rpx;
  line-height: 1.7;
}
</style>
