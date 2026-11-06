<template>
  <view class="page">
    <hg-nav title="录入队伍" />
    <view class="pad">
      <view class="rule-box">
        超级管理员 / 管理员可为本场比赛录入全部队伍。可手动新增，或下载 Excel（CSV）模板批量导入。
      </view>

      <view class="row actions">
        <button class="btn-ghost" @click="downloadTpl">下载模板</button>
        <button class="btn-ghost" @click="importTeams">批量导入</button>
        <button class="btn-primary" @click="openCreate">＋ 新增</button>
      </view>

      <view class="section-title">
        <text>已录入 {{ teams.length }} 支队伍</text>
      </view>
      <view class="card" style="padding: 8rpx 28rpx 20rpx;">
        <view v-for="t in teams" :key="t._id" class="team-row">
          <view class="tm" @click="editTeam(t)">
            <view class="tn">{{ t.name }}</view>
            <view class="ts">{{ t.department }} · 队长 {{ t.captainName || '—' }} · {{ t.activeCount }} 人</view>
          </view>
          <text class="link" @click="editTeam(t)">编辑</text>
          <text class="del" @click="remove(t)">删除</text>
        </view>
        <hg-empty v-if="!teams.length" text="暂无队伍，请新增或导入" />
      </view>
    </view>

    <view v-if="showForm" class="mask" @click="showForm=false">
      <view class="sheet" @click.stop>
        <view class="h3">{{ form._id ? '编辑队伍' : '新增队伍' }}</view>
        <view class="field"><text class="field-label">队名*</text><input class="input" v-model="form.name" /></view>
        <view class="field"><text class="field-label">部门*</text><input class="input" v-model="form.department" /></view>
        <view class="field"><text class="field-label">宣言</text><input class="input" v-model="form.slogan" /></view>
        <view class="field"><text class="field-label">队长姓名</text><input class="input" v-model="form.captainName" /></view>
        <view class="field"><text class="field-label">队长手机</text><input class="input" v-model="form.captainPhone" placeholder="有账号则关联权限，不会自动入队" /></view>
        <button class="btn-primary" @click.stop="saveBasic">保存并编辑队员</button>
      </view>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast, confirm } from '@/utils/format'
import {
  teamTemplateCsv,
  downloadCsvTemplate,
  pickAndParseCsv,
  parseTeamRows
} from '@/utils/team-import'

const user = useUserStore()
const matchId = ref('')
const teams = ref([])
const showForm = ref(false)
const form = reactive({
  _id: '',
  name: '',
  department: '',
  slogan: '',
  captainName: '',
  captainPhone: ''
})

async function load() {
  if (!matchId.value) return
  teams.value = await api.listTeams(matchId.value)
}

onLoad((q) => {
  matchId.value = q.id || ''
  if (!user.isAdmin) {
    toast('需要管理员权限')
    setTimeout(() => uni.navigateBack(), 500)
  }
})
onShow(load)

function openCreate() {
  Object.assign(form, {
    _id: '',
    name: '',
    department: '',
    slogan: '',
    captainName: '',
    captainPhone: ''
  })
  showForm.value = true
}

function editTeam(t) {
  uni.navigateTo({ url: `/pages/match/team?id=${matchId.value}&teamId=${t._id}` })
}

async function saveBasic() {
  if (!form.name || !form.department) {
    toast('请填写队名和部门')
    return
  }
  const t = await api.saveTeam({
    _id: form._id || undefined,
    matchId: matchId.value,
    name: form.name,
    department: form.department,
    slogan: form.slogan,
    captainName: form.captainName,
    captainPhone: form.captainPhone,
    members: []
  })
  showForm.value = false
  toast('已保存', 'success')
  await load()
  if (t?._id) {
    uni.navigateTo({ url: `/pages/match/team?id=${matchId.value}&teamId=${t._id}` })
  }
}

async function downloadTpl() {
  try {
    await downloadCsvTemplate('比赛队伍导入模板.csv', teamTemplateCsv())
  } catch (e) {
    toast(e?.message || '下载失败')
  }
}

async function importTeams() {
  try {
    const { rows } = await pickAndParseCsv()
    const list = parseTeamRows(rows)
    if (!list.length) {
      toast('文件中没有有效队伍')
      return
    }
    const r = await api.importMatchTeams({ matchId: matchId.value, teams: list })
    toast(`导入完成：新建 ${r.created}，更新 ${r.updated}`, 'success')
    load()
  } catch (e) {
    if (e?.message !== '已取消') toast(e?.message || '导入失败')
  }
}

async function remove(t) {
  if (!(await confirm(`确定删除队伍「${t.name}」？`))) return
  await api.deleteTeam({ id: t._id })
  toast('已删除', 'success')
  load()
}
</script>

<style lang="scss" scoped>
.actions {
  gap: 12rpx;
  margin: 20rpx 0;
  flex-wrap: wrap;
}
.actions button {
  flex: 1;
  min-width: 28%;
  font-size: 24rpx;
  padding: 0 8rpx;
}
.team-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 22rpx 0;
  border-bottom: 1rpx solid #F7F8FA;
}
.tm { flex: 1; }
.tn { font-weight: 600; }
.ts { font-size: 22rpx; color: $hg-text3; margin-top: 4rpx; }
.link { font-size: 24rpx; color: $hg-primary; padding: 8rpx; }
.del { font-size: 24rpx; color: #E54D42; padding: 8rpx; }
.mask {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  z-index: 50; display: flex; align-items: flex-end;
}
.sheet {
  background: #fff; width: 100%; border-radius: 32rpx 32rpx 0 0;
  padding: 32rpx 32rpx 52rpx;
  max-height: 80vh;
  overflow: auto;
}
.h3 { font-size: 32rpx; font-weight: 600; margin-bottom: 20rpx; }
</style>
