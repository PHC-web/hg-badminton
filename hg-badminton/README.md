# 追光羽毛球（hg-badminton）v2

羽毛球小程序：日常活动报名 + 比赛（本期单循环赛）。账号使用**微信登录**。

## 角色

- 微信登录并完善手机号后，默认 **队员**
- **超级管理员**：登录后在 uniCloud 控制台 `users` 表，将该用户 `roles` 改为含 `super_admin`（如 `["super_admin","admin","member"]`）
- 超管可指定：管理员 / 裁判 / 队长 / 队员
- 管理员可指定：裁判 / 队长 / 队员

用多个微信号分别登录即可模拟不同角色协作。

## Tab

底部三个入口：**日常活动 / 比赛 / 我的**。  
点进某场比赛后，页内嵌套 Tab：介绍 · 报名 · 对阵 · 赛果。

## 微信登录接入（必做）

1. 确认 `src/manifest.json` → `mp-weixin.appid` 为你的小程序 AppID  
2. HBuilderX：关联 uniCloud 服务空间，按顺序上传：
   - 公共模块：`hg-shared`、`hg-core`、`hg-config`
   - 云函数：`hg-base`、`hg-activity`、`hg-match`
   - 云对象：`hg-gateway`（客户端唯一入口）
   - 数据库 schema（至少 `users`）
3. 在 uniCloud 控制台 → 云函数 **hg-base** → 环境变量 → 编辑，添加：

| Key | Value |
| --- | --- |
| `WX_APPID` | 小程序 AppID |
| `WX_APP_SECRET` | 微信公众平台 AppSecret |

（密钥配在 `hg-base` 上，不是 gateway。）

4. 微信开发者工具运行 → 微信一键登录 → 完善姓名手机号  
5. 云数据库将第一个账号 `roles` 设为含 `super_admin`，其它微信号由超管在「角色管理」指定

架构说明见 `docs/云函数架构.md`。

## 功能

### 日常活动
发布活动、组别限制、报名/代报名、满员排队、取消补位并消息提醒、名单查看。

### 比赛（单循环）
发布比赛、队长建队、队员申请入队（队长审批）、生成对阵、观众审批、指派裁判记分、实时赛果。

## 运行

```bash
npm install
npm run dev:mp-weixin
```

设计文档见 `docs/设计文档-v2.md`。

说明：账号、角色、组别、日常活动已存 uniCloud；比赛业务数据当前仍在本机本地库。首次登录后会自动尝试把本机旧活动导入云端一次。
