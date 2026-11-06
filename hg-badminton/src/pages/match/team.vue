<template>
  <view class="page">
    <hg-nav :title="pageTitle" />
    <view class="pad">
      <view class="field"><text class="field-label">队名<text class="req">*</text></text>
        <input class="input" v-model="form.name" />
      </view>
      <view class="field"><text class="field-label">部门<text class="req">*</text></text>
        <input class="input" v-model="form.department" />
      </view>
      <view class="field"><text class="field-label">队伍宣言</text>
        <input class="input" v-model="form.slogan" placeholder="选填" />
      </view>

      <view v-if="adminEdit" class="field">
        <text class="field-label">队长姓名</text>
        <input class="input" v-model="form.captainName" placeholder="管理员代录时填写" />
      </view>
      <view v-if="adminEdit" class="field">
        <text class="field-label">队长手机</text>
        <input class="input" v-model="form.captainPhone" placeholder="有账号则关联权限，不会自动入队" />
      </view>

      <view class="section-title">
        <text>队员（{{ form.members.length }}）</text>
        <view class="ops">
          <text class="section-more" @click="downloadTpl">下载模板</text>
          <text class="section-more" @click="importMembers">批量导入</text>
          <text class="section-more" @click="showAdd=true">＋ 添加</text>
        </view>
      </view>
      <view class="rule-box" style="margin-bottom: 16rpx;">
        Excel 模板为 CSV 格式，可用 Excel / WPS 打开编辑后导入。同手机号会更新已有队员。
      </view>
      <view class="card" style="padding: 8rpx 28rpx;">
        <view v-for="(mb,i) in form.members" :key="mb.id || i" class="row line">
          <view class="meta">
            <view class="n">{{ mb.name }} · {{ mb.gender==='female'?'女':'男' }}{{ mb.isCaptain ? ' · 队长' : '' }}</view>
            <view class="s">{{ mb.phone }} · {{ mb.job || '未填岗位' }} · {{ mb.status }}</view>
          </view>
          <text class="del" @click="removeMember(i)">删除</text>
        </view>
        <hg-empty v-if="!form.members.length" text="暂无队员，可手动添加或批量导入" />
      </view>
      <button class="btn-primary" style="margin-top: 28rpx;" @click="save">保存队伍</button>
    </view>

    <view v-if="showAdd" class="mask" @click="showAdd=false">
      <view class="sheet" @click.stop>
        <view class="h3">录入队员</view>
        <view class="field"><text class="field-label">姓名*</text><input class="input" v-model="nm.name" /></view>
        <view class="field"><text class="field-label">手机号*</text><input class="input" v-model="nm.phone" /></view>
        <view class="field"><text class="field-label">性别</text>
          <view class="row" style="gap:16rpx;">
            <view class="opt" :class="{on: nm.gender==='male'}" @click="nm.gender='male'">男</view>
            <view class="opt" :class="{on: nm.gender==='female'}" @click="nm.gender='female'">女</view>
          </view>
        </view>
        <view class="field"><text class="field-label">身份证号</text><input class="input" v-model="nm.idCard" /></view>
        <view class="field"><text class="field-label">岗位</text><input class="input" v-model="nm.job" /></view>
        <button class="btn-primary" @click.stop="add">确认</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'
import {
  memberTemplateCsv,
  downloadCsvTemplate,
  pickAndParseCsv,
  parseMemberRows
} from '@/utils/team-import'

const user = useUserStore()
const matchId = ref('')
const teamId = ref('')
const showAdd = ref(false)
const form = reactive({
  _id: '',
  name: '',
  department: '',
  slogan: '',
  captainName: '',
  captainPhone: '',
  members: []
})
const nm = reactive({ name: '', phone: '', gender: 'male', idCard: '', job: '' })

const adminEdit = computed(() => !!user.isAdmin && !!teamId.value)
const pageTitle = computed(() => (adminEdit.value ? '编辑队伍' : '队伍报名'))

onLoad(async (q) => {
  matchId.value = q.id || ''
  teamId.value = q.teamId || ''
  form.department = user.profile?.department || ''
  form.captainName = user.profile?.realName || user.profile?.nickname || ''
  form.captainPhone = user.profile?.phone || ''

  if (teamId.value && user.isAdmin) {
    const teams = await api.listTeams(matchId.value)
    const t = (teams || []).find((x) => x._id === teamId.value)
    if (t) {
      Object.assign(form, {
        _id: t._id,
        name: t.name,
        department: t.department,
        slogan: t.slogan || '',
        captainName: t.captainName || '',
        captainPhone: t.captainPhone || (t.members || []).find((m) => m.isCaptain)?.phone || '',
        members: t.members || []
      })
    }
  } else {
    const t = await api.getMyTeam(matchId.value)
    if (t) {
      Object.assign(form, {
        _id: t._id,
        name: t.name,
        department: t.department,
        slogan: t.slogan || '',
        captainName: t.captainName || '',
        captainPhone: t.captainPhone || '',
        members: t.members || []
      })
    }
  }
})

function add() {
  if (!nm.name || !nm.phone) {
    toast('请填写姓名手机号')
    return
  }
  form.members.push({
    id: 'mb_' + Date.now(),
    userId: '',
    name: nm.name,
    phone: nm.phone,
    gender: nm.gender,
    idCard: nm.idCard,
    job: nm.job,
    status: 'active'
  })
  showAdd.value = false
  Object.assign(nm, { name: '', phone: '', gender: 'male', idCard: '', job: '' })
}

function removeMember(i) {
  form.members.splice(i, 1)
}

async function downloadTpl() {
  try {
    await downloadCsvTemplate('队员导入模板.csv', memberTemplateCsv())
  } catch (e) {
    toast(e?.message || '下载失败')
  }
}

async function importMembers() {
  try {
    const { rows } = await pickAndParseCsv()
    const list = parseMemberRows(rows)
    if (!list.length) {
      toast('文件中没有有效队员')
      return
    }
    let added = 0
    let updated = 0
    for (const raw of list) {
      const idx = form.members.findIndex((m) => m.phone === raw.phone)
      if (idx >= 0) {
        form.members[idx] = {
          ...form.members[idx],
          name: raw.name,
          gender: raw.gender,
          idCard: raw.idCard || form.members[idx].idCard,
          job: raw.job || form.members[idx].job
        }
        updated++
      } else {
        form.members.push({
          id: 'mb_' + Date.now() + '_' + added,
          userId: '',
          name: raw.name,
          phone: raw.phone,
          gender: raw.gender,
          idCard: raw.idCard,
          job: raw.job,
          status: 'active'
        })
        added++
      }
    }
    toast(`已导入：新增 ${added}，更新 ${updated}`)
  } catch (e) {
    if (e?.message !== '已取消') toast(e?.message || '导入失败')
  }
}

async function save() {
  if (!form.name || !form.department) {
    toast('请填写队名和部门')
    return
  }
  const payload = {
    _id: form._id || undefined,
    matchId: matchId.value,
    name: form.name,
    department: form.department,
    slogan: form.slogan,
    members: form.members
  }
  if (user.isAdmin && (teamId.value || form.captainPhone || form.captainName)) {
    payload.captainName = form.captainName
    payload.captainPhone = form.captainPhone
  }
  const t = await api.saveTeam(payload)
  if (t?._id) form._id = t._id
  toast('已保存', 'success')
  uni.navigateBack()
}
</script>

<style lang="scss" scoped>
.ops { display: flex; gap: 20rpx; flex-wrap: wrap; }
.line { padding: 20rpx 0; border-bottom: 1rpx solid #F7F8FA; }
.meta { flex: 1; }
.n { font-weight: 600; }
.s { font-size: 22rpx; color: $hg-text3; }
.del { font-size: 24rpx; color: #E54D42; padding: 8rpx; }
.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  z-index: 50; display: flex; align-items: flex-end;
}
.sheet {
  background: #fff; width: 100%; border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx 32rpx 52rpx;
}
.h3 { font-size: 32rpx; font-weight: 600; margin-bottom: 20rpx; }
.opt {
  flex: 1; text-align: center; padding: 20rpx;
  border: 3rpx solid $hg-line; border-radius: 20rpx;
}
.opt.on { border-color: $hg-primary; background: $hg-primary-light; }
</style>
