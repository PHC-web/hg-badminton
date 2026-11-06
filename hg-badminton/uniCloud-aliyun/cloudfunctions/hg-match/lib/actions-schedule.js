'use strict'

module.exports = function createScheduleActions(h) {
  const {
    pickId,
    getById,
    listCol,
    setDoc,
    upd,
    rem,
    needAdmin,
    hydrateFixture,
    slotDateTime,
    fail,
    nid,
    nowIso
  } = h

  async function clearSlotSubs(slot) {
    const assigns = Array.isArray(slot?.assignments) ? slot.assignments : []
    for (const a of assigns) {
      if (!a?.subFixtureId) continue
      const sub = await getById('sub_fixtures', a.subFixtureId)
      if (!sub) continue
      if (sub.slotId && slot._id && sub.slotId !== slot._id) continue
      await upd('sub_fixtures', sub._id, {
        venue: '',
        scheduleTime: '',
        slotId: '',
        courtNo: 0
      })
    }
  }

  async function applySlot(slot, match) {
    const date = slot.date || String(match.startDate || '').slice(0, 10)
    const when = slotDateTime(date, slot.startTime)
    const assigns = Array.isArray(slot.assignments) ? slot.assignments : []
    for (const a of assigns) {
      const subId = a?.subFixtureId
      const courtNo = Number(a?.courtNo) || 0
      if (!subId || courtNo < 1) continue
      await upd('sub_fixtures', subId, {
        venue: `${courtNo}号`,
        scheduleTime: when,
        slotId: slot._id,
        courtNo
      })
    }
  }

  return {
    async listScheduleSlots(data, { userId }) {
      await needAdmin(userId)
      const matchId = pickId(data, ['matchId', 'id'])
      if (!matchId) fail('缺少比赛 id')
      const list = await listCol('schedule_slots', { matchId })
      list.sort((a, b) =>
        String(a.startTime || '').localeCompare(String(b.startTime || '')) ||
        String(a.createdAt || '').localeCompare(String(b.createdAt || ''))
      )
      return list
    },

    async saveScheduleSlot(data = {}, { userId }) {
      await needAdmin(userId)
      const matchId = pickId(data, ['matchId'])
      if (!matchId) fail('缺少比赛 id')
      const match = await getById('matches', matchId)
      if (!match || match.deleted) fail('比赛不存在')
      const name = String(data.name || '').trim()
      if (!name) fail('请填写时段名称')
      const startTime = String(data.startTime || '').trim()
      const endTime = String(data.endTime || '').trim()
      if (!startTime || !endTime) fail('请填写开始和结束时间')
      const courtCount = Math.max(1, Number(match.courtCount) || 8)
      const courtNos = (Array.isArray(data.courtNos) ? data.courtNos : [])
        .map((n) => Number(n))
        .filter((n) => n >= 1 && n <= courtCount)
      if (!courtNos.length) fail('请至少选择一片场地')
      const rawAssign = Array.isArray(data.assignments) ? data.assignments : []
      const assignments = []
      const usedCourt = new Set()
      const usedSub = new Set()
      for (const a of rawAssign) {
        const courtNo = Number(a?.courtNo) || 0
        const subFixtureId = String(a?.subFixtureId || '').trim()
        if (!courtNo || !subFixtureId) continue
        if (!courtNos.includes(courtNo)) fail(`${courtNo} 号场地未在本时段选用`)
        if (usedCourt.has(courtNo)) fail(`${courtNo} 号场地在本时段重复安排`)
        if (usedSub.has(subFixtureId)) fail('同一局不能同时安排到多片场地')
        const sub = await getById('sub_fixtures', subFixtureId)
        if (!sub) fail('对局不存在')
        const f = await getById('fixtures', sub.fixtureId)
        if (!f || f.matchId !== matchId) fail('对局不属于本场比赛')
        if (sub.slotId && data.id && sub.slotId !== data.id) fail(`${sub.code || '该局'} 已排在其他时段`)
        if (sub.slotId && !data.id) fail(`${sub.code || '该局'} 已排在其他时段`)
        usedCourt.add(courtNo)
        usedSub.add(subFixtureId)
        assignments.push({ courtNo, subFixtureId, code: sub.code || '' })
      }
      if (!assignments.length) fail('请为场地选择对局编号')

      const date = String(data.date || match.startDate || '').slice(0, 10)
      const fields = {
        matchId,
        name,
        date,
        startTime,
        endTime,
        courtNos,
        assignments,
        updatedAt: nowIso()
      }

      let slot
      if (data.id) {
        const old = await getById('schedule_slots', data.id)
        if (!old || old.matchId !== matchId) fail('时段不存在')
        await clearSlotSubs(old)
        await upd('schedule_slots', data.id, fields)
        slot = { _id: data.id, ...fields }
      } else {
        const id = nid('ss_')
        slot = await setDoc('schedule_slots', id, { ...fields, createdAt: nowIso() })
      }
      await applySlot(slot, match)
      return slot
    },

    async deleteScheduleSlot(data = {}, { userId }) {
      await needAdmin(userId)
      const id = pickId(data, ['id', 'slotId'])
      if (!id) fail('缺少时段 id')
      const slot = await getById('schedule_slots', id)
      if (!slot) fail('时段不存在')
      await clearSlotSubs(slot)
      await rem('schedule_slots', id)
      return { ok: true }
    },

    async listAssignableGames(data, { userId }) {
      await needAdmin(userId)
      const matchId = pickId(data, ['matchId', 'id'])
      if (!matchId) fail('缺少比赛 id')
      const raw = await listCol('fixtures', { matchId })
      const fixtures = []
      for (const f of raw) fixtures.push(await hydrateFixture(f))
      fixtures.sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
      const games = []
      for (const f of fixtures) {
        for (const s of f.subFixtures || []) {
          games.push({
            _id: s._id,
            code: s.code || '',
            itemName: s.itemName,
            venue: s.venue || '',
            scheduleTime: s.scheduleTime || '',
            slotId: s.slotId || '',
            courtNo: s.courtNo || 0,
            fixtureId: f._id,
            fixtureCode: f.code,
            round: f.round,
            teamAName: f.teamAName,
            teamBName: f.teamBName
          })
        }
      }
      return { matchNo: (await getById('matches', matchId))?.matchNo || '', games }
    }
  }
}
