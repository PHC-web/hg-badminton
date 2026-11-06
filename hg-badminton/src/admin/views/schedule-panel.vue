<template>
  <view class="card">
    <view class="sub">对阵编号</view>
    <view class="hint">编号格式：{{ match?.matchNo || 'BS001' }}-R01-F01-MD1（比赛-轮次-场次-项目）。生成后不自动排场地和时间。</view>
    <button class="btn ghost" @click="gen">生成 / 重新生成对阵</button>
    <view v-for="g in grouped" :key="g.round" class="round">
      <view class="rn">{{ g.round }}</view>
      <view v-for="f in g.list" :key="f._id" class="fx">
        <text class="code">{{ f.code }}</text>
        <text>{{ f.teamAName }} vs {{ f.teamBName }}</text>
        <view class="games">
          <text v-for="s in f.subFixtures" :key="s._id" class="g">
            {{ s.code }} {{ s.itemName }}{{ s.venue ? ` · ${s.venue}` : '' }}{{ s.scheduleTime ? ` · ${fmtTime(s.scheduleTime)}` : '' }}
          </text>
        </view>
      </view>
    </view>
    <view v-if="!fixtures.length" class="empty">尚未生成对阵</view>
  </view>

  <view class="card">
    <view class="sub">排期（时段 + 场地挂局）</view>
    <view v-for="s in slots" :key="s._id" class="slot">
      <view class="sn">{{ s.name }}　{{ s.date }} {{ s.startTime }}～{{ s.endTime }}</view>
      <view class="as">
        <text v-for="a in s.assignments" :key="a.courtNo" class="as-item">
          {{ a.courtNo }}号　{{ slotAssignText(a) }}
        </text>
      </view>
      <text class="link danger" @click="removeSlot(s)">删除时段</text>
    </view>
    <view v-if="!slots.length" class="empty">还没有排期，下面创建一个时段</view>

    <label>时段名称</label>
    <input class="inp" v-model="form.name" placeholder="如 第1轮 / 上午第一节" />
    <view class="row">
      <view class="col">
        <label>日期</label>
        <input class="inp" type="date" v-model="form.date" />
      </view>
      <view class="col">
        <label>开始</label>
        <input class="inp" type="time" v-model="form.startTime" />
      </view>
      <view class="col">
        <label>结束</label>
        <input class="inp" type="time" v-model="form.endTime" />
      </view>
    </view>

    <view class="lab-row">
      <label>选用场地</label>
      <view class="quick">
        <text class="link" @click="selectAllCourts">全选</text>
        <text class="link" @click="clearCourts">清空</text>
      </view>
    </view>
    <view class="chips">
      <text
        v-for="n in courtList"
        :key="n"
        class="chip"
        :class="{ on: form.courtNos.includes(n) }"
        @click="toggleCourt(n)"
      >{{ n }}号</text>
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
    <view v-else class="empty">先点选上方场地，再为每片场地挂一局</view>

    <button class="btn" style="margin-top: 16px;" @click="save">保存并下发时间和场地</button>
  </view>

  <view v-if="picking" class="mask" @click="closePicker">
    <view class="sheet" @click.stop>
      <view class="sheet-bar">
        <view class="sheet-t">为 {{ picking }} 号场地选择对局</view>
        <text class="link" @click="closePicker">关闭</text>
      </view>
      <input class="inp" v-model="kw" placeholder="搜队伍、项目或编号，如 一建 / 男双 / R01" />
      <view class="chips tight">
        <text class="chip" :class="{ on: !roundF }" @click="roundF = ''">全部轮次</text>
        <text v-for="r in rounds" :key="r" class="chip" :class="{ on: roundF === r }" @click="roundF = r">{{ r }}</text>
      </view>
      <view class="chips tight">
        <text class="chip" :class="{ on: !itemF }" @click="itemF = ''">全部项目</text>
        <text v-for="it in items" :key="it" class="chip" :class="{ on: itemF === it }" @click="itemF = it">{{ it }}</text>
      </view>
      <view class="pick-scroll">
        <view v-for="g in pickerGroups" :key="g.key" class="pg">
          <view class="pg-h">
            <text class="pg-vs">{{ g.teamAName }} vs {{ g.teamBName }}</text>
            <text class="pg-r">{{ g.round }} {{ g.fixtureCode }}</text>
          </view>
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
        <view v-if="!pickerGroups.length" class="empty">没有可排对局，试试换轮次或搜索</view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { api } from '@/api'
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

const props = defineProps({ match: Object })
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

const courtList = computed(() => {
  const n = Math.max(1, Number(props.match?.courtCount) || 8)
  return Array.from({ length: n }, (_, i) => i + 1)
})

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

function fmtTime(iso) {
  return formatDate(iso, true)
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
  if (!props.match?._id) return
  try {
    const [fx, sl, ag] = await Promise.all([
      api.listFixtures(props.match._id),
      api.listScheduleSlots({ matchId: props.match._id }),
      api.listAssignableGames({ matchId: props.match._id })
    ])
    fixtures.value = fx.fixtures || []
    slots.value = sl || []
    games.value = ag.games || []
    if (!form.date) form.date = datePart(props.match.startDate)
  } catch (e) {
    fixtures.value = []
  }
}

async function gen() {
  const n = props.match?.teamCount || 0
  if (n < 2) return toast('请先录入至少 2 支队伍')
  const itemsN = (props.match?.items || []).length || 5
  const expect = (n * (n - 1)) / 2
  if (!(await confirm(`按 ${n} 支队伍生成单循环：约 ${n - 1 + (n % 2)} 轮、${expect} 场、${expect * itemsN} 局。不自动排场地时间。已有排期会被清空。`))) return
  const r = await api.generateFixtures(props.match._id)
  toast(`已生成 ${r.count} 场 / ${r.subCount} 局（${r.matchNo || ''}）`, 'success')
  await load()
}

async function save() {
  const assignments = form.courtNos
    .map((courtNo) => ({ courtNo, subFixtureId: form.picks[courtNo] }))
    .filter((a) => a.subFixtureId)
  await api.saveScheduleSlot({
    matchId: props.match._id,
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
  if (!(await confirm(`删除时段「${s.name}」并清空其场地时间？`))) return
  await api.deleteScheduleSlot({ id: s._id })
  await load()
}

watch(() => props.match?._id, load)
onMounted(load)
</script>

<style lang="scss" scoped>
.card { background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 16px; }
.sub { font-weight: 700; margin-bottom: 8px; font-size: 16px; }
.hint { font-size: 14px; color: #4a5563; margin-bottom: 12px; line-height: 1.5; }
.btn { height: 40px; padding: 0 16px; background: #006db8; color: #fff; border: none; border-radius: 8px; font-size: 15px; }
.btn.ghost { background: #e8f3fb; color: #006db8; margin-bottom: 12px; }
.round { margin-top: 14px; }
.rn { font-weight: 700; color: #006db8; margin-bottom: 6px; }
.fx { padding: 8px 0; border-bottom: 1px solid #f7f8fa; font-size: 15px; color: #1a2332; }
.code { font-weight: 700; color: #006db8; margin-right: 8px; }
.games { display: flex; flex-wrap: wrap; gap: 6px 12px; margin-top: 4px; }
.g { font-size: 13px; color: #4a5563; }
.empty { padding: 12px 0; color: #4a5563; font-size: 15px; }
.slot { padding: 10px 0; border-bottom: 1px solid #f7f8fa; }
.sn { font-weight: 700; }
.as { display: flex; flex-direction: column; gap: 4px; margin: 8px 0; color: #3d4a57; font-size: 14px; }
.as-item { line-height: 1.5; }
.link { color: #006db8; font-size: 15px; }
.danger { color: #e5484d; }
label { display: block; font-size: 15px; color: #3d4a57; margin: 12px 0 6px; }
.lab-row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.lab-row label { margin: 0; }
.quick { display: flex; gap: 16px; }
.inp { width: 100%; border: 1px solid #c5d0db; border-radius: 8px; padding: 10px 12px; box-sizing: border-box; font-size: 16px; }
.row { display: flex; gap: 12px; }
.col { flex: 1; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.chips.tight { margin: 10px 0 0; }
.chip { padding: 6px 12px; border: 1px solid #c5d0db; border-radius: 999px; font-size: 15px; }
.chip.on { border-color: #006db8; color: #006db8; background: #e8f3fb; }
.court-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.court-card {
  border: 1px solid #c5d0db;
  border-radius: 10px;
  padding: 12px 14px;
  min-height: 108px;
  background: #f8fafc;
  cursor: pointer;
  box-sizing: border-box;
}
.court-card.filled { background: #e8f3fb; border-color: #006db8; }
.cc-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.cc-no { font-weight: 700; font-size: 15px; }
.cc-hint, .cc-clear { font-size: 13px; color: #006db8; }
.cc-vs { font-size: 16px; font-weight: 700; color: #1a2332; line-height: 1.35; }
.cc-item { margin-top: 4px; font-size: 15px; color: #006db8; font-weight: 600; }
.cc-code { margin-top: 2px; font-size: 12px; color: #4a5563; word-break: break-all; }
.cc-empty { color: #8b95a3; font-size: 14px; }
.mask {
  position: fixed;
  inset: 0;
  background: rgba(16, 24, 40, 0.45);
  z-index: 80;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sheet {
  width: min(880px, 100%);
  max-height: 86vh;
  background: #fff;
  border-radius: 16px 16px 0 0;
  padding: 16px 20px 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}
.sheet-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.sheet-t { font-size: 17px; font-weight: 700; }
.pick-scroll { margin-top: 12px; overflow: auto; max-height: 56vh; }
.pg { padding: 12px 0; border-bottom: 1px solid #f0f3f6; }
.pg-h { display: flex; justify-content: space-between; gap: 12px; align-items: baseline; margin-bottom: 8px; }
.pg-vs { font-weight: 700; font-size: 16px; }
.pg-r { font-size: 13px; color: #4a5563; }
.pg-items { display: flex; flex-wrap: wrap; gap: 8px; }
.pg-item {
  min-width: 120px;
  padding: 8px 10px;
  border: 1px solid #c5d0db;
  border-radius: 8px;
  background: #fff;
  cursor: pointer;
}
.pg-item.on { border-color: #006db8; background: #e8f3fb; }
.pg-item.used { opacity: 0.55; }
.pg-name { display: block; font-weight: 700; font-size: 15px; }
.pg-code { display: block; font-size: 12px; color: #4a5563; margin-top: 2px; }
.pg-used { display: block; font-size: 12px; color: #e5484d; margin-top: 2px; }
</style>
