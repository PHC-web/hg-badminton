export function gameVs(g) {
  if (!g) return ''
  return `${g.teamAName || '待定'} vs ${g.teamBName || '待定'}`
}

export function gameLine(g) {
  if (!g) return ''
  return `${gameVs(g)} · ${g.itemName || '对局'}`
}

export function uniqueRounds(games = []) {
  return [...new Set(games.map((g) => g.round).filter(Boolean))]
}

export function uniqueItems(games = []) {
  return [...new Set(games.map((g) => g.itemName).filter(Boolean))]
}

export function filterGames(games = [], { keyword, round, item } = {}) {
  const q = String(keyword || '').trim().toLowerCase()
  return games.filter((g) => {
    if (g.slotId) return false
    if (round && g.round !== round) return false
    if (item && g.itemName !== item) return false
    if (!q) return true
    const hay = `${g.code || ''} ${g.teamAName || ''} ${g.teamBName || ''} ${g.itemName || ''} ${g.round || ''}`.toLowerCase()
    return hay.includes(q)
  })
}

export function groupGamesByFixture(games = []) {
  const map = new Map()
  for (const g of games) {
    const key = g.fixtureId || `${g.round}-${g.teamAName}-${g.teamBName}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        round: g.round || '',
        fixtureCode: g.fixtureCode || '',
        teamAName: g.teamAName || '',
        teamBName: g.teamBName || '',
        list: []
      })
    }
    map.get(key).list.push(g)
  }
  return [...map.values()]
}

export function courtOfPick(picks, gameId) {
  for (const [k, v] of Object.entries(picks || {})) {
    if (v === gameId) return Number(k)
  }
  return 0
}

export function findGame(games = [], assign = {}) {
  return (
    games.find((g) => g._id === assign.subFixtureId) ||
    games.find((g) => assign.code && g.code === assign.code) ||
    null
  )
}
