<template>
  <view class="page">
    <hg-nav :title="editingId ? '编辑活动' : '活动管理'" />
    <view class="pad">
      <view v-if="!editingId" class="section-title">
        当前活动
        <text class="section-more" @click="startCreate">＋ 发布新活动</text>
      </view>

      <view v-if="!editingId && !showForm">
        <view v-for="a in list" :key="a._id" class="card item">
          <view class="row top">
            <view class="title">{{ a.name }}</view>
            <hg-chip :text="st(a).label" :type="st(a).chip" />
          </view>
          <view class="meta">📅 {{ time(a) }}　📍 {{ a.location }}</view>
          <view class="meta">👥 {{ a.confirmedCount }}/{{ a.maxCount }} 人
            <text v-if="a.queuedCount"> · 候补 {{ a.queuedCount }}</text>
          </view>
          <view class="ops">
            <text class="link" @click="openDetail(a)">详情</text>
            <text class="link" @click="startEdit(a)">修改</text>
            <text class="link danger" @click="remove(a)">删除</text>
          </view>
        </view>
        <hg-empty v-if="!list.length" text="暂无活动，点击右上角发布" />
      </view>

      <view v-if="showForm || editingId">
        <view v-if="!editingId" class="form-head">
          <text class="form-title">发布新活动</text>
          <text class="link" @click="cancelForm">取消</text>
        </view>
        <view v-else class="form-head">
          <text class="form-title">修改活动</text>
          <text class="link" @click="cancelForm">返回列表</text>
        </view>

        <view v-if="!editingId" class="tpl-bar card">
          <view class="tpl-row">
            <text class="tpl-label">活动模板</text>
            <text class="link" @click="pickTemplate">{{ templates.length ? '选择模板' : '暂无模板' }}</text>
            <text class="link" @click="saveTemplate">保存为模板</text>
          </view>
          <view v-if="activeTplName" class="tpl-tip">已套用「{{ activeTplName }}」· 时间已按下次活动自动更新</view>
        </view>

        <view class="field"><text class="field-label">活动名称<text class="req">*</text></text>
          <input class="input" v-model="form.name" placeholder="如：羽毛球队日常活动" />
        </view>
        <view class="field"><text class="field-label">活动地点<text class="req">*</text></text>
          <input class="input" v-model="form.location" placeholder="如：羽胜羽毛球馆" />
        </view>

        <view class="field"><text class="field-label">活动时间<text class="req">*</text></text>
          <picker mode="date" :value="form.startDate" @change="(e)=>form.startDate=e.detail.value">
            <view class="input picker">日期 {{ form.startDate || '选择' }}</view>
          </picker>
          <view class="time-row">
            <picker mode="time" :value="form.startTime" @change="(e)=>form.startTime=e.detail.value">
              <view class="input picker half">{{ form.startTime || '开始' }}</view>
            </picker>
            <text class="tilde">~</text>
            <picker mode="time" :value="form.endTime" @change="(e)=>form.endTime=e.detail.value">
              <view class="input picker half">{{ form.endTime || '结束' }}</view>
            </picker>
          </view>
        </view>

        <view class="field"><text class="field-label">限制报名人数<text class="req">*</text></text>
          <input class="input" type="number" v-model="form.maxCount" />
        </view>

        <view class="field"><text class="field-label">报名开始</text>
          <picker mode="date" :value="form.registerStartDate" @change="(e)=>form.registerStartDate=e.detail.value">
            <view class="input picker">日期 {{ form.registerStartDate || '选择' }}</view>
          </picker>
          <picker mode="time" :value="form.registerStartTime" @change="(e)=>form.registerStartTime=e.detail.value">
            <view class="input picker" style="margin-top: 12rpx;">时间 {{ form.registerStartTime || '选择' }}</view>
          </picker>
        </view>

        <view class="field"><text class="field-label">报名结束</text>
          <picker mode="date" :value="form.registerEndDate" @change="(e)=>form.registerEndDate=e.detail.value">
            <view class="input picker">日期 {{ form.registerEndDate || '选择' }}</view>
          </picker>
          <picker mode="time" :value="form.registerEndTime" @change="(e)=>form.registerEndTime=e.detail.value">
            <view class="input picker" style="margin-top: 12rpx;">时间 {{ form.registerEndTime || '选择' }}</view>
          </picker>
        </view>

        <view class="section-title">可报名组别</view>
        <view class="hint">仅所选组别的成员能在列表中看到并报名；不选则全体可见。</view>
        <view v-if="!groups.length" class="rule-box">
          暂无组别，请先在「组别管理」中创建。
          <button class="btn-ghost" style="margin-top: 16rpx;" @click="goGroups">去创建组别</button>
        </view>
        <view v-else class="roles">
          <view
            v-for="g in groups"
            :key="g._id"
            class="role"
            :class="{ on: form.allowGroupIds.includes(g._id) }"
            @click="toggle(g._id)"
          >{{ g.name }}</view>
        </view>
        <view class="field" style="margin-top: 24rpx;">
          <text class="field-label">报名须知</text>
          <textarea class="textarea notice" v-model="form.notice" placeholder="活动注意事项…" />
        </view>

        <view v-if="!editingId" class="check-row" @click="form.selfRegister = !form.selfRegister">
          <view class="check" :class="{ on: form.selfRegister }" />
          <view class="check-txt">
            <text class="check-title">本人默认报名</text>
            <text class="check-desc">发布后自动为你报名（需已完善姓名手机号）</text>
          </view>
        </view>

        <button class="btn-primary" :loading="saving" @click="submit">
          {{ editingId ? '保存修改' : '发布活动' }}
        </button>
        <button v-if="!editingId" class="btn-ghost" style="margin-top: 16rpx;" @click="saveTemplate">保存为模板</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { ACTIVITY_PRESET, ACTIVITY_TEMPLATE_KEY } from '@/utils/constants'
import { toast, confirm, activityStatus, formatDate } from '@/utils/format'

const list = ref([])
const groups = ref([])
const templates = ref([])
const showForm = ref(false)
const editingId = ref('')
const saving = ref(false)
const activeTplName = ref('')

const form = reactive({
  name: '',
  location: '',
  startDate: '',
  startTime: '18:00',
  endTime: '20:00',
  maxCount: 14,
  registerStartDate: '',
  registerStartTime: '',
  registerEndDate: '',
  registerEndTime: '18:00',
  allowGroupIds: [],
  notice: '',
  selfRegister: true
})

function pad(n) {
  return `${n}`.padStart(2, '0')
}

function formatYmd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function formatHm(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 下一个周二（含今天若为周二） */
function nextTuesdayDate(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const day = d.getDay()
  const add = (2 - day + 7) % 7
  d.setDate(d.getDate() + add)
  return d
}

function toDateInput(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

function toTimeInput(iso, fallback = '18:00') {
  if (!iso) return fallback
  const s = String(iso)
  const m = s.match(/T(\d{2}):(\d{2})/)
  if (m) return `${m[1]}:${m[2]}`
  return fallback
}

function loadTemplates() {
  try {
    templates.value = uni.getStorageSync(ACTIVITY_TEMPLATE_KEY) || []
  } catch (e) {
    templates.value = []
  }
}

function persistTemplates() {
  uni.setStorageSync(ACTIVITY_TEMPLATE_KEY, templates.value)
}

/** 仅刷新时间相关字段（活动时间 / 报名开始 / 报名结束） */
function applyScheduleDefaults(timeOfDay = {}) {
  const now = new Date()
  const tue = nextTuesdayDate(now)
  const startT = timeOfDay.startTime || ACTIVITY_PRESET.startTime
  const endT = timeOfDay.endTime || ACTIVITY_PRESET.endTime
  const regEndT = timeOfDay.registerEndTime || ACTIVITY_PRESET.registerEndTime
  form.startDate = formatYmd(tue)
  form.startTime = startT
  form.endTime = endT
  form.registerStartDate = formatYmd(now)
  form.registerStartTime = formatHm(now)
  form.registerEndDate = formatYmd(tue)
  form.registerEndTime = regEndT
}

function applyPresetDefaults() {
  form.name = ACTIVITY_PRESET.name
  form.location = ACTIVITY_PRESET.location
  form.maxCount = ACTIVITY_PRESET.maxCount
  form.allowGroupIds = []
  form.notice = ACTIVITY_PRESET.notice
  form.selfRegister = true
  activeTplName.value = ''
  applyScheduleDefaults()
}

function resetForm() {
  applyPresetDefaults()
}

function st(a) {
  return activityStatus(a.status)
}
function time(a) {
  return formatDate(a.startTime, true)
}

async function load() {
  const [acts, gs] = await Promise.all([api.listActivities({}), api.listGroups()])
  list.value = acts || []
  groups.value = gs || []
  loadTemplates()
}

function toggle(id) {
  const i = form.allowGroupIds.indexOf(id)
  if (i >= 0) form.allowGroupIds.splice(i, 1)
  else form.allowGroupIds.push(id)
}

function goGroups() {
  uni.navigateTo({ url: '/pages/mine/groups' })
}

function openDetail(a) {
  uni.navigateTo({ url: `/pages/activity/detail?id=${a._id}` })
}

function startCreate() {
  editingId.value = ''
  resetForm()
  showForm.value = true
}

function startEdit(a) {
  editingId.value = a._id
  showForm.value = true
  activeTplName.value = ''
  form.name = a.name || ''
  form.location = a.location || ''
  form.startDate = toDateInput(a.startTime)
  form.startTime = toTimeInput(a.startTime, ACTIVITY_PRESET.startTime)
  form.endTime = toTimeInput(a.endTime, ACTIVITY_PRESET.endTime)
  form.maxCount = a.maxCount || ACTIVITY_PRESET.maxCount
  form.registerStartDate = toDateInput(a.registerStart)
  form.registerStartTime = toTimeInput(a.registerStart, '00:00')
  form.registerEndDate = toDateInput(a.registerEnd)
  form.registerEndTime = toTimeInput(a.registerEnd, ACTIVITY_PRESET.registerEndTime)
  form.allowGroupIds = [...(a.allowGroupIds || [])]
  form.notice = a.notice || ''
}

function cancelForm() {
  editingId.value = ''
  showForm.value = false
  activeTplName.value = ''
  resetForm()
}

function staticSnapshot() {
  return {
    name: form.name.trim(),
    location: form.location.trim(),
    startTime: form.startTime,
    endTime: form.endTime,
    registerEndTime: form.registerEndTime,
    maxCount: Number(form.maxCount) || ACTIVITY_PRESET.maxCount,
    allowGroupIds: [...form.allowGroupIds],
    notice: form.notice || '',
    selfRegister: !!form.selfRegister
  }
}

function applyTemplate(tpl) {
  form.name = tpl.name || ACTIVITY_PRESET.name
  form.location = tpl.location || ACTIVITY_PRESET.location
  form.maxCount = tpl.maxCount || ACTIVITY_PRESET.maxCount
  form.allowGroupIds = [...(tpl.allowGroupIds || [])]
  form.notice = tpl.notice || ACTIVITY_PRESET.notice
  form.selfRegister = tpl.selfRegister !== false
  activeTplName.value = tpl.title || '未命名模板'
  // 套用模板：静态字段来自模板，时间字段按「当前 → 下一周二」重新计算
  applyScheduleDefaults({
    startTime: tpl.startTime || ACTIVITY_PRESET.startTime,
    endTime: tpl.endTime || ACTIVITY_PRESET.endTime,
    registerEndTime: tpl.registerEndTime || ACTIVITY_PRESET.registerEndTime
  })
  toast('已套用模板', 'success')
}

function pickTemplate() {
  if (!templates.value.length) {
    toast('暂无模板，请先保存')
    return
  }
  uni.showActionSheet({
    itemList: templates.value.map((t) => t.title || '未命名模板'),
    success: (res) => {
      const tpl = templates.value[res.tapIndex]
      if (tpl) applyTemplate(tpl)
    }
  })
}

function saveTemplate() {
  if (!form.name.trim()) {
    toast('请先填写活动名称')
    return
  }
  uni.showModal({
    title: '保存为模板',
    editable: true,
    placeholderText: form.name.trim() || '模板名称',
    success: (res) => {
      if (!res.confirm) return
      const title = (res.content || '').trim() || form.name.trim()
      const snap = staticSnapshot()
      const idx = templates.value.findIndex((t) => t.title === title)
      const row = { _id: idx >= 0 ? templates.value[idx]._id : `tpl_${Date.now()}`, title, ...snap }
      if (idx >= 0) templates.value.splice(idx, 1, row)
      else templates.value.unshift(row)
      persistTemplates()
      activeTplName.value = title
      toast('模板已保存', 'success')
    }
  })
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
    selfRegister: !!form.selfRegister
  }
}

async function submit() {
  if (!form.name.trim() || !form.location.trim()) {
    toast('请填写名称和地点')
    return
  }
  if (!form.startDate || !form.startTime || !form.endTime) {
    toast('请完善活动时间')
    return
  }
  if (!form.maxCount || Number(form.maxCount) < 1) {
    toast('请设置报名人数上限')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      await api.updateActivity({ id: editingId.value, ...payload() })
      toast('已保存', 'success')
      cancelForm()
      await load()
    } else {
      const a = await api.createActivity({ ...payload(), publish: true })
      toast('已发布', 'success')
      cancelForm()
      await load()
      uni.navigateTo({ url: `/pages/activity/detail?id=${a._id}` })
    }
  } finally {
    saving.value = false
  }
}

async function remove(a) {
  if (!(await confirm(`确定删除活动「${a.name}」？记录将保留在数据库中（软删除）。`))) return
  await api.deleteActivity({ id: a._id })
  toast('已删除', 'success')
  if (editingId.value === a._id) cancelForm()
  load()
}

onShow(() => {
  loadTemplates()
  if (!showForm.value && !editingId.value) resetForm()
  load()
})
</script>

<style lang="scss" scoped>
.item {
  padding: 28rpx;
  margin-bottom: 20rpx;
}
.top {
  justify-content: space-between;
  align-items: flex-start;
}
.title {
  font-size: 30rpx;
  font-weight: 700;
  flex: 1;
  padding-right: 12rpx;
}
.meta {
  font-size: 24rpx;
  color: $hg-text2;
  line-height: 1.7;
  margin-top: 8rpx;
}
.ops {
  display: flex;
  gap: 28rpx;
  margin-top: 20rpx;
  padding-top: 16rpx;
  border-top: 1rpx dashed $hg-line;
}
.link {
  font-size: 26rpx;
  color: $hg-primary;
}
.link.danger {
  color: $hg-lose;
}
.form-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}
.form-title {
  font-size: 30rpx;
  font-weight: 700;
}
.tpl-bar {
  padding: 20rpx 24rpx;
  margin-bottom: 24rpx;
}
.tpl-row {
  display: flex;
  align-items: center;
  gap: 24rpx;
}
.tpl-label {
  flex: 1;
  font-size: 26rpx;
  font-weight: 600;
  color: $hg-text;
}
.tpl-tip {
  margin-top: 12rpx;
  font-size: 22rpx;
  color: $hg-text3;
}
.picker {
  display: flex;
  align-items: center;
}
.time-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-top: 12rpx;
}
.half {
  flex: 1;
  justify-content: center;
}
.tilde {
  color: $hg-text3;
  font-size: 28rpx;
}
.hint {
  font-size: 22rpx;
  color: $hg-text3;
  margin: -8rpx 0 16rpx;
  line-height: 1.5;
}
.roles {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
}
.role {
  border: 3rpx solid $hg-line;
  border-radius: 32rpx;
  padding: 12rpx 24rpx;
  font-size: 26rpx;
  color: $hg-text2;
  background: #fff;
}
.role.on {
  border-color: $hg-primary;
  background: $hg-primary-light;
  color: $hg-primary-deep;
  font-weight: 600;
}
.notice {
  min-height: 280rpx;
  line-height: 1.6;
}
.check-row {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  margin: 8rpx 0 28rpx;
  padding: 20rpx 24rpx;
  background: #fff;
  border-radius: 20rpx;
}
.check {
  width: 36rpx;
  height: 36rpx;
  border-radius: 8rpx;
  border: 2rpx solid $hg-line;
  margin-top: 4rpx;
  flex-shrink: 0;
}
.check.on {
  background: $hg-primary;
  border-color: $hg-primary;
}
.check-txt {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.check-title {
  font-size: 28rpx;
  font-weight: 600;
  color: $hg-text;
}
.check-desc {
  font-size: 22rpx;
  color: $hg-text3;
  line-height: 1.4;
}
</style>
