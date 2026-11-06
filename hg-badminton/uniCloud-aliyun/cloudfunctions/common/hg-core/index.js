'use strict'

const GROUP_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')
const CN_ROUNDS = '一二三四五六七八九十'.split('')

const DEFAULT_ITEMS = [
  { name: '男单', memberCount: 1 },
  { name: '女单', memberCount: 1 },
  { name: '男双', memberCount: 2 },
  { name: '女双', memberCount: 2 },
  { name: '混双', memberCount: 2 }
]

const ITEM_MEMBER_COUNT = {
  男单: 1,
  女单: 1,
  男双: 2,
  女双: 2,
  混双: 2
}

/**
 * 与 hg-shared 的 toTs 同款：无时区的日期时间串按北京时间（+08:00）解析，
 * 避免云函数 UTC 环境下整体偏移 8 小时。
 */
const NAIVE_DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/

function toTs(value) {
  if (value == null || value === '') return NaN
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  let s = String(value).trim()
  if (NAIVE_DT_RE.test(s)) {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) s += ':00'
    return new Date(`${s}+08:00`).getTime()
  }
  return new Date(s).getTime()
}

function sanitizeMatchItems(raw) {
  if (!Array.isArray(raw) || !raw.length) throw new Error('请至少选择 1 个项目')
  if (raw.length > 9) throw new Error('每场项目最多 9 项')
  return raw.map((it, i) => {
    const name = String(it?.name || '').trim()
    const memberCount = ITEM_MEMBER_COUNT[name]
    if (!memberCount) throw new Error(`不支持的项目：${name || '空'}`)
    return { name, memberCount, sort: i + 1 }
  })
}

function sanitizeTeamRule(raw, itemCount) {
  const n = Math.max(1, Number(itemCount) || 1)
  const mode = raw?.mode === 'playAll' ? 'playAll' : 'firstToWin'
  const win = Math.max(1, Math.min(n, Number(raw?.itemsWinToWin) || Math.ceil(n / 2)))
  return { mode, itemsWinToWin: win }
}

const DEFAULT_CONCURRENT = {
  enabled: false,
  allowMale: false,
  allowFemale: false,
  maxMalePeople: 0,
  maxFemalePeople: 0,
  maxMaleItems: 1,
  maxFemaleItems: 1
}

function judgeSetEnd(a, b, { points = 21, capPoints = 30, deuceMargin = 2 } = {}) {
  if (a === capPoints || b === capPoints) return a !== b
  return (a >= points && a - b >= deuceMargin) || (b >= points && b - a >= deuceMargin)
}

function tallySets(sets = [], setsToWin = 2) {
  let a = 0
  let b = 0
  sets.forEach((s) => {
    if (s.winner === 'a') a += 1
    if (s.winner === 'b') b += 1
  })
  return {
    a,
    b,
    finished: a >= setsToWin || b >= setsToWin,
    winner: a >= setsToWin ? 'a' : b >= setsToWin ? 'b' : null
  }
}

function judgeTeamWinner(subFixtures, teamRule, itemsCount) {
  const aWins = subFixtures.filter((s) => s.winner === 'a' && ['finished', 'confirmed'].includes(s.status)).length
  const bWins = subFixtures.filter((s) => s.winner === 'b' && ['finished', 'confirmed'].includes(s.status)).length
  const done = subFixtures.filter((s) => ['finished', 'confirmed'].includes(s.status)).length
  const mode = teamRule?.mode || 'firstToWin'
  const n = teamRule?.itemsWinToWin || Math.ceil((itemsCount || subFixtures.length) / 2)
  if (mode === 'firstToWin') {
    if (aWins >= n) return { winner: 'a', aScore: aWins, bScore: bWins, locked: true }
    if (bWins >= n) return { winner: 'b', aScore: aWins, bScore: bWins, locked: true }
    return { winner: null, aScore: aWins, bScore: bWins, locked: false }
  }
  if (done >= subFixtures.length && subFixtures.length) {
    if (aWins > bWins) return { winner: 'a', aScore: aWins, bScore: bWins, locked: true }
    if (bWins > aWins) return { winner: 'b', aScore: aWins, bScore: bWins, locked: true }
    return { winner: null, aScore: aWins, bScore: bWins, locked: true, draw: true }
  }
  return { winner: null, aScore: aWins, bScore: bWins, locked: false }
}

function toCNRound(n) {
  if (n >= 1 && n <= CN_ROUNDS.length) return CN_ROUNDS[n - 1]
  return String(n)
}

function formatCourtLabel(startNo, count = 1) {
  const s = Number(startNo) || 1
  const c = Math.max(1, Number(count) || 1)
  if (c <= 1) return `${s}号`
  return `${s}-${s + c - 1}号`
}

function autoGroup(teamIds) {
  const n = teamIds.length
  if (n <= 4) return [{ name: 'A', teamIds: [...teamIds] }]
  let groupSize = 4
  if (n % 4 === 1 || n % 4 === 2) groupSize = 3
  const groups = []
  const ids = [...teamIds]
  let i = 0
  let gi = 0
  while (i < ids.length) {
    const remain = ids.length - i
    let size = groupSize
    if (remain === 5 && groupSize === 4) size = 3
    if (remain < 3 && groups.length) {
      groups[groups.length - 1].teamIds.push(...ids.slice(i))
      break
    }
    groups.push({ name: GROUP_NAMES[gi++], teamIds: ids.slice(i, i + size) })
    i += size
  }
  return groups
}

function roundRobinRounds(teamIds) {
  const ids = [...teamIds]
  if (ids.length % 2 === 1) ids.push(null)
  const n = ids.length
  const rounds = []
  const arr = [...ids]
  for (let r = 0; r < n - 1; r++) {
    const pairs = []
    for (let i = 0; i < n / 2; i++) {
      const a = arr[i]
      const b = arr[n - 1 - i]
      if (a && b) pairs.push([a, b])
    }
    rounds.push(pairs)
    arr.splice(1, 0, arr.pop())
  }
  return rounds
}

function planRoundRobin(teamIds) {
  const rounds = roundRobinRounds(teamIds)
  const fixtures = []
  rounds.forEach((pairs, ri) => {
    const roundNo = ri + 1
    const roundShort = toCNRound(roundNo)
    pairs.forEach((p, pi) => {
      fixtures.push({
        roundIndex: ri,
        roundNo,
        roundShort,
        roundLabel: `第${roundShort}轮`,
        pairNo: pi + 1,
        teamAId: p[0],
        teamBId: p[1]
      })
    })
  })
  return { fixtures, rounds: rounds.length, totalFixtures: fixtures.length }
}

const ITEM_CODES = { 男单: 'MS', 女单: 'WS', 男双: 'MD', 女双: 'WD', 混双: 'XD' }

function padNum(n, w = 2) {
  return String(Math.max(0, Number(n) || 0)).padStart(w, '0')
}

function formatMatchNo(seq) {
  return `BS${padNum(seq, 3)}`
}

function parseMatchNoSeq(no) {
  const m = String(no || '').match(/^BS(\d+)$/i)
  return m ? Number(m[1]) : 0
}

function nextMatchNo(existing = []) {
  let max = 0
  for (const n of existing) max = Math.max(max, parseMatchNoSeq(n))
  return formatMatchNo(max + 1)
}

function makeFixtureCode(matchNo, roundNo, pairNo) {
  return `${matchNo || 'BS000'}-R${padNum(roundNo, 2)}-F${padNum(pairNo, 2)}`
}

function makeGameCode(fixtureCode, itemName, seqInItem = 1) {
  const prefix = ITEM_CODES[itemName] || 'XX'
  return `${fixtureCode}-${prefix}${Math.max(1, Number(seqInItem) || 1)}`
}

function slotDateTime(date, hm) {
  const d = String(date || '').slice(0, 10)
  const t = String(hm || '').trim()
  if (!d || !t) return ''
  const iso = new Date(`${d}T${t.length === 5 ? `${t}:00` : t}+08:00`)
  if (Number.isNaN(iso.getTime())) return ''
  return iso.toISOString()
}

function scheduleRoundRobin(teamIds, opts = {}) {
  const courtCount = Math.max(1, Number(opts.courtCount) || 10)
  const courtsPerMatch = Math.max(1, Number(opts.courtsPerMatch ?? opts.courtsPerFixture) || 2)
  const concurrent = Math.max(1, Math.floor(courtCount / courtsPerMatch))
  const interval = Math.max(15, Number(opts.intervalMinutes) || 45)
  let start = new Date(toTs(opts.startTime || opts.startAt))
  if (Number.isNaN(start.getTime())) start = new Date()

  const rounds = roundRobinRounds(teamIds)
  const fixtures = []
  let slotIndex = 0

  rounds.forEach((pairs, ri) => {
    const roundNo = ri + 1
    const roundShort = toCNRound(roundNo)
    const roundLabel = `第${roundShort}轮`
    for (let offset = 0, wave = 1; offset < pairs.length; offset += concurrent, wave++) {
      const batch = pairs.slice(offset, offset + concurrent)
      const scheduleTime = new Date(start.getTime() + slotIndex * interval * 60000).toISOString()
      batch.forEach((p, pi) => {
        const courtStart = pi * courtsPerMatch + 1
        const courtEnd = courtStart + courtsPerMatch - 1
        fixtures.push({
          roundIndex: ri,
          roundNo,
          roundShort,
          roundLabel,
          wave,
          pairIndex: offset + pi,
          teamAId: p[0],
          teamBId: p[1],
          venue: formatCourtLabel(courtStart, courtsPerMatch),
          courtStart,
          courtEnd,
          scheduleTime,
          code: wave > 1 ? `R${roundNo}-W${wave}-${pi + 1}` : `R${roundNo}-${pi + 1}`
        })
      })
      slotIndex += 1
    }
  })

  return {
    fixtures,
    concurrent,
    courtCount,
    courtsPerMatch,
    totalSlots: slotIndex,
    totalFixtures: fixtures.length
  }
}

function nextPow2(n) {
  let p = 1
  while (p < n) p *= 2
  return p
}

function knockoutFirstRound(teamIds) {
  const size = nextPow2(Math.max(teamIds.length, 2))
  const seeded = [...teamIds]
  while (seeded.length < size) seeded.push(null)
  const pairs = []
  for (let i = 0; i < size; i += 2) pairs.push([seeded[i], seeded[i + 1]])
  return { size, pairs, rounds: Math.log2(size) }
}

function rankingFromFixtures(teams, fixtures) {
  const map = {}
  teams.forEach((t) => {
    map[t._id] = {
      teamId: t._id,
      name: t.name,
      win: 0,
      lose: 0,
      points: 0,
      setDiff: 0,
      pointDiff: 0
    }
  })
  fixtures.forEach((f) => {
    if (!['finished', 'confirmed'].includes(f.status) || !f.result) return
    const a = map[f.teamAId]
    const b = map[f.teamBId]
    if (!a || !b) return
    const as = f.result.teamAScore || 0
    const bs = f.result.teamBScore || 0
    a.setDiff += as - bs
    b.setDiff += bs - as
    if (f.result.winnerTeamId === f.teamAId) {
      a.win += 1
      a.points += 2
      b.lose += 1
      b.points += 1
    } else if (f.result.winnerTeamId === f.teamBId) {
      b.win += 1
      b.points += 2
      a.lose += 1
      a.points += 1
    }
  })
  return Object.values(map).sort((x, y) => y.points - x.points || y.setDiff - x.setDiff || y.win - x.win)
}

function normalizeConcurrent(raw) {
  const d = DEFAULT_CONCURRENT
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    enabled: !!c.enabled,
    allowMale: !!c.allowMale,
    allowFemale: !!c.allowFemale,
    maxMalePeople: Math.max(0, Number(c.maxMalePeople) || 0),
    maxFemalePeople: Math.max(0, Number(c.maxFemalePeople) || 0),
    maxMaleItems: Math.max(1, Number(c.maxMaleItems) || 1),
    maxFemaleItems: Math.max(1, Number(c.maxFemaleItems) || 1)
  }
}

function itemGenderNeed(itemName = '') {
  const n = String(itemName)
  if (n.includes('混')) return { male: 1, female: 1, total: 2 }
  if (n.includes('女双')) return { male: 0, female: 2, total: 2 }
  if (n.includes('男双')) return { male: 2, female: 0, total: 2 }
  if (n.includes('女单') || (n.includes('女') && n.includes('单'))) return { male: 0, female: 1, total: 1 }
  if (n.includes('男单') || (n.includes('男') && n.includes('单'))) return { male: 1, female: 0, total: 1 }
  return { male: 0, female: 0, total: 0 }
}

function validateTeamConcurrent(match, teamSubs) {
  const cfg = normalizeConcurrent(match.concurrent)
  const countById = new Map()
  const genderById = new Map()

  teamSubs.forEach((row) => {
    ;(row.members || []).forEach((m) => {
      if (!m?.id) return
      countById.set(m.id, (countById.get(m.id) || 0) + 1)
      genderById.set(m.id, m.gender === 'female' ? 'female' : 'male')
    })
  })

  const males = [...countById.entries()].filter(([id]) => genderById.get(id) === 'male')
  const females = [...countById.entries()].filter(([id]) => genderById.get(id) === 'female')
  const maleMulti = males.filter(([, c]) => c > 1)
  const femaleMulti = females.filter(([, c]) => c > 1)

  if (!cfg.enabled) {
    if (maleMulti.length || femaleMulti.length) {
      return '本场比赛不允许兼项，同一队员只能打 1 个小项'
    }
    return ''
  }
  if (!cfg.allowMale && maleMulti.length) return '本场比赛不允许男生兼项'
  if (!cfg.allowFemale && femaleMulti.length) return '本场比赛不允许女生兼项'
  if (cfg.allowMale) {
    for (const [, c] of males) {
      if (c > cfg.maxMaleItems) return `男生每人最多兼项 ${cfg.maxMaleItems} 个小项`
    }
    if (maleMulti.length > cfg.maxMalePeople) return `男生兼项人数最多 ${cfg.maxMalePeople} 人`
  }
  if (cfg.allowFemale) {
    for (const [, c] of females) {
      if (c > cfg.maxFemaleItems) return `女生每人最多兼项 ${cfg.maxFemaleItems} 个小项`
    }
    if (femaleMulti.length > cfg.maxFemalePeople) return `女生兼项人数最多 ${cfg.maxFemalePeople} 人`
  }
  return ''
}

function isAdmin(user) {
  return (user?.roles || []).some((r) => ['super_admin', 'admin'].includes(r))
}

function isSuper(user) {
  return (user?.roles || []).includes('super_admin')
}

function hasAnyRole(user, roles = []) {
  const mine = user?.roles || []
  return roles.some((r) => mine.includes(r))
}

function genderCount(members = [], gender) {
  return (members || []).filter((m) => m.status === 'active' && m.gender === gender).length
}

function assignableRoles(user) {
  if (isSuper(user)) return ['admin', 'referee', 'captain', 'member']
  if (isAdmin(user)) return ['referee', 'captain', 'member']
  return []
}

module.exports = {
  DEFAULT_ITEMS,
  DEFAULT_CONCURRENT,
  sanitizeMatchItems,
  sanitizeTeamRule,
  judgeSetEnd,
  tallySets,
  judgeTeamWinner,
  toCNRound,
  formatCourtLabel,
  autoGroup,
  roundRobinRounds,
  planRoundRobin,
  scheduleRoundRobin,
  ITEM_CODES,
  nextMatchNo,
  makeFixtureCode,
  makeGameCode,
  slotDateTime,
  nextPow2,
  knockoutFirstRound,
  rankingFromFixtures,
  normalizeConcurrent,
  itemGenderNeed,
  validateTeamConcurrent,
  isAdmin,
  isSuper,
  hasAnyRole,
  genderCount,
  assignableRoles
}
