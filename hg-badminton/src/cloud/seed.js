import { col, resetDb } from './db'

function iso(y, m, d, h = 0, mi = 0) {
  return new Date(y, m - 1, d, h, mi).toISOString()
}

export function seedDemo(force = false) {
  const users = col('users').all()
  if (users.length && !force) return { seeded: false }

  resetDb()
  const now = new Date().toISOString()

  const userList = [
    { _id: 'u_lin', nickname: '林教练', phone: '13800002091', gender: 'male', roles: ['super_admin', 'admin', 'captain', 'referee', 'member'], verified: true },
    { _id: 'u_li', nickname: '李飞', phone: '13800012091', gender: 'male', roles: ['captain', 'member'], verified: true },
    { _id: 'u_wang', nickname: '王浩然', phone: '13900008842', gender: 'male', roles: ['referee', 'member'], verified: true },
    { _id: 'u_zhang', nickname: '张思雨', phone: '13700005510', gender: 'female', roles: ['member'], verified: false },
    { _id: 'u_liu', nickname: '刘洋', phone: '13600007731', gender: 'male', roles: ['member'], verified: false },
    { _id: 'u_zhao', nickname: '赵迅', phone: '13500001122', gender: 'male', roles: ['captain', 'member'], verified: true },
    { _id: 'u_chen', nickname: '陈明', phone: '13400003344', gender: 'male', roles: ['referee', 'member'], verified: true },
    { _id: 'u_zhou', nickname: '周芳', phone: '13300005566', gender: 'female', roles: ['referee', 'member'], verified: true },
    { _id: 'u_lei', nickname: '王磊', phone: '13200007788', gender: 'male', roles: ['captain', 'member'], verified: true },
    { _id: 'u_sun', nickname: '孙悦', phone: '13100009900', gender: 'female', roles: ['member'], verified: false },
    { _id: 'u_qian', nickname: '钱程', phone: '13000001234', gender: 'male', roles: ['member'], verified: false },
    { _id: 'u_wu', nickname: '吴迪', phone: '15900005678', gender: 'male', roles: ['member'], verified: false },
    { _id: 'u_chenchen', nickname: '陈晨', phone: '15800009012', gender: 'male', roles: ['captain', 'member'], verified: true }
  ].map((u) => ({
    ...u,
    avatar: '',
    createdAt: now,
    viewRole: u.roles[0]
  }))
  col('users').insertMany(userList)

  const summer = {
    _id: 'm_summer',
    name: '2026 羽协夏季团体赛',
    location: '市体育馆羽毛球馆',
    startDate: iso(2026, 8, 22, 9),
    endDate: iso(2026, 8, 23, 18),
    registerDeadline: iso(2026, 8, 15, 23, 59),
    status: 'in_progress',
    format: 'team',
    progression: 'group_knockout',
    scoring: { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
    teamRule: { mode: 'firstToWin', itemsWinToWin: 3 },
    allowDualItem: false,
    accessControl: {
      whitelistUserIds: ['u_li', 'u_wang', 'u_lin'],
      password: '8888',
      passwordEnabled: true,
      passwordVersion: 1
    },
    creatorId: 'u_lin',
    published: true,
    notice: '请各队 08.22 上午 8:30 前到场签到；运动员需着运动服入场。',
    scheduleNote: [
      { time: '08.22 上午', text: '小组赛 A/B 组' },
      { time: '08.22 下午', text: '小组赛 C/D 组' },
      { time: '08.23 上午', text: '八强淘汰赛' },
      { time: '08.23 下午', text: '半决赛 / 决赛' }
    ],
    createdAt: now
  }

  const corp = {
    _id: 'm_corp',
    name: '企业内部友谊联赛',
    location: '华润文体中心',
    startDate: iso(2026, 9, 5, 9),
    endDate: iso(2026, 9, 20, 18),
    registerDeadline: iso(2026, 9, 1, 23, 59),
    status: 'registering',
    format: 'team',
    progression: 'round_robin',
    scoring: { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
    teamRule: { mode: 'playAll', itemsWinToWin: 3 },
    allowDualItem: false,
    accessControl: { whitelistUserIds: [], password: '', passwordEnabled: false, passwordVersion: 1 },
    creatorId: 'u_lin',
    published: true,
    notice: '本场为内部友谊赛，打满全部单项，重在参与。',
    scheduleNote: [],
    createdAt: now
  }

  const spring = {
    _id: 'm_spring',
    name: '春季俱乐部排名赛',
    location: '羽你同行球馆',
    startDate: iso(2026, 6, 10, 9),
    endDate: iso(2026, 6, 11, 18),
    registerDeadline: iso(2026, 6, 1, 23, 59),
    status: 'finished',
    format: 'team',
    progression: 'single_knockout',
    scoring: { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
    teamRule: { mode: 'firstToWin', itemsWinToWin: 3 },
    allowDualItem: false,
    accessControl: { whitelistUserIds: [], password: '', passwordEnabled: false, passwordVersion: 1 },
    creatorId: 'u_lin',
    published: true,
    notice: '',
    championTeamId: 't_feiyu',
    scheduleNote: [],
    createdAt: now
  }
  col('matches').insertMany([summer, corp, spring])

  const items = [
    ['mi_ms', '男单', 1, 1],
    ['mi_ws', '女单', 1, 2],
    ['mi_md', '男双', 2, 3],
    ['mi_wd', '女双', 2, 4],
    ['mi_xd', '混双', 2, 5]
  ].map(([id, name, memberCount, sort]) => ({
    _id: id,
    matchId: 'm_summer',
    name,
    memberCount,
    sort
  }))
  col('match_items').insertMany(items)
  col('match_items').insertMany(
    items.map((it, i) => ({ ...it, _id: `ci_${i}`, matchId: 'm_corp' }))
  )
  col('match_items').insertMany(
    items.map((it, i) => ({ ...it, _id: `si_${i}`, matchId: 'm_spring' }))
  )

  function member(userId, extra = {}) {
    const u = userList.find((x) => x._id === userId)
    return {
      userId,
      name: u.nickname,
      gender: u.gender,
      phone: u.phone,
      claimed: !!u.verified,
      ...extra
    }
  }

  const teams = [
    {
      _id: 't_feiyu',
      matchId: 'm_summer',
      name: '飞羽俱乐部',
      captainId: 'u_li',
      members: [member('u_li', { isCaptain: true }), member('u_wang'), member('u_zhang'), member('u_liu')],
      lineup: {
        mi_ms: ['u_li'],
        mi_ws: ['u_zhang'],
        mi_md: ['u_wang', 'u_liu'],
        mi_wd: [],
        mi_xd: []
      },
      registerStatus: 'approved',
      rejectReason: '',
      groupId: 'g_a'
    },
    {
      _id: 't_xunjie',
      matchId: 'm_summer',
      name: '迅捷羽球队',
      captainId: 'u_zhao',
      members: [member('u_zhao', { isCaptain: true }), member('u_sun'), member('u_qian'), member('u_wu')],
      lineup: {
        mi_ms: ['u_zhao'],
        mi_ws: ['u_sun'],
        mi_md: ['u_qian', 'u_wu'],
        mi_wd: [],
        mi_xd: []
      },
      registerStatus: 'approved',
      rejectReason: '',
      groupId: 'g_a'
    },
    {
      _id: 't_chenguang',
      matchId: 'm_summer',
      name: '晨光俱乐部',
      captainId: 'u_chenchen',
      members: [member('u_chenchen', { isCaptain: true })],
      lineup: {},
      registerStatus: 'approved',
      rejectReason: '',
      groupId: 'g_a'
    },
    {
      _id: 't_yudong',
      matchId: 'm_summer',
      name: '羽动青春队',
      captainId: 'u_lei',
      members: [member('u_lei', { isCaptain: true })],
      lineup: {},
      registerStatus: 'approved',
      rejectReason: '',
      groupId: 'g_a'
    },
    {
      _id: 't_tiyu',
      matchId: 'm_summer',
      name: '体育中心队',
      captainId: 'u_lei',
      members: [member('u_lei', { isCaptain: true })],
      lineup: {},
      registerStatus: 'approved',
      rejectReason: '',
      groupId: 'g_b'
    },
    {
      _id: 't_yuni',
      matchId: 'm_summer',
      name: '羽你同行队',
      captainId: 'u_li',
      members: [member('u_li', { isCaptain: true })],
      lineup: {},
      registerStatus: 'approved',
      rejectReason: '',
      groupId: 'g_b'
    },
    {
      _id: 't_newstar',
      matchId: 'm_summer',
      name: '新星羽球队',
      captainId: 'u_zhao',
      members: [member('u_zhao', { isCaptain: true })],
      lineup: {},
      registerStatus: 'submitted',
      rejectReason: '',
      groupId: ''
    },
    {
      _id: 't_weekend',
      matchId: 'm_summer',
      name: '周末休闲队',
      captainId: 'u_chenchen',
      members: [member('u_chenchen', { isCaptain: true })],
      lineup: {},
      registerStatus: 'rejected',
      rejectReason: '队员人数不足，请补齐后再提交',
      groupId: ''
    }
  ]
  col('teams').insertMany(teams.map((t) => ({ ...t, createdAt: now })))

  col('groups').insertMany([
    { _id: 'g_a', matchId: 'm_summer', groupName: 'A', teamIds: ['t_feiyu', 't_xunjie', 't_chenguang', 't_yudong'] },
    { _id: 'g_b', matchId: 'm_summer', groupName: 'B', teamIds: ['t_tiyu', 't_yuni'] }
  ])

  const fixtures = [
    {
      _id: 'f_a1',
      matchId: 'm_summer',
      round: '小组赛第 1 轮',
      stage: 'group',
      groupId: 'g_a',
      teamAId: 't_feiyu',
      teamBId: 't_xunjie',
      status: 'finished',
      venue: '场地 1',
      scheduleTime: iso(2026, 8, 22, 9, 30),
      refereeIds: ['u_chen', 'u_zhou'],
      result: { winnerTeamId: 't_feiyu', teamAScore: 3, teamBScore: 1 },
      code: 'A1'
    },
    {
      _id: 'f_a2',
      matchId: 'm_summer',
      round: '小组赛第 1 轮',
      stage: 'group',
      groupId: 'g_a',
      teamAId: 't_chenguang',
      teamBId: 't_yudong',
      status: 'live',
      venue: '场地 2',
      scheduleTime: iso(2026, 8, 22, 10, 30),
      refereeIds: ['u_wang'],
      result: { winnerTeamId: '', teamAScore: 0, teamBScore: 0 },
      code: 'A2'
    },
    {
      _id: 'f_a3',
      matchId: 'm_summer',
      round: '小组赛第 2 轮',
      stage: 'group',
      groupId: 'g_a',
      teamAId: 't_feiyu',
      teamBId: 't_chenguang',
      status: 'pending',
      venue: '场地 1',
      scheduleTime: iso(2026, 8, 22, 14, 0),
      refereeIds: ['u_chen'],
      result: { winnerTeamId: '', teamAScore: 0, teamBScore: 0 },
      code: 'A3'
    },
    {
      _id: 'f_sf1',
      matchId: 'm_summer',
      round: '半决赛',
      stage: 'knockout',
      groupId: '',
      teamAId: 't_feiyu',
      teamBId: '',
      status: 'pending',
      venue: '场地 1',
      scheduleTime: iso(2026, 8, 23, 14, 0),
      refereeIds: [],
      result: { winnerTeamId: '', teamAScore: 0, teamBScore: 0 },
      code: 'SF1'
    },
    {
      _id: 'f_sf2',
      matchId: 'm_summer',
      round: '半决赛',
      stage: 'knockout',
      groupId: '',
      teamAId: 't_tiyu',
      teamBId: '',
      status: 'pending',
      venue: '场地 2',
      scheduleTime: iso(2026, 8, 23, 14, 0),
      refereeIds: [],
      result: { winnerTeamId: '', teamAScore: 0, teamBScore: 0 },
      code: 'SF2'
    },
    {
      _id: 'f_final',
      matchId: 'm_summer',
      round: '决赛',
      stage: 'knockout',
      groupId: '',
      teamAId: '',
      teamBId: '',
      status: 'pending',
      venue: '场地 1',
      scheduleTime: iso(2026, 8, 23, 16, 0),
      refereeIds: [],
      result: { winnerTeamId: '', teamAScore: 0, teamBScore: 0 },
      code: 'F'
    },
    {
      _id: 'f_spring_final',
      matchId: 'm_spring',
      round: '决赛',
      stage: 'knockout',
      groupId: '',
      teamAId: 't_feiyu',
      teamBId: 't_tiyu',
      status: 'finished',
      venue: '场地 1',
      scheduleTime: iso(2026, 6, 11, 16, 0),
      refereeIds: ['u_chen'],
      result: { winnerTeamId: 't_feiyu', teamAScore: 3, teamBScore: 2 },
      code: 'F'
    }
  ]
  col('fixtures').insertMany(fixtures.map((f) => ({ ...f, createdAt: now })))

  const subs = [
    {
      _id: 'sf_ms',
      fixtureId: 'f_a1',
      itemId: 'mi_ms',
      playerAIds: ['u_li'],
      playerBIds: ['u_zhao'],
      status: 'confirmed',
      currentSet: 2,
      sets: [
        { aScore: 21, bScore: 15, winner: 'a' },
        { aScore: 21, bScore: 18, winner: 'a' }
      ],
      winner: 'a'
    },
    {
      _id: 'sf_ws',
      fixtureId: 'f_a1',
      itemId: 'mi_ws',
      playerAIds: ['u_zhang'],
      playerBIds: ['u_sun'],
      status: 'confirmed',
      currentSet: 2,
      sets: [
        { aScore: 18, bScore: 21, winner: 'b' },
        { aScore: 16, bScore: 21, winner: 'b' }
      ],
      winner: 'b'
    },
    {
      _id: 'sf_md',
      fixtureId: 'f_a1',
      itemId: 'mi_md',
      playerAIds: ['u_wang', 'u_liu'],
      playerBIds: ['u_qian', 'u_wu'],
      status: 'confirmed',
      currentSet: 3,
      sets: [
        { aScore: 21, bScore: 19, winner: 'a' },
        { aScore: 17, bScore: 21, winner: 'b' },
        { aScore: 21, bScore: 14, winner: 'a' }
      ],
      winner: 'a'
    },
    {
      _id: 'sf_wd',
      fixtureId: 'f_a1',
      itemId: 'mi_wd',
      playerAIds: [],
      playerBIds: [],
      status: 'live',
      currentSet: 2,
      sets: [{ aScore: 21, bScore: 15, winner: 'a' }, { aScore: 18, bScore: 15, winner: '' }],
      winner: ''
    },
    {
      _id: 'sf_xd',
      fixtureId: 'f_a1',
      itemId: 'mi_xd',
      playerAIds: [],
      playerBIds: [],
      status: 'pending',
      currentSet: 1,
      sets: [{ aScore: 0, bScore: 0, winner: '' }],
      winner: ''
    }
  ]
  col('sub_fixtures').insertMany(subs.map((s) => ({ ...s, createdAt: now })))

  col('photos').insertMany([
    { _id: 'p1', matchId: 'm_summer', uploaderId: 'u_lin', caption: '开球仪式', color: '#5BC8A0', isFeatured: true, createdAt: now },
    { _id: 'p2', matchId: 'm_summer', uploaderId: 'u_li', caption: '颁奖', color: '#FFB37E', isFeatured: true, createdAt: now },
    { _id: 'p3', matchId: 'm_summer', uploaderId: 'u_wang', caption: '男单决赛', color: '#7FB5FF', isFeatured: false, createdAt: now },
    { _id: 'p4', matchId: 'm_summer', uploaderId: 'u_zhang', caption: '混双', color: '#B79CFF', isFeatured: false, createdAt: now },
    { _id: 'p5', matchId: 'm_summer', uploaderId: 'u_liu', caption: '合影', color: '#FFB38F', isFeatured: false, createdAt: now },
    { _id: 'p6', matchId: 'm_summer', uploaderId: 'u_lin', caption: '冠军', color: '#7FDCAF', isFeatured: true, createdAt: now },
    { _id: 'p7', matchId: 'm_summer', uploaderId: 'u_zhao', caption: '庆祝', color: '#FFD666', isFeatured: false, createdAt: now },
    { _id: 'p8', matchId: 'm_summer', uploaderId: 'u_chen', caption: '观众', color: '#9CC7FF', isFeatured: false, createdAt: now },
    { _id: 'p9', matchId: 'm_summer', uploaderId: 'u_zhou', caption: '握手', color: '#FF9EBF', isFeatured: false, createdAt: now },
    { _id: 'p10', matchId: 'm_summer', uploaderId: 'u_lei', caption: '比赛瞬间', color: '#8FDCA6', isFeatured: false, createdAt: now },
    { _id: 'p11', matchId: 'm_summer', uploaderId: 'u_lin', caption: '场馆', color: '#C9CDD3', isFeatured: false, createdAt: now }
  ])

  col('role_applications').insertMany([
    {
      _id: 'ra1',
      userId: 'u_zhang',
      applyRole: 'referee',
      name: '张思雨',
      phone: '13700005510',
      extra: '曾担任校内联赛司线',
      status: 'pending',
      reviewerId: '',
      rejectReason: '',
      createdAt: iso(2026, 8, 16, 10),
      reviewedAt: ''
    },
    {
      _id: 'ra2',
      userId: 'u_li',
      applyRole: 'captain',
      name: '李飞',
      phone: '13800012091',
      extra: '飞羽俱乐部队长',
      status: 'approved',
      reviewerId: 'u_lin',
      rejectReason: '',
      createdAt: iso(2026, 8, 10, 9),
      reviewedAt: iso(2026, 8, 10, 12)
    }
  ])

  return { seeded: true }
}
