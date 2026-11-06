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
          <view class="meta">📅 {{ dateRange(m) }}　
            <text :class="{ 'loc-link': hasGeo(m) }" @click.stop="openMapLocation(m)">📍 {{ m.location }}</text>
          </view>
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
          <view class="input picker loc-pick" @click="pickLocation">
            <text :class="form.location ? 'loc-name' : 'loc-ph'">{{ form.location || '点击打开地图选点' }}</text>
            <text class="loc-go">地图 ›</text>
          </view>
          <view v-if="form.geo.address" class="loc-addr">{{ form.geo.address }}</view>
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

        <view class="section-title">团体场次（几局几胜）</view>
        <view class="hint">先赢指定项数，或打满全部小项后再计团体胜负。</view>
        <view class="chip-grid">
          <view
            v-for="f in teamFormats"
            :key="f.key"
            class="opt"
            :class="{ on: formatKey === f.key, disabled: itemsLocked && f.itemCount !== form.items.length }"
            @click="pickFormat(f)"
          >
            <view class="opt-t">{{ f.label }}</view>
            <view class="opt-d">{{ f.desc }}</view>
          </view>
        </view>
        <view class="meta" style="margin-bottom: 8rpx;">当前：{{ formatSummary }}</view>

        <view class="section-title">每场项目</view>
        <view class="hint">可选用模板，也可逐项调整顺序。支持重复项目，例如两场男双。</view>
        <view v-if="itemsLocked" class="rule-box">已生成对阵，项目顺序不可再改，仍可在上方切换「几局几胜 / 打满」。</view>
        <view v-else class="chip-grid">
          <view
            v-for="p in itemPresets"
            :key="p.key"
            class="opt"
            :class="{ on: itemPresetKey === p.key }"
            @click="applyItemPreset(p)"
          >
            <view class="opt-t">{{ p.label }}</view>
            <view class="opt-d">{{ p.desc }}</view>
          </view>
        </view>
        <view v-for="(it, i) in form.items" :key="i" class="item-row">
          <text class="item-idx">第 {{ i + 1 }} 项</text>
          <picker
            :disabled="itemsLocked"
            :value="itemNameIndex(it.name)"
            :range="itemNames"
            @change="(e) => changeItem(i, e.detail.value)"
          >
            <view class="input picker item-pick" :class="{ locked: itemsLocked }">{{ it.name }}</view>
          </picker>
          <text v-if="!itemsLocked && form.items.length > 1" class="item-del" @click="removeItem(i)">删除</text>
        </view>
        <view v-if="!itemsLocked && form.items.length < 9" class="add-item" @click="addItem">＋ 添加项目</view>

        <view class="field"><text class="field-label">限定报名队伍数</text>
          <input class="input" type="number" v-model="form.maxTeams" />
        </view>
        <view class="field"><text class="field-label">每队限男人数</text>
          <input class="input" type="number" v-model="form.maxMalePerTeam" />
        </view>
        <view class="field"><text class="field-label">每队限女人数</text>
          <input class="input" type="number" v-model="form.maxFemalePerTeam" />
        </view>

        <view class="section-title">兼项规则（每一场团体赛内）</view>
        <view class="field">
          <text class="field-label">是否允许兼项</text>
          <view class="row" style="gap:16rpx;">
            <view class="opt" :class="{ on: form.concurrent.enabled }" @click="form.concurrent.enabled = true">允许</view>
            <view class="opt" :class="{ on: !form.concurrent.enabled }" @click="disableConcurrent">不允许</view>
          </view>
        </view>
        <template v-if="form.concurrent.enabled">
          <view class="field">
            <text class="field-label">男生是否允许兼项</text>
            <view class="row" style="gap:16rpx;">
              <view class="opt" :class="{ on: form.concurrent.allowMale }" @click="form.concurrent.allowMale = true">允许</view>
              <view class="opt" :class="{ on: !form.concurrent.allowMale }" @click="form.concurrent.allowMale = false">不允许</view>
            </view>
          </view>
          <view v-if="form.concurrent.allowMale" class="field">
            <text class="field-label">男生最多几人兼项</text>
            <input class="input" type="number" v-model="form.concurrent.maxMalePeople" />
          </view>
          <view v-if="form.concurrent.allowMale" class="field">
            <text class="field-label">男生每人最多兼几个小项</text>
            <input class="input" type="number" v-model="form.concurrent.maxMaleItems" />
          </view>
          <view class="field">
            <text class="field-label">女生是否允许兼项</text>
            <view class="row" style="gap:16rpx;">
              <view class="opt" :class="{ on: form.concurrent.allowFemale }" @click="form.concurrent.allowFemale = true">允许</view>
              <view class="opt" :class="{ on: !form.concurrent.allowFemale }" @click="form.concurrent.allowFemale = false">不允许</view>
            </view>
          </view>
          <view v-if="form.concurrent.allowFemale" class="field">
            <text class="field-label">女生最多几人兼项</text>
            <input class="input" type="number" v-model="form.concurrent.maxFemalePeople" />
          </view>
          <view v-if="form.concurrent.allowFemale" class="field">
            <text class="field-label">女生每人最多兼几个小项</text>
            <input class="input" type="number" v-model="form.concurrent.maxFemaleItems" />
          </view>
        </template>

        <view class="section-title">可用场地</view>
        <view class="hint">生成对阵后不再自动排场地和时间。管理员在「排期」里按时段选场地并挂局。</view>
        <view class="field"><text class="field-label">场地总数</text>
          <input class="input" type="number" v-model="form.courtCount" placeholder="如 8（排期时可选 1～8 号）" />
        </view>
        <view class="field"><text class="field-label">报名截止</text>
          <picker mode="date" :value="form.registerEnd" @change="(e)=>form.registerEnd=e.detail.value">
            <view class="input picker">{{ form.registerEnd || '选择日期' }}</view>
          </picker>
        </view>
        <view class="field"><text class="field-label">报名须知</text>
          <textarea class="textarea" v-model="form.notice" placeholder="比赛注意事项…" />
        </view>

        <view class="section-title">本场裁判</view>
        <view class="hint">从系统裁判角色中选择；仅本场裁判可直接查看对阵并执裁。其他人需参赛或申请观众。</view>
        <view v-if="!allReferees.length" class="rule-box">暂无裁判角色用户，请先在用户管理中授予「裁判」角色。</view>
        <view v-else class="ref-list">
          <view
            v-for="r in allReferees"
            :key="r._id"
            class="ref-chip"
            :class="{ on: form.refereeIds.includes(r._id) }"
            @click="toggleReferee(r._id)"
          >
            {{ r.realName || r.nickname || '裁判' }}
          </view>
        </view>
        <view class="meta" style="margin-bottom: 16rpx;">已选 {{ form.refereeIds.length }} 人</view>

        <button class="btn-primary" :loading="saving" @click="submit">
          {{ editingId ? '保存修改' : '发布比赛' }}
        </button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { PROGRESSION, DEFAULT_CONCURRENT, DEFAULT_ITEMS } from '@/utils/constants'
import { toast, confirm, matchStatus, formatDate } from '@/utils/format'
import { normalizeConcurrent } from '@/utils/concurrent'
import { chooseMapLocation, emptyGeo, hasGeo, openMapLocation, sanitizeGeo } from '@/utils/location'
import {
  ITEM_CATALOG,
  ITEM_NAMES,
  ITEM_PRESETS,
  TEAM_FORMATS,
  cloneItems,
  catalogItem,
  defaultTeamRule,
  itemsLabel,
  matchFormatKey,
  matchItemPresetKey,
  sanitizeMatchItems,
  sanitizeTeamRule,
  teamRuleLabel
} from '@/utils/match-format'

const progressions = Object.values(PROGRESSION)
const teamFormats = TEAM_FORMATS
const itemPresets = ITEM_PRESETS
const itemNames = ITEM_NAMES
const list = ref([])
const allReferees = ref([])
const showForm = ref(false)
const editingId = ref('')
const editFixtureCount = ref(0)
const saving = ref(false)

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

const itemsLocked = computed(() => !!editingId.value && editFixtureCount.value > 0)
const formatKey = computed(() => matchFormatKey(form.teamRule, form.items))
const itemPresetKey = computed(() => matchItemPresetKey(form.items))
const formatSummary = computed(() => {
  const rule = teamRuleLabel(form.teamRule, form.items.length)
  const items = itemsLabel(form.items)
  return items ? `${rule} · ${items}` : rule
})

function toggleReferee(uid) {
  const i = form.refereeIds.indexOf(uid)
  if (i >= 0) form.refereeIds.splice(i, 1)
  else form.refereeIds.push(uid)
}

function disableConcurrent() {
  form.concurrent.enabled = false
  form.concurrent.allowMale = false
  form.concurrent.allowFemale = false
}

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
  form.geo = emptyGeo()
  form.startDate = todayStr(14)
  form.progression = 'round_robin'
  form.maxTeams = 8
  form.maxMalePerTeam = 4
  form.maxFemalePerTeam = 4
  form.items = cloneItems(DEFAULT_ITEMS)
  form.teamRule = defaultTeamRule(form.items.length)
  form.concurrent = { ...DEFAULT_CONCURRENT }
  form.courtCount = 10
  form.courtsPerMatch = 2
  form.roundIntervalMinutes = 45
  form.itemIntervalMinutes = 0
  form.registerEnd = todayStr(7)
  form.notice = ''
  form.refereeIds = []
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
  try {
    allReferees.value = (await api.listReferees()) || []
  } catch (e) {
    allReferees.value = []
  }
}

async function pickLocation() {
  try {
    const picked = await chooseMapLocation()
    form.location = picked.location
    form.geo = picked.geo
  } catch (e) {
    if (e?.cancel) return
    toast(e.message || '选点失败，请检查位置权限')
  }
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

function syncTeamRule() {
  form.teamRule = sanitizeTeamRule(form.teamRule, form.items.length)
}

function resizeItems(n) {
  const next = cloneItems(form.items)
  while (next.length < n) {
    next.push({ ...(catalogItem('男双') || ITEM_CATALOG[2]) })
  }
  if (next.length > n) next.splice(n)
  form.items = next
  syncTeamRule()
}

function pickFormat(f) {
  if (itemsLocked.value && f.itemCount !== form.items.length) {
    toast('已生成对阵，不能更改局数')
    return
  }
  form.teamRule = { mode: f.mode, itemsWinToWin: f.itemsWinToWin }
  if (!itemsLocked.value) resizeItems(f.itemCount)
  else syncTeamRule()
}

function applyItemPreset(p) {
  if (itemsLocked.value) return
  form.items = cloneItems(p.items)
  syncTeamRule()
}

function itemNameIndex(name) {
  const i = itemNames.indexOf(name)
  return i >= 0 ? i : 0
}

function changeItem(index, value) {
  const picked = ITEM_CATALOG[Number(value)]
  if (!picked) return
  form.items[index] = { name: picked.name, memberCount: picked.memberCount }
}

function addItem() {
  if (itemsLocked.value || form.items.length >= 9) return
  form.items.push({ ...(catalogItem('男双') || ITEM_CATALOG[2]) })
  syncTeamRule()
}

function removeItem(index) {
  if (itemsLocked.value || form.items.length <= 1) return
  form.items.splice(index, 1)
  syncTeamRule()
}

function startCreate() {
  editingId.value = ''
  editFixtureCount.value = 0
  resetForm()
  showForm.value = true
}

function startEdit(m) {
  editingId.value = m._id
  editFixtureCount.value = m.fixtureCount || 0
  showForm.value = true
  form.name = m.name || ''
  form.location = m.location || ''
  form.geo = sanitizeGeo(m.geo) || emptyGeo()
  form.startDate = toDateInput(m.startDate) || todayStr(14)
  form.progression = m.progression || 'round_robin'
  form.maxTeams = m.maxTeams || 8
  form.maxMalePerTeam = m.maxMalePerTeam || 4
  form.maxFemalePerTeam = m.maxFemalePerTeam || 4
  form.items = cloneItems(m.items?.length ? m.items : DEFAULT_ITEMS)
  form.teamRule = sanitizeTeamRule(m.teamRule, form.items.length)
  form.concurrent = normalizeConcurrent(m.concurrent)
  form.courtCount = m.courtCount || 10
  form.courtsPerMatch = m.courtsPerMatch || 2
  form.roundIntervalMinutes = m.roundIntervalMinutes || 45
  form.itemIntervalMinutes = m.itemIntervalMinutes || 0
  form.registerEnd = toDateInput(m.registerEnd) || todayStr(7)
  form.notice = m.notice || ''
  form.refereeIds = [...(m.refereeIds || [])]
}

function cancelForm() {
  editingId.value = ''
  editFixtureCount.value = 0
  showForm.value = false
  resetForm()
}

function payload() {
  const body = {
    name: form.name.trim(),
    location: form.location.trim(),
    geo: sanitizeGeo(form.geo),
    startDate: form.startDate + 'T09:00:00',
    endDate: form.startDate + 'T18:00:00',
    registerStart: new Date().toISOString(),
    registerEnd: form.registerEnd + 'T23:59:00',
    progression: form.progression,
    teamRule: sanitizeTeamRule(form.teamRule, form.items.length),
    maxTeams: Number(form.maxTeams) || 8,
    maxMalePerTeam: Number(form.maxMalePerTeam) || 4,
    maxFemalePerTeam: Number(form.maxFemalePerTeam) || 4,
    concurrent: normalizeConcurrent({
      ...form.concurrent,
      maxMalePeople: Number(form.concurrent.maxMalePeople) || 0,
      maxFemalePeople: Number(form.concurrent.maxFemalePeople) || 0,
      maxMaleItems: Number(form.concurrent.maxMaleItems) || 1,
      maxFemaleItems: Number(form.concurrent.maxFemaleItems) || 1
    }),
    courtCount: Number(form.courtCount) || 10,
    courtsPerMatch: Number(form.courtsPerMatch) || 2,
    roundIntervalMinutes: Number(form.roundIntervalMinutes) || 45,
    itemIntervalMinutes: Number(form.itemIntervalMinutes) || 0,
    notice: form.notice || '',
    refereeIds: [...form.refereeIds]
  }
  if (!itemsLocked.value) body.items = sanitizeMatchItems(form.items)
  return body
}

async function submit() {
  if (!form.name.trim()) {
    toast('请填写比赛名称')
    return
  }
  if (!form.location.trim() || (!sanitizeGeo(form.geo) && !editingId.value)) {
    toast('请在地图上选择比赛地点')
    return
  }
  if (!form.startDate) {
    toast('请选择开赛日期')
    return
  }
  try {
    sanitizeMatchItems(form.items)
  } catch (e) {
    toast(e.message || '请检查每场项目')
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
.loc-pick {
  justify-content: space-between;
}
.loc-go {
  flex-shrink: 0;
  color: $hg-primary;
  font-size: 26rpx;
}
.loc-name {
  color: $hg-text;
}
.loc-ph {
  color: $hg-text3;
}
.loc-addr {
  margin-top: 8rpx;
  font-size: 22rpx;
  color: $hg-text3;
  line-height: 1.5;
}
.loc-link {
  color: $hg-primary;
}
.opt {
  flex: 1;
  text-align: center;
  padding: 20rpx;
  border: 3rpx solid $hg-line;
  border-radius: 20rpx;
  font-size: 26rpx;
}
.opt.on {
  border-color: $hg-primary;
  background: $hg-primary-light;
  color: $hg-primary;
  font-weight: 600;
}
.opt.disabled {
  opacity: 0.45;
}
.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 16rpx;
}
.chip-grid .opt {
  flex: 1;
  min-width: 46%;
  padding: 20rpx 16rpx;
  box-sizing: border-box;
}
.opt-t {
  font-size: 26rpx;
  font-weight: 600;
}
.opt-d {
  font-size: 22rpx;
  color: $hg-text3;
  margin-top: 6rpx;
  font-weight: 400;
}
.item-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  margin-bottom: 16rpx;
}
.item-idx {
  width: 110rpx;
  font-size: 24rpx;
  color: $hg-text2;
  flex-shrink: 0;
}
.item-row picker {
  flex: 1;
  min-width: 0;
}
.item-pick {
  width: 100%;
  box-sizing: border-box;
}
.item-pick.locked {
  opacity: 0.7;
}
.item-del {
  font-size: 24rpx;
  color: $hg-lose;
  flex-shrink: 0;
}
.add-item {
  text-align: center;
  padding: 20rpx;
  border: 2rpx dashed $hg-line;
  border-radius: 20rpx;
  color: $hg-primary;
  font-size: 26rpx;
  margin-bottom: 24rpx;
}
.hint {
  font-size: 24rpx;
  color: $hg-text2;
  line-height: 1.6;
  margin: -8rpx 0 16rpx;
}
.ref-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin-bottom: 12rpx;
}
.ref-chip {
  padding: 14rpx 24rpx;
  border-radius: 999rpx;
  border: 2rpx solid $hg-line;
  font-size: 26rpx;
  color: $hg-text2;
}
.ref-chip.on {
  border-color: $hg-primary;
  color: $hg-primary;
  background: $hg-primary-light;
  font-weight: 600;
}
</style>
