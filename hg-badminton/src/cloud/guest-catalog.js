/** 游客只读目录：供审核浏览，不入库 */

function daysFromNow(d, h = 9) {
  const t = new Date()
  t.setDate(t.getDate() + d)
  t.setHours(h, 0, 0, 0)
  return t.toISOString()
}

export const GUEST_ACTIVITY_ID = 'guest_activity_demo'
export const GUEST_MATCH_ID = 'guest_match_demo'

export function getGuestActivityList() {
  return [buildGuestActivitySummary()]
}

export function getGuestActivity(id) {
  if (id !== GUEST_ACTIVITY_ID) return null
  const base = buildGuestActivitySummary()
  return {
    ...base,
    registrations: [
      {
        _id: 'guest_reg_1',
        activityId: GUEST_ACTIVITY_ID,
        name: '陈一',
        phone: '138****1001',
        department: '市场部',
        status: 'confirmed',
        isProxy: false,
        queueNo: 0
      },
      {
        _id: 'guest_reg_2',
        activityId: GUEST_ACTIVITY_ID,
        name: '李二',
        phone: '138****1002',
        department: '技术部',
        status: 'confirmed',
        isProxy: false,
        queueNo: 0
      },
      {
        _id: 'guest_reg_3',
        activityId: GUEST_ACTIVITY_ID,
        name: '王三',
        phone: '138****1003',
        department: '行政部',
        status: 'queued',
        isProxy: false,
        queueNo: 1
      }
    ],
    myRegistration: null,
    canRegister: false
  }
}

function buildGuestActivitySummary() {
  return {
    _id: GUEST_ACTIVITY_ID,
    name: '【体验】周三夜场开放活动',
    location: '追光羽毛球馆 3 号场',
    startTime: daysFromNow(3, 19),
    endTime: daysFromNow(3, 21),
    registerStart: daysFromNow(-2, 9),
    registerEnd: daysFromNow(2, 18),
    maxCount: 16,
    confirmedCount: 2,
    queuedCount: 1,
    remain: 14,
    allowGroupIds: [],
    notice: '游客可浏览活动详情与名单。报名、发布等功能需微信登录后使用。',
    status: 'open',
    guestOnly: true,
    creatorId: 'system'
  }
}

export function getGuestMatchList() {
  return [buildGuestMatchSummary()]
}

export function getGuestMatch(id) {
  if (id !== GUEST_MATCH_ID) return null
  const base = buildGuestMatchSummary()
  const teams = [
    {
      _id: 'guest_t_a',
      matchId: GUEST_MATCH_ID,
      name: '追光一队',
      department: '市场部',
      captainId: 'guest_u_1',
      captainName: '赵队长',
      activeCount: 6,
      maleCount: 4,
      femaleCount: 2,
      members: []
    },
    {
      _id: 'guest_t_b',
      matchId: GUEST_MATCH_ID,
      name: '追光二队',
      department: '技术部',
      captainId: 'guest_u_2',
      captainName: '钱队长',
      activeCount: 5,
      maleCount: 3,
      femaleCount: 2,
      members: []
    },
    {
      _id: 'guest_t_c',
      matchId: GUEST_MATCH_ID,
      name: '追光三队',
      department: '产品部',
      captainId: 'guest_u_3',
      captainName: '孙队长',
      activeCount: 6,
      maleCount: 3,
      femaleCount: 3,
      members: []
    }
  ]
  return {
    ...base,
    teams,
    items: [
      { _id: 'guest_mi_1', matchId: GUEST_MATCH_ID, name: '男单', memberCount: 1, sort: 1 },
      { _id: 'guest_mi_2', matchId: GUEST_MATCH_ID, name: '女单', memberCount: 1, sort: 2 },
      { _id: 'guest_mi_3', matchId: GUEST_MATCH_ID, name: '男双', memberCount: 2, sort: 3 },
      { _id: 'guest_mi_4', matchId: GUEST_MATCH_ID, name: '女双', memberCount: 2, sort: 4 },
      { _id: 'guest_mi_5', matchId: GUEST_MATCH_ID, name: '混双', memberCount: 2, sort: 5 }
    ],
    myTeam: null,
    canViewDetail: true,
    guestOnly: true
  }
}

function buildGuestMatchSummary() {
  return {
    _id: GUEST_MATCH_ID,
    name: '【体验】追光杯单循环友谊赛',
    location: '追光羽毛球馆',
    startDate: daysFromNow(7, 9),
    endDate: daysFromNow(8, 18),
    registerEnd: daysFromNow(5, 18),
    registerDeadline: daysFromNow(5, 18),
    status: 'in_progress',
    progression: 'round_robin',
    scoring: { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
    maxTeams: 8,
    maxMalePerTeam: 6,
    maxFemalePerTeam: 6,
    teamCount: 3,
    fixtureCount: 3,
    memberCount: 17,
    notice: '游客可浏览介绍、报名队伍、对阵与赛果。报名与记分需登录后使用。',
    guestOnly: true
  }
}

export function getGuestFixtures(matchId) {
  if (matchId !== GUEST_MATCH_ID) return null
  const match = buildGuestMatchSummary()
  const fixtures = [
    {
      _id: 'guest_f_1',
      matchId: GUEST_MATCH_ID,
      round: '第1轮',
      teamAId: 'guest_t_a',
      teamBId: 'guest_t_b',
      teamAName: '追光一队',
      teamBName: '追光二队',
      status: 'finished',
      refereeIds: [],
      refereeNames: '',
      result: { teamAScore: 3, teamBScore: 1, winnerTeamId: 'guest_t_a' },
      subFixtures: []
    },
    {
      _id: 'guest_f_2',
      matchId: GUEST_MATCH_ID,
      round: '第1轮',
      teamAId: 'guest_t_c',
      teamBId: 'guest_t_a',
      teamAName: '追光三队',
      teamBName: '追光一队',
      status: 'live',
      refereeIds: [],
      refereeNames: '体验裁判',
      result: null,
      subFixtures: []
    },
    {
      _id: 'guest_f_3',
      matchId: GUEST_MATCH_ID,
      round: '第2轮',
      teamAId: 'guest_t_b',
      teamBId: 'guest_t_c',
      teamAName: '追光二队',
      teamBName: '追光三队',
      status: 'pending',
      refereeIds: [],
      refereeNames: '',
      result: null,
      subFixtures: []
    }
  ]
  return { match, fixtures }
}

export function getGuestResults(matchId) {
  if (matchId !== GUEST_MATCH_ID) return null
  return {
    match: buildGuestMatchSummary(),
    rank: [
      { teamId: 'guest_t_a', name: '追光一队', win: 1, lose: 0, points: 2, setDiff: 2 },
      { teamId: 'guest_t_b', name: '追光二队', win: 0, lose: 1, points: 1, setDiff: -2 },
      { teamId: 'guest_t_c', name: '追光三队', win: 0, lose: 0, points: 0, setDiff: 0 }
    ],
    latest: [
      {
        _id: 'guest_f_1',
        matchId: GUEST_MATCH_ID,
        round: '第1轮',
        teamAId: 'guest_t_a',
        teamBId: 'guest_t_b',
        teamAName: '追光一队',
        teamBName: '追光二队',
        status: 'finished',
        result: { teamAScore: 3, teamBScore: 1, winnerTeamId: 'guest_t_a' }
      }
    ]
  }
}

export function getGuestFixture(id) {
  const pack = getGuestFixtures(GUEST_MATCH_ID)
  return pack?.fixtures?.find((f) => f._id === id) || null
}
