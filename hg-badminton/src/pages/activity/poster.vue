<template>
  <view class="page">
    <hg-nav title="邀请海报" />
    <view class="pad">
      <view v-if="loading" class="wait">正在生成…</view>
      <canvas type="2d" id="poster" class="poster" :class="{ show: drawn }" />
      <button class="btn-primary" :disabled="!drawn" @click="save">保存到相册</button>
    </view>
  </view>
</template>

<script setup>
import { getCurrentInstance, nextTick, ref } from 'vue'
import { onLoad, onReady } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'
import { mpEnvVersion } from '@/utils/invite'

const user = useUserStore()
const inst = getCurrentInstance()
const id = ref('')
const loading = ref(true)
const drawn = ref(false)
let canvasNode = null
let posterName = '邀请海报'

onLoad((q) => {
  id.value = q.id || ''
})

onReady(async () => {
  if (!user.isAdmin) {
    toast('需要管理员权限')
    setTimeout(() => uni.navigateBack(), 400)
    return
  }
  if (!id.value) {
    toast('活动不存在')
    loading.value = false
    return
  }
  try {
    const pack = await api.activityInviteCode({
      activityId: id.value,
      envVersion: mpEnvVersion()
    })
    posterName = pack.name || posterName
    await nextTick()
    await draw(pack)
    drawn.value = true
  } catch (e) {
    /* api 已提示 */
  } finally {
    loading.value = false
  }
})

function queryCanvas() {
  return new Promise((resolve) => {
    uni.createSelectorQuery()
      .in(inst.proxy)
      .select('#poster')
      .fields({ node: true, size: true })
      .exec((res) => resolve(res && res[0]))
  })
}

function clockText(iso) {
  const m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/)
  if (!m) return ''
  return `${m[1]}.${m[2]}.${m[3]} ${m[4]}:${m[5]}`
}

function wrapText(ctx, text, maxWidth) {
  const chars = Array.from(String(text || ''))
  const lines = []
  let line = ''
  chars.forEach((ch) => {
    const next = line + ch
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = ch
    } else line = next
  })
  if (line) lines.push(line)
  return lines.slice(0, 2)
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function qrPath(dataUrl) {
  const raw = String(dataUrl || '')
  // #ifdef H5
  return raw
  // #endif
  // #ifndef H5
  const body = raw.replace(/^data:image\/\w+;base64,/, '')
  const root = uni.env && uni.env.USER_DATA_PATH
  if (!root) return raw
  const path = `${root}/hg-invite-qr.png`
  uni.getFileSystemManager().writeFileSync(path, body, 'base64')
  return path
  // #endif
}

function loadImage(canvas, src) {
  return new Promise((resolve, reject) => {
    const img = canvas.createImage()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

async function draw(pack) {
  let box = await queryCanvas()
  if (!box || !box.width) {
    await new Promise((r) => setTimeout(r, 60))
    box = await queryCanvas()
  }
  if (!box?.node || !box.width) throw new Error('海报画布未就绪')
  const canvas = box.node
  canvasNode = canvas
  const dpr = uni.getSystemInfoSync().pixelRatio || 2
  canvas.width = box.width * dpr
  canvas.height = box.height * dpr
  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const w = box.width
  const h = box.height

  ctx.fillStyle = '#E7F2FB'
  ctx.fillRect(0, 0, w, h)
  ctx.fillStyle = '#006DB8'
  ctx.fillRect(0, 0, w, 108)
  ctx.fillStyle = '#ffffff'
  ctx.font = '600 18px sans-serif'
  ctx.textAlign = 'center'
  ctx.fillText('追光羽毛球', w / 2, 48)
  ctx.font = '14px sans-serif'
  ctx.fillText('活动邀请', w / 2, 76)

  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 16, 84, w - 32, h - 108, 18)
  ctx.fill()

  ctx.fillStyle = '#1A2332'
  ctx.font = '700 20px sans-serif'
  ctx.textAlign = 'center'
  const nameLines = wrapText(ctx, pack.name || '日常活动', w - 72)
  nameLines.forEach((line, i) => ctx.fillText(line, w / 2, 128 + i * 28))

  ctx.fillStyle = '#4A5563'
  ctx.font = '14px sans-serif'
  const timeTop = 128 + nameLines.length * 28 + 8
  const start = clockText(pack.startTime)
  const end = clockText(pack.endTime)
  const timeLine = end && end.slice(11) !== start.slice(11) ? `${start} - ${end.slice(11)}` : start
  if (timeLine) ctx.fillText(timeLine, w / 2, timeTop)
  if (pack.location) ctx.fillText(pack.location, w / 2, timeTop + 24)

  const qr = await loadImage(canvas, qrPath(pack.qrBase64))
  const size = Math.min(210, w - 96)
  const qx = (w - size) / 2
  const qy = timeTop + 48
  ctx.fillStyle = '#F7F8FA'
  roundRect(ctx, qx - 12, qy - 12, size + 24, size + 24, 12)
  ctx.fill()
  ctx.drawImage(qr, qx, qy, size, size)

  ctx.fillStyle = '#006DB8'
  ctx.font = '600 16px sans-serif'
  ctx.fillText('微信扫码报名', w / 2, qy + size + 36)
}

function exportFile() {
  return new Promise((resolve, reject) => {
    uni.canvasToTempFilePath(
      {
        canvas: canvasNode,
        destWidth: canvasNode.width,
        destHeight: canvasNode.height,
        success: (r) => resolve(r.tempFilePath),
        fail: reject
      },
      inst.proxy
    )
  })
}

async function save() {
  if (!canvasNode) return
  try {
    const filePath = await exportFile()
    // #ifdef H5
    const a = document.createElement('a')
    a.href = filePath
    a.download = `${posterName}.png`
    a.click()
    toast('已开始下载', 'success')
    return
    // #endif
    // #ifndef H5
    await new Promise((resolve, reject) => {
      uni.saveImageToPhotosAlbum({ filePath, success: resolve, fail: reject })
    })
    toast('已保存到相册', 'success')
    // #endif
  } catch (e) {
    const msg = e?.errMsg || e?.message || ''
    if (/auth|deny|authorize/i.test(msg)) {
      uni.showModal({
        title: '需要相册权限',
        content: '请允许保存到相册后再试',
        confirmText: '去设置',
        success: (r) => {
          if (r.confirm) uni.openSetting({})
        }
      })
      return
    }
    toast('保存失败')
  }
}
</script>

<style lang="scss" scoped>
.pad { display: flex; flex-direction: column; align-items: center; }
.wait { color: $hg-text3; font-size: 26rpx; margin-bottom: 16rpx; }
.poster {
  width: 640rpx;
  height: 1000rpx;
  border-radius: 24rpx;
  margin-bottom: 28rpx;
  opacity: 0;
}
.poster.show { opacity: 1; }
.btn-primary { width: 640rpx; }
</style>
