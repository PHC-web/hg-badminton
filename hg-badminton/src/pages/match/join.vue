<template>
  <view class="page">
    <hg-nav title="申请入队" />
    <view class="pad">
      <view class="field"><text class="field-label">选择队伍<text class="req">*</text></text>
        <picker :range="teamNames" @change="onPick">
          <view class="input picker">{{ selectedName || '请选择队伍' }}</view>
        </picker>
      </view>
      <view class="field"><text class="field-label">姓名<text class="req">*</text></text>
        <input class="input" v-model="form.name" />
      </view>
      <view class="field"><text class="field-label">手机号<text class="req">*</text></text>
        <input class="input" v-model="form.phone" />
      </view>
      <view class="field"><text class="field-label">性别</text>
        <view class="row" style="gap:16rpx;">
          <view class="opt" :class="{on: form.gender==='male'}" @click="form.gender='male'">男</view>
          <view class="opt" :class="{on: form.gender==='female'}" @click="form.gender='female'">女</view>
        </view>
      </view>
      <view class="field"><text class="field-label">身份证号<text class="req">*</text></text>
        <input class="input" v-model="form.idCard" />
      </view>
      <view class="field"><text class="field-label">岗位</text>
        <input class="input" v-model="form.job" />
      </view>
      <view class="rule-box">提交后需队长审批；队伍满员或对应性别已满将无法加入。</view>
      <button class="btn-primary" @click="submit">提交申请</button>
    </view>
  </view>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '@/api'
import { useUserStore } from '@/stores/user'
import { toast } from '@/utils/format'

const user = useUserStore()
const matchId = ref('')
const teams = ref([])
const teamId = ref('')
const form = reactive({
  name: user.profile?.realName || '',
  phone: user.profile?.phone || '',
  gender: user.profile?.gender || 'male',
  idCard: '',
  job: ''
})
const teamNames = computed(() => teams.value.map((t) => t.name))
const selectedName = computed(() => teams.value.find((t) => t._id === teamId.value)?.name)

onLoad(async (q) => {
  matchId.value = q.id
  teams.value = await api.listTeams(matchId.value)
})

function onPick(e) {
  teamId.value = teams.value[e.detail.value]?._id || ''
}

async function submit() {
  if (!teamId.value) {
    toast('请选择队伍')
    return
  }
  await api.applyJoinTeam({ teamId: teamId.value, ...form })
  toast('已提交，等待队长审批', 'success')
  setTimeout(() => uni.navigateBack(), 400)
}
</script>

<style lang="scss" scoped>
.picker { display: flex; align-items: center; }
.opt {
  flex: 1; text-align: center; padding: 20rpx;
  border: 3rpx solid $hg-line; border-radius: 20rpx;
}
.opt.on { border-color: $hg-primary; background: $hg-primary-light; }
</style>
