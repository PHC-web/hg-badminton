<template>
  <view class="page">
    <hg-nav :title="editingId ? '编辑比赛' : '比赛管理'" />
    <view class="pad">
      <view v-if="!editingId" class="section-title">
        当前比赛
        <text class="section-more" @click="startCreate">＋ 发布新比赛</text>
      </view>

      <view v-if="!editingId && !showForm">
        <view v-for="m in list" :key="m._id" class="card item">
          <view class="row top">
            <view class="title">{{ m.name }}</view>
            <hg-chip :text="st(m).label" :type="st(m).chip" />
          </view>
          <view class="meta">📅 {{ dateRange(m) }}　📍 {{ m.location }}</view>
          <view class="meta">👥 {{ m.teamCount || 0 }} 支队伍 · {{ m.fixtureCount || 0 }} 场 · {{ m.memberCount || 0 }} 名队员</view>
          <view class="ops">
            <text class="link" @click="openDetail(m)">详情</text>
            <text class="link" @click="startEdit(m)">修改</text>
            <text class="link danger" @click="remove(m)">删除</text>
          </view>
        </view>
        <hg-empty v-if="!list.length" text="暂无比赛，点击右上角发布" />
      </view>

      <view v-if="showForm || editingId">
        <view v-if="!editingId" class="form-head">
          <text class="form-title">发布新比赛</text>
          <text class="link" @click="cancelForm">取消</text>
        </view>
        <view v-else class="form-head">
          <text class="form-title">修改比赛</text>
          <text class="link" @click="cancelForm">返回列表</text>
        </view>

        <view class="field"><text class="field-label">比赛名称<text class="req">*</text></text>
          <input class="input" v-model="form.name" placeholder="如：追光杯单循环友谊赛" />
        </view>
        <view class="field"><text class="field-label">比赛地点<text class="req">*</text></text>
          <input class="input" v-model="form.location" placeholder="如：羽胜羽毛球馆" />
        </view>
        <view class="field"><text class="field-label">开赛日期</text>
          <picker mode="date" :value="form.startDate" @change="(e)=>form.startDate=e.detail.value">
            <view class="input picker">{{ form.startDate || '选择日期' }}</view>
          </picker>
        </view>
        <view class="section-title">赛制（本期仅单循环）</view>
        <hg-option
          v-for="p in progressions"
          :key="p.key"
          :title="p.label"
          :desc="p.desc"
          :selected="form.progression === p.key"
          @click="pickProg(p)"
        />
        <view class="field"><text class="field-label">限定报名队伍数</text>
          <input class="input" type="number" v-model="form.maxTeams" />
        </view>
        <view class="field"><text class="field-label">每队限男人数</text>
          <input class="input" type="number" v-model="form.maxMalePerTeam" />
        </view>
        <view class="field"><text class="field-label">每队限女人数</text>
          <input class="input" type="number" v-model="form.maxFemalePerTeam" />
        </view>
        <view class="field"><text class="field-label">报名截止</text>
          <picker mode="date" :value="form.registerEnd" @change="(e)=>form.registerEnd=e.detail.value">
            <view class="input picker">{{ form.registerEnd || '选择日期' }}</view>
          </picker>
        </view>
        <view class="field"><text class="field-label">报名须知</text>
          <textarea class="textarea" v-model="form.notice" placeholder="比赛注意事项…" />
        </view>
        <button class="btn-primary" :loading="saving" @click="submit">
          {{ editingId ? '保存修改' : '发布比赛' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { PROGRESSION } from '@/utils/constants'
import { toast, confirm, matchStatus, formatDate } from '@/utils/format'

const progressions = Object.values(PROGRESSION)
const list = ref([])
const showForm = ref(false)
const editingId = ref('')
const saving = ref(false)

const form = reactive({
  name: '',
  location: '',
  startDate: '',
  progression: 'round_robin',
  maxTeams: 8,
  maxMalePerTeam: 4,
  maxFemalePerTeam: 4,
  registerEnd: '',
  notice: ''
})

function pad(n) {
  return `${n}`.padStart(2, '0')
}

function formatYmd(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function todayStr(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return formatYmd(d)
}

function toDateInput(iso) {
  if (!iso) return ''
  return String(iso).slice(0, 10)
}

function resetForm() {
  form.name = ''
  form.location = ''
  form.startDate = todayStr(14)
  form.progression = 'round_robin'
  form.maxTeams = 8
  form.maxMalePerTeam = 4
  form.maxFemalePerTeam = 4
  form.registerEnd = todayStr(7)
  form.notice = ''
}

function st(m) {
  return matchStatus(m.status)
}

function dateRange(m) {
  const a = formatDate(m.startDate)
  const b = m.endDate ? formatDate(m.endDate) : ''
  return b && b !== a ? `${a} - ${b}` : a
}

async function load() {
  list.value = (await api.listMatches({})) || []
}

function pickProg(p) {
  if (!p.enabled) {
    toast('该赛制即将开放')
    return
  }
  form.progression = p.key
}

function openDetail(m) {
  uni.navigateTo({ url: `/pages/match/detail?id=${m._id}` })
}

function startCreate() {
  editingId.value = ''
  resetForm()
  showForm.value = true
}

function startEdit(m) {
  editingId.value = m._id
  showForm.value = true
  form.name = m.name || ''
  form.location = m.location || ''
  form.startDate = toDateInput(m.startDate) || todayStr(14)
  form.progression = m.progression || 'round_robin'
  form.maxTeams = m.maxTeams || 8
  form.maxMalePerTeam = m.maxMalePerTeam || 4
  form.maxFemalePerTeam = m.maxFemalePerTeam || 4
  form.registerEnd = toDateInput(m.registerEnd) || todayStr(7)
  form.notice = m.notice || ''
}

function cancelForm() {
  editingId.value = ''
  showForm.value = false
  resetForm()
}

function payload() {
  return {
    name: form.name.trim(),
    location: form.location.trim(),
    startDate: form.startDate + 'T09:00:00',
    endDate: form.startDate + 'T18:00:00',
    registerStart: new Date().toISOString(),
    registerEnd: form.registerEnd + 'T23:59:00',
    progression: form.progression,
    maxTeams: Number(form.maxTeams) || 8,
    maxMalePerTeam: Number(form.maxMalePerTeam) || 4,
    maxFemalePerTeam: Number(form.maxFemalePerTeam) || 4,
    notice: form.notice || ''
  }
}

async function submit() {
  if (!form.name.trim() || !form.location.trim()) {
    toast('请填写名称和地点')
    return
  }
  if (!form.startDate) {
    toast('请选择开赛日期')
    return
  }
  saving.value = true
  try {
    if (editingId.value) {
      const { registerStart, ...patch } = payload()
      await api.updateMatch({
        id: editingId.value,
        ...patch
        // 修改时不覆盖已有报名开始时间
      })
      toast('已保存', 'success')
      cancelForm()
      await load()
    } else {
      const m = await api.createMatch({ ...payload(), publish: true })
      toast('已发布', 'success')
      cancelForm()
      await load()
      uni.navigateTo({ url: `/pages/match/detail?id=${m._id}` })
    }
  } finally {
    saving.value = false
  }
}

async function remove(m) {
  if (!(await confirm(`确定删除比赛「${m.name}」？记录将保留在数据库中（软删除）。`))) return
  await api.deleteMatch({ id: m._id })
  toast('已删除', 'success')
  if (editingId.value === m._id) cancelForm()
  load()
}

onShow(() => {
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
.picker {
  display: flex;
  align-items: center;
}
</style>
