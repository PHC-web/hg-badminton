<template>
  <view class="page">
    <hg-nav title="对阵排期" />
    <view class="pad">
      <view class="rule-box">
        编号：{{ matchNo || 'BS001' }}-R01-F01-MD1。生成对阵后，按时段选场地并挂「谁 VS 谁」的具体局。
      </view>
      <button class="btn-primary" @click="gen">生成 / 重新生成对阵</button>

      <view class="section-title">已生成对局</view>
      <view v-for="g in grouped" :key="g.round" class="card block">
        <view class="rn">{{ g.round }}</view>
        <view v-for="f in g.list" :key="f._id" class="fx">
          <view class="ft">{{ f.code }}　{{ f.teamAName }} vs {{ f.teamBName }}</view>
          <view v-for="s in f.subFixtures" :key="s._id" class="gm">
            {{ s.code }} {{ s.itemName }}　{{ s.venue || '未排场' }} {{ timeText(s.scheduleTime) }}
          </view>
        </view>
      </view>
      <hg-empty v-if="!fixtures.length" text="尚未生成对阵" />

      <view class="section-title">排期时段</view>
      <view v-for="s in slots" :key="s._id" class="card block">
        <view class="ft">{{ s.name }}　{{ s.date }} {{ s.startTime }}～{{ s.endTime }}</view>
        <view class="gm" v-for="a in s.assignments" :key="a.courtNo">{{ a.courtNo }}号　{{ slotAssignText(a) }}</view>
        <text class="danger" @click="removeSlot(s)">删除此时段</text>
      </view>

      <view class="section-title">新建时段</view>
      <view class="card block">
        <view class="field-label">名称</view>
        <input class="input" v-model="form.name" placeholder="如 第1轮" />
        <view class="field-label">日期</view>
        <picker mode="date" :value="form.date" @change="(e) => form.date = e.detail.value">
          <view class="input">{{ form.date || '选择日期' }}</view>
        </picker>
        <view class="row">
          <view class="col">
            <view class="field-label">开始</view>
            <picker mode="time" :value="form.startTime" @change="(e) => form.startTime = e.detail.value">
              <view class="input">{{ form.startTime }}</view>
            </picker>
          </view>
          <view class="col">
            <view class="field-label">结束</view>
            <picker mode="time" :value="form.endTime" @change="(e) => form.endTime = e.detail.value">
              <view class="input">{{ form.endTime }}</view>
            </picker>
          </view>
        </view>
        <view class="lab-row">
          <view class="field-label">选用场地</view>
          <view class="quick">
            <text class="link" @click="selectAllCourts">全选</text>
            <text class="link" @click="clearCourts">清空</text>
          </view>
        </view>
        <view class="chips">
          <text v-for="n in courtList" :key="n" class="chip" :class="{ on: form.courtNos.includes(n) }" @click="toggleCourt(n)">{{ n }}号</text>
        </view>
        <view v-if="form.courtNos.length" class="court-grid">
          <view
            v-for="n in form.courtNos"
            :key="n"
            class="court-card"
            :class="{ filled: !!pickedGame(n) }"
            @click="openPicker(n)"
          >
            <view class="cc-top">
              <text class="cc-no">{{ n }}号场地</text>
              <text v-if="pickedGame(n)" class="cc-clear" @click.stop="clearPick(n)">清除</text>
              <text v-else class="cc-hint">点选对局</text>
            </view>
            <template v-if="pickedGame(n)">
              <view class="cc-vs">{{ gameVs(pickedGame(n)) }}</view>
              <view class="cc-item">{{ pickedGame(n).itemName }}</view>
              <view class="cc-code">{{ pickedGame(n).code }}</view>
            </template>
            <view v-else class="cc-empty">未安排</view>
          </view>
        </view>
        <view v-else class="gm" style="margin-top: 8rpx;">先点选场地，再为每片场地挂一局</view>
        <button class="btn-primary" @click="save">保存并下发</button>
      </view>
    </view>

    <view v-if="picking" class="mask" @click="closePicker">
      <view class="sheet" @click.stop>
        <view class="sheet-bar">
          <view class="sheet-t">为 {{ picking }} 号场地选择</view>
          <text class="link" @click="closePicker">关闭</text>
        </view>
        <input class="input" v-model="kw" placeholder="搜队伍 / 项目 / 编号" />
        <scroll-view scroll-x class="chip-scroll">
          <view class="chips nowrap">
            <text class="chip" :class="{ on: !roundF }" @click="roundF = ''">全部轮次</text>
            <text v-for="r in rounds" :key="r" class="chip" :class="{ on: roundF === r }" @click="roundF = r">{{ r }}</text>
          </view>
        </scroll-view>
        <scroll-view scroll-x class="chip-scroll">
          <view class="chips nowrap">
            <text class="chip" :class="{ on: !itemF }" @click="itemF = ''">全部项目</text>
            <text v-for="it in items" :key="it" class="chip" :class="{ on: itemF === it }" @click="itemF = it">{{ it }}</text>
          </view>
        </scroll-view>
        <scroll-view scroll-y class="pick-scroll">
          <view v-for="g in pickerGroups" :key="g.key" class="pg">
            <view class="pg-vs">{{ g.teamAName }} vs {{ g.teamBName }}</view>
            <view class="pg-r">{{ g.round }} {{ g.fixtureCode }}</view>
            <view class="pg-items">
              <view
                v-for="game in g.list"
                :key="game._id"
                class="pg-item"
                :class="{
                  on: form.picks[picking] === game._id,
                  used: courtOfPick(form.picks, game._id) && courtOfPick(form.picks, game._id) !== picking
                }"
                @click="chooseGame(game)"
              >
                <text class="pg-name">{{ game.itemName }}</text>
                <text class="pg-code">{{ game.code }}</text>
                <text v-if="courtOfPick(form.picks, game._id) && courtOfPick(form.picks, game._id) !== picking" class="pg-used">
                  已挂 {{ courtOfPick(form.picks, game._id) }}号
                </text>
              </view>
            </view>
          </view>
          <view v-if="!pickerGroups.length" class="gm">没有可排对局</view>
        </scroll-view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { confirm, formatDate, toast } from '@/utils/format'
import { datePart } from '@/utils/match-code'
import {
  courtOfPick,
  filterGames,
  findGame,
  gameLine,
  gameVs,
  groupGamesByFixture,
  uniqueItems,
  uniqueRounds
} from '@/utils/schedule-assign'

const user = useUserStore()

const matchId = ref('')
const matchNo = ref('')
const courtCount = ref(8)
const fixtures = ref([])
const slots = ref([])
const games = ref([])
const picking = ref(0)
const kw = ref('')
const roundF = ref('')
const itemF = ref('')
const form = reactive({
  name: '第1轮',
  date: '',
  startTime: '08:00',
  endTime: '08:30',
  courtNos: [],
  picks: {}
})

const courtList = computed(() => Array.from({ length: Math.max(1, courtCount.value) }, (_, i) => i + 1))
const grouped = computed(() => {
  const map = new Map()
  for (const f of fixtures.value) {
    const k = f.round || `第${f.roundNo || '?'}轮`
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(f)
  }
  return [...map.entries()].map(([round, list]) => ({ round, list }))
})
const freeGames = computed(() => games.value.filter((g) => !g.slotId))
const rounds = computed(() => uniqueRounds(freeGames.value))
const items = computed(() => uniqueItems(freeGames.value))
const pickerGroups = computed(() =>
  groupGamesByFixture(filterGames(freeGames.value, { keyword: kw.value, round: roundF.value, item: itemF.value }))
)

function timeText(iso) {
  return iso ? formatDate(iso, true) : ''
}
function pickedGame(n) {
  const id = form.picks[n]
  return id ? games.value.find((x) => x._id === id) : null
}
function slotAssignText(a) {
  const g = findGame(games.value, a)
  return g ? `${gameLine(g)}　${g.code || a.code || ''}` : a.code || '已排局'
}
function toggleCourt(n) {
  const i = form.courtNos.indexOf(n)
  if (i >= 0) {
    form.courtNos.splice(i, 1)
    delete form.picks[n]
  } else form.courtNos.push(n)
  form.courtNos.sort((a, b) => a - b)
}
function selectAllCourts() {
  form.courtNos = [...courtList.value]
}
function clearCourts() {
  form.courtNos = []
  form.picks = {}
}
function clearPick(n) {
  delete form.picks[n]
}
function openPicker(n) {
  picking.value = n
  if (!roundF.value && rounds.value.length === 1) roundF.value = rounds.value[0]
}
function closePicker() {
  picking.value = 0
}
function chooseGame(game) {
  const other = courtOfPick(form.picks, game._id)
  if (other && other !== picking.value) delete form.picks[other]
  form.picks[picking.value] = game._id
  closePicker()
}

async function load() {
  if (!matchId.value || !user.isAdmin) return
  const m = await api.getMatch(matchId.value)
  matchNo.value = m.matchNo || ''
  courtCount.value = m.courtCount || 8
  if (!form.date) form.date = datePart(m.startDate)
  try {
    const [fx, sl, ag] = await Promise.all([
      api.listFixtures(matchId.value),
      api.listScheduleSlots({ matchId: matchId.value }),
      api.listAssignableGames({ matchId: matchId.value })
    ])
    fixtures.value = fx.fixtures || []
    slots.value = sl || []
    games.value = ag.games || []
  } catch (e) {
    fixtures.value = []
  }
}

async function gen() {
  const m = await api.getMatch(matchId.value)
  const n = m.teamCount || 0
  if (n < 2) return toast('请先录入至少 2 支队伍')
  const itemN = (m.items || []).length || 5
  const expect = (n * (n - 1)) / 2
  if (!(await confirm(`将生成约 ${expect} 场、${expect * itemN} 局，不自动排场地时间。已有排期会清空。`))) return
  const r = await api.generateFixtures(matchId.value)
  toast(`已生成 ${r.count} 场 / ${r.subCount} 局`, 'success')
  await load()
}

async function save() {
  const assignments = form.courtNos
    .map((courtNo) => ({ courtNo, subFixtureId: form.picks[courtNo] }))
    .filter((a) => a.subFixtureId)
  await api.saveScheduleSlot({
    matchId: matchId.value,
    name: form.name,
    date: form.date,
    startTime: form.startTime,
    endTime: form.endTime,
    courtNos: [...form.courtNos],
    assignments
  })
  toast('已下发到各局', 'success')
  form.picks = {}
  await load()
}

async function removeSlot(s) {
  if (!(await confirm(`删除「${s.name}」？`))) return
  await api.deleteScheduleSlot({ id: s._id })
  await load()
}

onLoad((q) => {
  matchId.value = q.id || ''
  if (!user.isAdmin) {
    toast('需要管理员权限')
    setTimeout(() => uni.navigateBack(), 500)
  }
})
onShow(load)
</script>

<style lang="scss" scoped>
.block { padding: 24rpx 28rpx; margin-bottom: 16rpx; }
.rn { font-weight: 700; color: $hg-primary; margin-bottom: 8rpx; }
.fx { padding: 12rpx 0; border-bottom: 1rpx solid #f3f6f9; }
.ft { font-weight: 600; }
.gm { font-size: 24rpx; color: $hg-text2; margin-top: 6rpx; }
.danger { color: $hg-lose; font-size: 26rpx; margin-top: 12rpx; display: block; }
.lab-row { display: flex; align-items: center; justify-content: space-between; }
.quick { display: flex; gap: 24rpx; }
.link { color: $hg-primary; font-size: 26rpx; }
.chips { display: flex; flex-wrap: wrap; gap: 12rpx; margin-bottom: 16rpx; }
.chips.nowrap { flex-wrap: nowrap; margin-bottom: 0; }
.chip { padding: 10rpx 20rpx; border: 1rpx solid $hg-line; border-radius: 999rpx; white-space: nowrap; }
.chip.on { border-color: $hg-primary; color: $hg-primary; background: $hg-primary-light; }
.col { flex: 1; }
.btn-primary { margin-top: 8rpx; }
.court-grid { display: flex; flex-direction: column; gap: 12rpx; margin: 8rpx 0 16rpx; }
.court-card { border: 1rpx solid $hg-line; border-radius: 16rpx; padding: 20rpx 24rpx; background: #f8fafc; }
.court-card.filled { background: $hg-primary-light; border-color: $hg-primary; }
.cc-top { display: flex; justify-content: space-between; margin-bottom: 8rpx; }
.cc-no { font-weight: 700; }
.cc-hint, .cc-clear { color: $hg-primary; font-size: 24rpx; }
.cc-vs { font-size: 30rpx; font-weight: 700; }
.cc-item { margin-top: 6rpx; color: $hg-primary; font-weight: 600; }
.cc-code { margin-top: 4rpx; font-size: 22rpx; color: $hg-text3; }
.cc-empty { color: $hg-text3; font-size: 24rpx; }
.mask {
  position: fixed;
  left: 0; right: 0; top: 0; bottom: 0;
  background: rgba(16, 24, 40, 0.45);
  z-index: 80;
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  max-height: 86vh;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  padding: 24rpx 28rpx 40rpx;
  box-sizing: border-box;
}
.sheet-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16rpx; }
.sheet-t { font-weight: 700; font-size: 30rpx; }
.chip-scroll { width: 100%; margin-top: 12rpx; white-space: nowrap; }
.pick-scroll { height: 52vh; margin-top: 16rpx; }
.pg { padding: 16rpx 0; border-bottom: 1rpx solid #f3f6f9; }
.pg-vs { font-weight: 700; font-size: 30rpx; }
.pg-r { font-size: 22rpx; color: $hg-text3; margin: 4rpx 0 12rpx; }
.pg-items { display: flex; flex-wrap: wrap; gap: 12rpx; }
.pg-item { min-width: 160rpx; padding: 12rpx 16rpx; border: 1rpx solid $hg-line; border-radius: 12rpx; }
.pg-item.on { border-color: $hg-primary; background: $hg-primary-light; }
.pg-item.used { opacity: 0.55; }
.pg-name { display: block; font-weight: 700; }
.pg-code { display: block; font-size: 20rpx; color: $hg-text3; margin-top: 4rpx; }
.pg-used { display: block; font-size: 20rpx; color: $hg-lose; margin-top: 4rpx; }
</style>
