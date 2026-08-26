'use strict'

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
  return { a, b, finished: a >= setsToWin || b >= setsToWin, winner: a >= setsToWin ? 'a' : b >= setsToWin ? 'b' : null }
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

function autoGroup(teamIds) {
  const n = teamIds.length
  if (n <= 4) return [{ name: 'A', teamIds: [...teamIds] }]
  let groupSize = 4
  if (n % 4 === 1 || n % 4 === 2) groupSize = 3
  const groups = []
  const names = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let i = 0
  let gi = 0
  while (i < teamIds.length) {
    const remain = teamIds.length - i
    let size = groupSize
    if (remain === 5 && groupSize === 4) size = 3
    if (remain < 3 && groups.length) {
      groups[groups.length - 1].teamIds.push(...teamIds.slice(i))
      break
    }
    groups.push({ name: names[gi++], teamIds: teamIds.slice(i, i + size) })
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
  return { size, pairs }
}

function rankingFromFixtures(teams, fixtures) {
  const map = {}
  teams.forEach((t) => {
    map[t._id] = { teamId: t._id, name: t.name, win: 0, lose: 0, points: 0, setDiff: 0 }
  })
  fixtures.forEach((f) => {
    if (!['finished', 'confirmed'].includes(f.status) || !f.result) return
    const a = map[f.teamAId]
    const b = map[f.teamBId]
    if (!a || !b) return
    a.setDiff += (f.result.teamAScore || 0) - (f.result.teamBScore || 0)
    b.setDiff += (f.result.teamBScore || 0) - (f.result.teamAScore || 0)
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
  return Object.values(map).sort((x, y) => y.points - x.points || y.setDiff - x.setDiff)
}

function isAdmin(user) {
  return (user?.roles || []).some((r) => ['super_admin', 'admin'].includes(r))
}

function isSuper(user) {
  return (user?.roles || []).includes('super_admin')
}

function assignableRoles(user) {
  if (isSuper(user)) return ['admin', 'referee', 'captain', 'member']
  if (isAdmin(user)) return ['referee', 'captain', 'member']
  return []
}

module.exports = {
  judgeSetEnd,
  tallySets,
  judgeTeamWinner,
  autoGroup,
  roundRobinRounds,
  knockoutFirstRound,
  rankingFromFixtures,
  isAdmin,
  isSuper,
  assignableRoles
}
