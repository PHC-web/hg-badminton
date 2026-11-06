<template>
  <view v-if="mode === 'list'">
    <view class="bar">
      <view class="h">日常活动</view>
      <button class="btn" @click="startCreate">发布活动</button>
    </view>
    <view class="table">
      <view class="tr head">
        <text class="c1">活动</text><text class="c2">时间 / 地点</text><text class="c3">人数</text><text class="c4">操作</text>
      </view>
      <view class="tr" v-for="a in list" :key="a._id">
        <text class="c1">{{ a.name }}</text>
        <text class="c2">{{ formatDate(a.startTime, true) }} · {{ a.location }}</text>
        <text class="c3">{{ a.confirmedCount || 0 }}/{{ a.maxCount }}</text>
        <view class="c4 ops">
          <text class="link" @click="startEdit(a)">修改</text>
          <text class="link danger" @click="remove(a)">删除</text>
        </view>
      </view>
      <view v-if="!list.length" class="empty">暂无活动</view>
    </view>
  </view>

  <view v-else class="form">
    <view class="bar">
      <view class="h">{{ editingId ? '修改活动' : '发布活动' }}</view>
      <text class="link" @click="cancel">返回列表</text>
    </view>
    <view class="card">
      <label>活动名称 *</label>
      <input class="inp" v-model="form.name" />
      <label>活动地点 *</label>
      <input class="inp" v-model="form.location" />
      <label>活动日期 *</label>
      <input class="inp" type="date" v-model="form.startDate" />
      <view class="row">
        <view class="col"><label>开始</label><input class="inp" type="time" v-model="form.startTime" /></view>
        <view class="col"><label>结束</label><input class="inp" type="time" v-model="form.endTime" /></view>
      </view>
      <label>人数上限 *</label>
      <input class="inp" type="number" v-model="form.maxCount" />
      <view class="row">
        <view class="col"><label>报名开始日期</label><input class="inp" type="date" v-model="form.registerStartDate" /></view>
        <view class="col"><label>时间</label><input class="inp" type="time" v-model="form.registerStartTime" /></view>
      </view>
      <view class="row">
        <view class="col"><label>报名结束日期</label><input class="inp" type="date" v-model="form.registerEndDate" /></view>
        <view class="col"><label>时间</label><input class="inp" type="time" v-model="form.registerEndTime" /></view>
      </view>
      <label>可报名组别</label>
      <view class="chips">
        <text v-for="g in groups" :key="g._id" class="chip" :class="{ on: form.allowGroupIds.includes(g._id) }" @click="toggle(g._id)">{{ g.name }}</text>
      </view>
      <label>须知</label>
      <textarea class="area" v-model="form.notice" />
      <button class="btn" :loading="saving" @click="submit">{{ editingId ? '保存修改' : '发布活动' }}</button>
    </view>
  </view>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { api } from '@/api'
import { ACTIVITY_PRESET } from '@/utils/constants'
import { activityStatus, confirm, formatDate, toast } from '@/utils/format'

const mode = ref('list')
const list = ref([])
const groups = ref([])
const editingId = ref('')
const saving = ref(false)
const form = reactive({
  name: '',
  location: '',
  startDate: '',
  startTime: '18:00',
  endTime: '20:00',
  maxCount: 14,
  registerStartDate: '',
  registerStartTime: '16:00',
  registerEndDate: '',
  registerEndTime: '18:00',
  allowGroupIds: [],
  notice: '',
  selfRegister: false
})

function pad(n) {
  return `${n}`.padStart(2, '0')
}
function ymd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function toDate(iso) {
  return iso ? String(iso).slice(0, 10) : ''
}
function toTime(iso, fb) {
  const m = String(iso || '').match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : fb
}

async function load() {
  const [acts, gs] = await Promise.all([api.listActivities({}), api.listGroups()])
  list.value = acts || []
  groups.value = gs || []
}

function reset() {
  const now = new Date()
  form.name = ACTIVITY_PRESET.name
  form.location = ACTIVITY_PRESET.location
  form.startDate = ymd(now)
  form.startTime = ACTIVITY_PRESET.startTime
  form.endTime = ACTIVITY_PRESET.endTime
  form.maxCount = ACTIVITY_PRESET.maxCount
  form.registerStartDate = ymd(now)
  form.registerStartTime = '16:00'
  form.registerEndDate = ymd(now)
  form.registerEndTime = ACTIVITY_PRESET.registerEndTime
  form.allowGroupIds = []
  form.notice = ACTIVITY_PRESET.notice
  form.selfRegister = false
}

function startCreate() {
  editingId.value = ''
  reset()
  mode.value = 'form'
}

function startEdit(a) {
  editingId.value = a._id
  form.name = a.name || ''
  form.location = a.location || ''
  form.startDate = toDate(a.startTime)
  form.startTime = toTime(a.startTime, '18:00')
  form.endTime = toTime(a.endTime, '20:00')
  form.maxCount = a.maxCount || 14
  form.registerStartDate = toDate(a.registerStart)
  form.registerStartTime = toTime(a.registerStart, '16:00')
  form.registerEndDate = toDate(a.registerEnd)
  form.registerEndTime = toTime(a.registerEnd, '18:00')
  form.allowGroupIds = [...(a.allowGroupIds || [])]
  form.notice = a.notice || ''
  mode.value = 'form'
}

function cancel() {
  mode.value = 'list'
  editingId.value = ''
}

function toggle(id) {
  const i = form.allowGroupIds.indexOf(id)
  if (i >= 0) form.allowGroupIds.splice(i, 1)
  else form.allowGroupIds.push(id)
}

function payload() {
  return {
    name: form.name.trim(),
    location: form.location.trim(),
    startTime: `${form.startDate}T${form.startTime}:00`,
    endTime: `${form.startDate}T${form.endTime}:00`,
    registerStart: `${form.registerStartDate}T${form.registerStartTime}:00`,
    registerEnd: `${form.registerEndDate}T${form.registerEndTime}:00`,
    maxCount: Number(form.maxCount),
    allowGroupIds: [...form.allowGroupIds],
    notice: form.notice || '',
    selfRegister: false
  }
}

async function submit() {
  if (!form.name.trim() || !form.location.trim()) return toast('请填写名称和地点')
  if (!form.startDate) return toast('请完善活动时间')
  saving.value = true
  try {
    if (editingId.value) await api.updateActivity({ id: editingId.value, ...payload() })
    else await api.createActivity({ ...payload(), publish: true })
    toast('已保存', 'success')
    cancel()
    await load()
  } finally {
    saving.value = false
  }
}

async function remove(a) {
  if (!(await confirm(`删除活动「${a.name}」？`))) return
  await api.deleteActivity({ id: a._id })
  toast('已删除')
  load()
}

onMounted(load)
defineExpose({ activityStatus })
</script>

<style lang="scss" scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.h { font-size: 22px; font-weight: 800; color: #1a2332; }
.btn { height: 40px; padding: 0 16px; background: #006db8; color: #fff; border: none; border-radius: 8px; font-size: 15px; }
.table { background: #fff; border-radius: 12px; overflow: hidden; font-size: 16px; color: #1a2332; }
.tr { display: grid; grid-template-columns: 1.4fr 1.8fr 0.6fr 0.8fr; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f7f8fa; align-items: center; }
.tr.head { font-size: 15px; color: #4a5563; font-weight: 700; }
.ops { display: flex; gap: 12px; }
.link { color: #006db8; font-size: 15px; }
.danger { color: #e5484d; }
.empty { padding: 24px; color: #4a5563; font-size: 16px; }
.form .card { background: #fff; border-radius: 12px; padding: 20px; max-width: 720px; }
label { display: block; font-size: 15px; color: #3d4a57; margin: 12px 0 6px; }
.inp, .area { width: 100%; border: 1px solid #c5d0db; border-radius: 8px; padding: 10px 12px; box-sizing: border-box; font-size: 16px; color: #1a2332; }
.area { min-height: 90px; }
.row { display: flex; gap: 12px; }
.col { flex: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 12px; border: 1px solid #c5d0db; border-radius: 999px; font-size: 15px; color: #1a2332; }
.chip.on { border-color: #006db8; color: #006db8; background: #e8f3fb; }
</style>
