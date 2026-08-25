<template>
  <view class="page">
    <hg-nav title="创建比赛">
      <template #right><text @click="saveDraft">存草稿</text></template>
    </hg-nav>
    <view class="steps">
      <view v-for="(s, i) in 5" :key="i" class="step" :class="{ active: step === i, done: step > i }">
        <view class="dot">{{ i + 1 }}</view>
        <view v-if="i < 4" class="line"></view>
      </view>
    </view>
    <view class="pad">
      <view v-show="step === 0">
        <view class="field"><text class="field-label">比赛名称<text class="req">*</text></text>
          <input class="input" v-model="form.name" placeholder="如：2026 羽协夏季团体赛" />
        </view>
        <view class="field"><text class="field-label">举办地点<text class="req">*</text></text>
          <input class="input" v-model="form.location" placeholder="如：市体育馆羽毛球馆" />
        </view>
        <view class="field"><text class="field-label">开赛日期<text class="req">*</text></text>
          <picker mode="date" :value="form.startDate" @change="(e) => form.startDate = e.detail.value">
            <view class="input picker">{{ form.startDate || '请选择日期' }}</view>
          </picker>
        </view>
        <view class="field"><text class="field-label">结束日期</text>
          <picker mode="date" :value="form.endDate" @change="(e) => form.endDate = e.detail.value">
            <view class="input picker">{{ form.endDate || '请选择日期' }}</view>
          </picker>
        </view>
        <view class="field"><text class="field-label">报名截止<text class="req">*</text></text>
          <picker mode="date" :value="form.registerDeadline" @change="(e) => form.registerDeadline = e.detail.value">
            <view class="input picker">{{ form.registerDeadline || '请选择日期' }}</view>
          </picker>
        </view>
        <view class="field"><text class="field-label">比赛公告</text>
          <textarea class="textarea" v-model="form.notice" placeholder="比赛注意事项、签到要求等…" />
        </view>
      </view>
      <view v-show="step === 1">
        <hg-option title="团体赛" desc="以队伍为单位参赛，一场团体赛含多个单项" selected />
        <view class="section-title">晋级方式</view>
        <hg-option
          v-for="p in progressions"
          :key="p.key"
          :title="p.label"
          :desc="p.desc"
          :selected="form.progression === p.key"
          @click="form.progression = p.key"
        />
      </view>
      <view v-show="step === 2">
        <view class="section-title">
          <text>比赛项目</text>
          <text class="section-more" @click="addItem">＋ 添加项目</text>
        </view>
        <view class="chips">
          <view v-for="(it, i) in form.items" :key="i" class="item-chip">
            {{ it.name }} · {{ it.memberCount }} 人
            <text class="del" @click="form.items.splice(i, 1)">✕</text>
          </view>
        </view>
        <view class="field" style="margin-top: 28rpx;">
          <text class="field-label">团体获胜条件</text>
          <hg-option title="① 先赢 N 个单项获胜" desc="一旦锁定即结束该团体赛（苏迪曼杯式）" :selected="form.teamRule.mode === 'firstToWin'" @click="form.teamRule.mode = 'firstToWin'" />
          <hg-option title="② 打满全部单项" desc="全部打完，按总胜场数判定，适合同等锻炼" :selected="form.teamRule.mode === 'playAll'" @click="form.teamRule.mode = 'playAll'" />
        </view>
        <view v-if="form.teamRule.mode === 'firstToWin'" class="field">
          <text class="field-label">先赢几项</text>
          <input class="input" type="number" v-model="form.teamRule.itemsWinToWin" />
        </view>
        <view class="switch-row">
          <view>
            <view class="st">不允许兼项</view>
            <view class="sd">同一队员只能报名一个单项</view>
          </view>
          <hg-switch :on="!form.allowDualItem" @toggle="form.allowDualItem = !form.allowDualItem" />
        </view>
      </view>
      <view v-show="step === 3">
        <view class="section-title">记分规则</view>
        <hg-option title="21 分制" desc="每球得分制 · 20 平后净胜 2 分获胜" :selected="form.scoring.points === 21" @click="form.scoring.points = 21" />
        <hg-option title="15 分制" desc="每球得分制 · 14 平后净胜 2 分获胜" :selected="form.scoring.points === 15" @click="form.scoring.points = 15" />
        <hg-option title="三局两胜" desc="先赢 2 局者赢得本场单项" selected />
        <view class="info-row card" style="border-radius: 20rpx; padding: 24rpx; margin-top: 12rpx;">
          <text class="info-k">封顶分数</text>
          <text class="info-v">30 分（先到者胜）</text>
        </view>
        <view class="rule-box">📌 规则预览：{{ form.scoring.points }} 分制 · 三局两胜 · 平分净胜 2 分 · 30 分封顶 · {{ form.teamRule.mode === 'playAll' ? '打满全部单项' : '先赢 ' + form.teamRule.itemsWinToWin + ' 项' }}</view>
      </view>
      <view v-show="step === 4">
        <view class="section-title">访问控制</view>
        <view class="switch-row">
          <view>
            <view class="st">启用密码保护</view>
            <view class="sd">未在白名单内的用户需输入密码查看比赛</view>
          </view>
          <hg-switch :on="form.passwordEnabled" @toggle="form.passwordEnabled = !form.passwordEnabled" />
        </view>
        <view v-if="form.passwordEnabled" class="field">
          <text class="field-label">比赛查看密码<text class="req">*</text></text>
          <input class="input" v-model="form.password" placeholder="4-8 位数字/字母" />
        </view>
        <view class="rule-box">🔒 白名单内人员可直接查看；其他用户首次访问需输入密码，输入一次后本地缓存。修改密码后缓存失效。</view>
      </view>
    </view>
    <view class="bottom-actions">
      <button v-if="step > 0" class="btn-ghost" style="width: 200rpx;" @click="step -= 1">上一步</button>
      <button class="btn-primary" @click="next">{{ step === 4 ? '发布比赛' : '下一步' }}</button>
    </view>
  </view>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { DEFAULT_ITEMS, PROGRESSION } from '@/utils/constants'
import { api } from '@/api'
import { toast } from '@/utils/format'

const step = ref(0)
const progressions = Object.values(PROGRESSION)
const form = reactive({
  name: '',
  location: '',
  startDate: '2026-08-22',
  endDate: '2026-08-23',
  registerDeadline: '2026-08-15',
  notice: '',
  progression: 'group_knockout',
  items: DEFAULT_ITEMS.map((x) => ({ ...x })),
  teamRule: { mode: 'firstToWin', itemsWinToWin: 3 },
  allowDualItem: false,
  scoring: { points: 21, deuceMargin: 2, capPoints: 30, setsPerMatch: 3 },
  passwordEnabled: true,
  password: '8888',
  whitelistUserIds: []
})

function addItem() {
  uni.showActionSheet({
    itemList: ['男单', '女单', '男双', '女双', '混双', '自定义'],
    success: (res) => {
      const names = ['男单', '女单', '男双', '女双', '混双']
      if (res.tapIndex < 5) {
        const name = names[res.tapIndex]
        form.items.push({ name, memberCount: name.includes('双') ? 2 : 1 })
      }
    }
  })
}

function saveDraft() {
  submit(false)
}

function next() {
  if (step.value === 0) {
    if (!form.name || !form.location) {
      toast('请填写名称和地点')
      return
    }
  }
  if (step.value < 4) {
    step.value += 1
    return
  }
  submit(true)
}

async function submit(publish) {
  const payload = {
    ...form,
    publish,
    startDate: form.startDate,
    endDate: form.endDate,
    registerDeadline: form.registerDeadline + 'T23:59:00',
    teamRule: {
      mode: form.teamRule.mode,
      itemsWinToWin: Number(form.teamRule.itemsWinToWin) || 3
    }
  }
  const m = await api.createMatch(payload)
  toast(publish ? '比赛已发布' : '已存草稿', 'success')
  setTimeout(() => {
    uni.redirectTo({ url: `/pages/match/detail?id=${m._id}` })
  }, 400)
}
</script>

<style lang="scss" scoped>
.steps {
  display: flex;
  padding: 24rpx 28rpx 0;
  align-items: center;
}
.step {
  display: flex;
  align-items: center;
  flex: 1;
}
.dot {
  width: 44rpx;
  height: 44rpx;
  border-radius: 50%;
  background: #E6E8EB;
  color: $hg-text3;
  font-size: 22rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}
.step.active .dot {
  background: $hg-primary;
  color: #fff;
}
.step.done .dot {
  background: $hg-primary-light;
  color: $hg-primary-deep;
}
.line {
  flex: 1;
  height: 4rpx;
  background: #E6E8EB;
  margin: 0 8rpx;
}
.step.done .line {
  background: $hg-primary-line;
}
.chips {
  display: flex;
  flex-wrap: wrap;
}
.item-chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  background: #F0F1F3;
  border-radius: 16rpx;
  padding: 12rpx 20rpx;
  margin: 0 16rpx 16rpx 0;
  font-size: 26rpx;
}
.del {
  color: $hg-text3;
}
.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20rpx 4rpx;
}
.st {
  font-size: 28rpx;
  font-weight: 600;
}
.sd {
  font-size: 24rpx;
  color: $hg-text2;
}
.picker {
  display: flex;
  align-items: center;
}
</style>
