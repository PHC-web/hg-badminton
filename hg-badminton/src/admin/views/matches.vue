<template>
  <view v-if="mode === 'list'">
    <view class="bar">
      <view class="h">比赛</view>
      <button class="btn" @click="startCreate">发布比赛</button>
    </view>
    <view class="table">
      <view class="tr head">
        <text>比赛</text><text>时间 / 地点</text><text>队伍 / 场次</text><text>操作</text>
      </view>
      <view class="tr" v-for="m in list" :key="m._id">
        <text>{{ m.name }}</text>
        <text>{{ formatDate(m.startDate) }} · {{ m.location }}</text>
        <text>{{ m.teamCount || 0 }} 队 · {{ m.fixtureCount || 0 }} 场</text>
        <view class="ops">
          <text class="link" @click="openOps(m)">场地/裁判</text>
          <text class="link" @click="startEdit(m)">修改</text>
          <text class="link danger" @click="remove(m)">删除</text>
        </view>
      </view>
      <view v-if="!list.length" class="empty">暂无比赛</view>
    </view>
  </view>

  <view v-else-if="mode === 'form'" class="form">
    <view class="bar">
      <view class="h">{{ editingId ? '修改比赛' : '发布比赛' }}</view>
      <text class="link" @click="backList">返回列表</text>
    </view>
    <view class="card">
      <label>比赛名称 *</label>
      <input class="inp" v-model="form.name" />
      <label>比赛地点 *</label>
      <view class="loc-row">
        <input class="inp" v-model="form.location" placeholder="点击右侧打开地图，或直接填写" />
        <button class="btn ghost" @click="pickLoc">地图选点</button>
      </view>
      <view v-if="form.geo.address" class="hint">{{ form.geo.address }}</view>
      <label>开赛日期</label>
      <input class="inp" type="date" v-model="form.startDate" />

      <label>团体赛制</label>
      <view class="chips">
        <text v-for="f in teamFormats" :key="f.key" class="chip" :class="{ on: formatKey === f.key }" @click="pickFormat(f)">{{ f.label }}</text>
      </view>
      <label>每场项目</label>
      <view class="chips">
        <text v-for="p in itemPresets" :key="p.key" class="chip" :class="{ on: itemPresetKey === p.key }" @click="applyPreset(p)">{{ p.label }}</text>
      </view>
      <view class="item-row" v-for="(it, i) in form.items" :key="i">
        <text>第 {{ i + 1 }} 项</text>
        <picker :value="itemNames.indexOf(it.name)" :range="itemNames" @change="(e) => changeItem(i, e.detail.value)">
          <view class="inp pick">{{ it.name }}</view>
        </picker>
        <text v-if="form.items.length > 1" class="link danger" @click="form.items.splice(i, 1)">删</text>
      </view>
      <text class="link" @click="addItem">＋ 添加项目</text>

      <view class="row">
        <view class="col"><label>队伍上限</label><input class="inp" type="number" v-model="form.maxTeams" /></view>
        <view class="col"><label>每队限男</label><input class="inp" type="number" v-model="form.maxMalePerTeam" /></view>
        <view class="col"><label>每队限女</label><input class="inp" type="number" v-model="form.maxFemalePerTeam" /></view>
      </view>
      <view class="row">
        <view class="col"><label>场地总数</label><input class="inp" type="number" v-model="form.courtCount" /></view>
      </view>
      <view class="hint">生成对阵后不自动排场；在运营页按时段选场地并挂局。</view>
      <label>报名截止</label>
      <input class="inp" type="date" v-model="form.registerEnd" />
      <label>须知</label>
      <textarea class="area" v-model="form.notice" />
      <label>本场裁判</label>
      <view class="chips">
        <text v-for="r in allRefs" :key="r._id" class="chip" :class="{ on: form.refereeIds.includes(r._id) }" @click="toggleRef(r._id)">{{ r.realName || r.nickname }}</text>
      </view>
      <button class="btn" :loading="saving" @click="submit">{{ editingId ? '保存修改' : '发布比赛' }}</button>
    </view>
  </view>

  <view v-else class="ops-page">
    <view class="bar">
      <view class="h">{{ current?.name || '比赛运营' }}</view>
      <text class="link" @click="backList">返回列表</text>
    </view>
    <view class="card">
      <view class="sub">本场裁判</view>
      <view class="chips">
        <text v-for="r in allRefs" :key="r._id" class="chip" :class="{ on: draftRefIds.includes(r._id) }" @click="toggleDraft(r._id)">{{ r.realName || r.nickname }}</text>
      </view>
      <button class="btn" style="margin-top: 12px;" @click="saveRefs">保存裁判</button>
    </view>
    <admin-schedule-panel :match="current" />
  </view>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { api } from '@/api'
import { DEFAULT_CONCURRENT, DEFAULT_ITEMS } from '@/utils/constants'
import { confirm, formatDate, toast } from '@/utils/format'
import { normalizeConcurrent } from '@/utils/concurrent'
import {
  ITEM_CATALOG,
  ITEM_NAMES,
  ITEM_PRESETS,
  TEAM_FORMATS,
  cloneItems,
  catalogItem,
  defaultTeamRule,
  matchFormatKey,
  matchItemPresetKey,
  sanitizeMatchItems,
  sanitizeTeamRule
} from '@/utils/match-format'
import { chooseMapLocation, emptyGeo, sanitizeGeo } from '@/utils/location'
import AdminSchedulePanel from '@/admin/views/schedule-panel.vue'

const mode = ref('list')
const list = ref([])
const allRefs = ref([])
const editingId = ref('')
const saving = ref(false)
const current = ref(null)
const draftRefIds = ref([])
const itemNames = ITEM_NAMES
const teamFormats = TEAM_FORMATS
const itemPresets = ITEM_PRESETS

const form = reactive({
  name: '',
  location: '',
  geo: emptyGeo(),
  startDate: '',
  progression: 'round_robin',
  maxTeams: 8,
  maxMalePerTeam: 4,
  maxFemalePerTeam: 4,
  teamRule: defaultTeamRule(5),
  items: cloneItems(DEFAULT_ITEMS),
  concurrent: { ...DEFAULT_CONCURRENT },
  courtCount: 10,
  courtsPerMatch: 2,
  roundIntervalMinutes: 45,
  itemIntervalMinutes: 0,
  registerEnd: '',
  notice: '',
  refereeIds: []
})

const formatKey = computed(() => matchFormatKey(form.teamRule, form.items))
const itemPresetKey = computed(() => matchItemPresetKey(form.items))

function pad(n) {
  return `${n}`.padStart(2, '0')
}
function today(offset = 0) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function toDate(iso) {
  return iso ? String(iso).slice(0, 10) : ''
}
async function load() {
  list.value = (await api.listMatches({})) || []
  try {
    allRefs.value = (await api.listReferees()) || []
  } catch (e) {
    allRefs.value = []
  }
}

function reset() {
  form.name = ''
  form.location = ''
  form.geo = emptyGeo()
  form.startDate = today(14)
  form.maxTeams = 8
  form.maxMalePerTeam = 4
  form.maxFemalePerTeam = 4
  form.items = cloneItems(DEFAULT_ITEMS)
  form.teamRule = defaultTeamRule(5)
  form.concurrent = { ...DEFAULT_CONCURRENT }
  form.courtCount = 10
  form.courtsPerMatch = 2
  form.roundIntervalMinutes = 45
  form.registerEnd = today(7)
  form.notice = ''
  form.refereeIds = []
}

function startCreate() {
  editingId.value = ''
  reset()
  mode.value = 'form'
}

function startEdit(m) {
  editingId.value = m._id
  form.name = m.name || ''
  form.location = m.location || ''
  form.geo = sanitizeGeo(m.geo) || emptyGeo()
  form.startDate = toDate(m.startDate) || today(14)
  form.maxTeams = m.maxTeams || 8
  form.maxMalePerTeam = m.maxMalePerTeam || 4
  form.maxFemalePerTeam = m.maxFemalePerTeam || 4
  form.items = cloneItems(m.items?.length ? m.items : DEFAULT_ITEMS)
  form.teamRule = sanitizeTeamRule(m.teamRule, form.items.length)
  form.concurrent = normalizeConcurrent(m.concurrent)
  form.courtCount = m.courtCount || 10
  form.courtsPerMatch = m.courtsPerMatch || 2
  form.roundIntervalMinutes = m.roundIntervalMinutes || 45
  form.registerEnd = toDate(m.registerEnd) || today(7)
  form.notice = m.notice || ''
  form.refereeIds = [...(m.refereeIds || [])]
  mode.value = 'form'
}

function backList() {
  mode.value = 'list'
  current.value = null
  load()
}

function pickFormat(f) {
  form.teamRule = { mode: f.mode, itemsWinToWin: f.itemsWinToWin }
  const next = cloneItems(form.items)
  while (next.length < f.itemCount) next.push({ ...(catalogItem('男双') || ITEM_CATALOG[2]) })
  if (next.length > f.itemCount) next.splice(f.itemCount)
  form.items = next
}

function applyPreset(p) {
  form.items = cloneItems(p.items)
  form.teamRule = sanitizeTeamRule(form.teamRule, form.items.length)
}

function changeItem(i, v) {
  const picked = ITEM_CATALOG[Number(v)]
  if (picked) form.items[i] = { name: picked.name, memberCount: picked.memberCount }
}

function addItem() {
  if (form.items.length >= 9) return
  form.items.push({ ...(catalogItem('男双') || ITEM_CATALOG[2]) })
}

function toggleRef(id) {
  const i = form.refereeIds.indexOf(id)
  if (i >= 0) form.refereeIds.splice(i, 1)
  else form.refereeIds.push(id)
}

async function pickLoc() {
  try {
    const picked = await chooseMapLocation()
    form.location = picked.location
    form.geo = picked.geo
  } catch (e) {
    if (!e?.cancel) toast(e.message || '选点失败，可直接填写地点')
  }
}

function payload() {
  return {
    name: form.name.trim(),
    location: form.location.trim(),
    geo: sanitizeGeo(form.geo),
    startDate: form.startDate + 'T09:00:00',
    endDate: form.startDate + 'T18:00:00',
    registerStart: new Date().toISOString(),
    registerEnd: form.registerEnd + 'T23:59:00',
    progression: 'round_robin',
    teamRule: sanitizeTeamRule(form.teamRule, form.items.length),
    items: sanitizeMatchItems(form.items),
    maxTeams: Number(form.maxTeams) || 8,
    maxMalePerTeam: Number(form.maxMalePerTeam) || 4,
    maxFemalePerTeam: Number(form.maxFemalePerTeam) || 4,
    concurrent: normalizeConcurrent(form.concurrent),
    courtCount: Number(form.courtCount) || 10,
    courtsPerMatch: Number(form.courtsPerMatch) || 2,
    roundIntervalMinutes: Number(form.roundIntervalMinutes) || 45,
    itemIntervalMinutes: 0,
    notice: form.notice || '',
    refereeIds: [...form.refereeIds]
  }
}

async function submit() {
  if (!form.name.trim() || !form.location.trim()) return toast('请填写名称和地点')
  saving.value = true
  try {
    if (editingId.value) {
      const { registerStart, items, ...patch } = payload()
      if (!(current.value?.fixtureCount || list.value.find((x) => x._id === editingId.value)?.fixtureCount)) {
        patch.items = items
      }
      await api.updateMatch({ id: editingId.value, ...patch })
    } else {
      await api.createMatch({ ...payload(), publish: true })
    }
    toast('已保存', 'success')
    backList()
  } finally {
    saving.value = false
  }
}

async function remove(m) {
  if (!(await confirm(`删除比赛「${m.name}」？`))) return
  await api.deleteMatch({ id: m._id })
  toast('已删除')
  load()
}

async function openOps(m) {
  current.value = await api.getMatch(m._id)
  draftRefIds.value = [...(current.value.refereeIds || [])]
  mode.value = 'ops'
}

function toggleDraft(id) {
  const i = draftRefIds.value.indexOf(id)
  if (i >= 0) draftRefIds.value.splice(i, 1)
  else draftRefIds.value.push(id)
}

async function saveRefs() {
  await api.setMatchReferees({ matchId: current.value._id, refereeIds: [...draftRefIds.value] })
  toast('裁判已更新', 'success')
}

onMounted(load)
</script>

<style lang="scss" scoped>
.bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
.h { font-size: 22px; font-weight: 800; color: #1a2332; }
.btn { height: 40px; padding: 0 16px; background: #006db8; color: #fff; border: none; border-radius: 8px; font-size: 15px; }
.btn.ghost { background: #e8f3fb; color: #006db8; }
.table { background: #fff; border-radius: 12px; overflow: hidden; font-size: 16px; color: #1a2332; }
.tr { display: grid; grid-template-columns: 1.3fr 1.6fr 1fr 1.1fr; gap: 8px; padding: 12px 16px; border-bottom: 1px solid #f7f8fa; align-items: center; }
.tr.head { font-size: 15px; color: #4a5563; font-weight: 700; }
.ops { display: flex; gap: 12px; }
.link { color: #006db8; font-size: 15px; }
.danger { color: #e5484d; }
.empty { padding: 20px; color: #4a5563; font-size: 16px; }
.card { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 16px; max-width: 860px; }
label { display: block; font-size: 15px; color: #3d4a57; margin: 12px 0 6px; }
.inp, .area { width: 100%; border: 1px solid #c5d0db; border-radius: 8px; padding: 10px 12px; box-sizing: border-box; font-size: 16px; color: #1a2332; }
.inp.sm { min-width: 140px; }
.area { min-height: 80px; }
.row { display: flex; gap: 12px; }
.col { flex: 1; }
.loc-row { display: flex; gap: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chip { padding: 6px 12px; border: 1px solid #c5d0db; border-radius: 999px; font-size: 15px; color: #1a2332; }
.chip.on { border-color: #006db8; color: #006db8; background: #e8f3fb; }
.item-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.pick { min-width: 120px; }
.hint { font-size: 14px; color: #4a5563; margin-top: 4px; }
.sub { font-weight: 700; margin-bottom: 10px; font-size: 16px; }
.ops-page .tr { grid-template-columns: minmax(180px, 1.4fr) minmax(140px, 0.8fr) minmax(230px, 1.3fr); }
</style>
