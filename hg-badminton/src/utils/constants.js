export const APP_NAME = '追光羽毛球'

export const ROLES = {
  super_admin: { key: 'super_admin', label: '超级管理员', icon: '🛡️' },
  admin: { key: 'admin', label: '管理员', icon: '📋' },
  referee: { key: 'referee', label: '裁判', icon: '⚡' },
  captain: { key: 'captain', label: '队长', icon: '🚩' },
  member: { key: 'member', label: '队员', icon: '🏸' }
}

export const ROLE_LIST = Object.values(ROLES)

/** 超管可指定的角色 */
export const SUPER_ASSIGNABLE = ['admin', 'referee', 'captain', 'member']
/** 管理员可指定的角色 */
export const ADMIN_ASSIGNABLE = ['referee', 'captain', 'member']

export const ACTIVITY_STATUS = {
  draft: { key: 'draft', label: '草稿', chip: 'gray' },
  open: { key: 'open', label: '报名中', chip: 'orange' },
  closed: { key: 'closed', label: '报名截止', chip: 'gray' },
  finished: { key: 'finished', label: '已结束', chip: 'gray' }
}

export const REG_STATUS = {
  confirmed: { key: 'confirmed', label: '已报名', chip: 'green' },
  queued: { key: 'queued', label: '排队中', chip: 'orange' },
  cancelled: { key: 'cancelled', label: '已取消', chip: 'gray' }
}

export const MATCH_STATUS = {
  draft: { key: 'draft', label: '草稿', chip: 'gray' },
  registering: { key: 'registering', label: '报名中', chip: 'orange' },
  locked: { key: 'locked', label: '报名截止', chip: 'gray' },
  in_progress: { key: 'in_progress', label: '进行中', chip: 'green' },
  finished: { key: 'finished', label: '已结束', chip: 'gray' },
  closed: { key: 'closed', label: '已归档', chip: 'gray' }
}

export const MEMBER_STATUS = {
  active: { key: 'active', label: '已入队', chip: 'green' },
  pending: { key: 'pending', label: '待审批', chip: 'orange' },
  cancel_pending: { key: 'cancel_pending', label: '取消待审', chip: 'orange' }
}

export const SPECTATOR_STATUS = {
  pending: { key: 'pending', label: '待审核', chip: 'orange' },
  approved: { key: 'approved', label: '已通过', chip: 'green' },
  rejected: { key: 'rejected', label: '已驳回', chip: 'red' }
}

export const FIXTURE_STATUS = {
  pending: { key: 'pending', label: '未开始', chip: 'gray' },
  live: { key: 'live', label: '进行中', chip: 'orange' },
  finished: { key: 'finished', label: '已完赛', chip: 'green' },
  confirmed: { key: 'confirmed', label: '已确认', chip: 'green' }
}

export const PROGRESSION = {
  round_robin: { key: 'round_robin', label: '单循环积分赛', desc: '全部队伍两两交手，按积分排名', enabled: true },
  group_knockout: { key: 'group_knockout', label: '循环赛 + 淘汰赛', desc: '先循环后淘汰（即将开放）', enabled: false },
  single_knockout: { key: 'single_knockout', label: '单淘汰赛', desc: '两两对阵直接晋级（即将开放）', enabled: false }
}

export const DEFAULT_ITEMS = [
  { name: '男单', memberCount: 1 },
  { name: '女单', memberCount: 1 },
  { name: '男双', memberCount: 2 },
  { name: '女双', memberCount: 2 },
  { name: '混双', memberCount: 2 }
]

export const DB_KEY = 'hg_badminton_db_v2'
export const USER_KEY = 'hg_badminton_user'
export const SELECTED_MATCH_KEY = 'hg_selected_match'
export const USE_CLOUD_KEY = 'hg_use_unicloud'
export const ACTIVITY_TEMPLATE_KEY = 'hg_activity_templates'
export const LOCAL_MIGRATED_KEY = 'hg_local_migrated_v1'

/** 日常活动发布默认预设 */
export const ACTIVITY_PRESET = {
  name: '羽毛球队日常活动',
  location: '羽胜羽毛球馆',
  startTime: '18:00',
  endTime: '20:00',
  maxCount: 14,
  registerEndTime: '18:00',
  notice: `周一下午16:00前不足6人则取消场地
【地点】羽胜羽毛球馆(金发科技产业园)
【停车】金发科技产业园停车2.5小时免费(前台扫码)
本周有 2片场地，前14名可参加活动， 15及15之后候补
❗不确定的先不报名，避免当天飞机太多
❗大家爱惜一下球，每个场地严格控制一桶球，打完了就自行想办法`
}

/** 游客会话占位 */
export const GUEST_USER_ID = 'guest_browser'
export const GUEST_PROFILE = {
  _id: GUEST_USER_ID,
  isGuest: true,
  openid: '',
  phone: '',
  realName: '游客',
  nickname: '游客',
  department: '',
  gender: 'male',
  roles: [],
  contacts: [],
  avatar: '',
  verified: false
}

export const ADMIN_ROLES = ['super_admin', 'admin']
export const SCORE_ROLES = ['super_admin', 'admin', 'referee']
export const CAPTAIN_ROLES = ['super_admin', 'admin', 'captain']
