# 追光羽毛球（hg-badminton）

羽毛球比赛管理小程序第一版。技术栈：uni-app Vue3 + Pinia + uniCloud。

小程序显示名：**追光羽毛球**。工程名：`hg-badminton`。

## 功能范围

- 账号与角色（超管 / 管理员 / 队长 / 裁判 / 队员），角色申请与审核
- 创建比赛（五步：基本信息 → 晋级方式 → 项目 → 记分规则 → 访问控制）
- 队长报名、管理员审核
- 三种晋级方式自动生成对阵（小组+淘汰 / 单淘汰 / 单循环）
- 裁判实时记分（21/15 分制、净胜 2、30 分封顶、局间休息 120 秒）
- 赛果与积分榜
- 照片墙
- 比赛密码门（白名单免密 + 本地缓存）

## 本地预览（H5）

```bash
cd hg-badminton
npm install
npm run dev:h5
```

打开控制台提示的本地地址。登录页可选择演示身份：

- 林教练：超级管理员
- 李飞：队长
- 王浩然：裁判
- 张思雨：队员

未关联云空间时，数据保存在本地 `storage`，可直接走通全流程。

## 微信小程序

1. `npm run dev:mp-weixin`
2. 用微信开发者工具打开 `dist/dev/mp-weixin`
3. 在 `src/manifest.json` 的 `mp-weixin.appid` 填入小程序 AppID

也可使用 HBuilderX 打开本目录，发行到微信小程序。

## 关联 uniCloud

1. 用 HBuilderX 打开本工程
2. 在 `uniCloud-aliyun` 上右键「关联云服务空间」
3. 上传公共模块 `hg-core`、云对象 `hg-api`，并在云数据库初始化 schema
4. 客户端设置里打开「使用云端数据」后，`src/api/index.js` 会走 `uniCloud.importObject('hg-api')`

云数据库集合：`users` `matches` `match_items` `teams` `groups` `fixtures` `sub_fixtures` `photos` `score_logs` `role_applications`。客户端无直连权限，业务一律走云对象。
