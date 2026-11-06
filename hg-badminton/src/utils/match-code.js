/** 比赛编号：BS001-R01-F01-MD1（比赛-轮次-场次-项目局） */
export const ITEM_CODES = {
  男单: 'MS',
  女单: 'WS',
  男双: 'MD',
  女双: 'WD',
  混双: 'XD'
}

export function padNum(n, w = 2) {
  return String(Math.max(0, Number(n) || 0)).padStart(w, '0')
}

export function formatMatchNo(seq) {
  return `BS${padNum(seq, 3)}`
}

export function parseMatchNoSeq(no) {
  const m = String(no || '').match(/^BS(\d+)$/i)
  return m ? Number(m[1]) : 0
}

export function nextMatchNo(existing = []) {
  let max = 0
  for (const n of existing) max = Math.max(max, parseMatchNoSeq(n))
  return formatMatchNo(max + 1)
}

export function makeFixtureCode(matchNo, roundNo, pairNo) {
  return `${matchNo || 'BS000'}-R${padNum(roundNo, 2)}-F${padNum(pairNo, 2)}`
}

export function makeGameCode(fixtureCode, itemName, seqInItem = 1) {
  const prefix = ITEM_CODES[itemName] || 'XX'
  return `${fixtureCode}-${prefix}${Math.max(1, Number(seqInItem) || 1)}`
}

export function slotDateTime(date, hm) {
  const d = String(date || '').slice(0, 10)
  const t = String(hm || '').trim()
  if (!d || !t) return ''
  const iso = new Date(`${d}T${t.length === 5 ? `${t}:00` : t}`)
  if (Number.isNaN(iso.getTime())) return ''
  return iso.toISOString()
}

export function datePart(raw) {
  if (!raw) return ''
  const s = String(raw)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return ''
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function flattenGames(fixtures = []) {
  const out = []
  for (const f of fixtures) {
    for (const s of f.subFixtures || []) {
      out.push({
        ...s,
        fixtureId: f._id,
        fixtureCode: f.code || '',
        round: f.round,
        roundNo: f.roundNo,
        teamAName: f.teamAName,
        teamBName: f.teamBName,
        label: `${s.code || ''} ${f.teamAName || ''} vs ${f.teamBName || ''} · ${s.itemName || ''}`
      })
    }
  }
  return out
}
