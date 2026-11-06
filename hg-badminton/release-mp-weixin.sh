#!/bin/bash
# 一键编译并上传体验版到微信公众平台。
#
# 用法（在项目根目录）：
#   ./release-mp-weixin.sh
#   ./release-mp-weixin.sh --version 1.0.1 --desc "体验版"
#
# 已编译过、只上传：
#   ./release-mp-weixin.sh --upload-only
#
# 密钥：项目根目录 private.<AppID>.key
# 未写 --version 时，版本号在 package.json 的补丁号上自动 +1。
# 上传成功后写入 docs/体验版上传记录.md，并提交当前改动推送到 origin。
# 上传后，CI 机器人 1 的开发版若已设为体验版，会直接更新体验版。
# 若还没有体验版：mp.weixin.qq.com → 管理 → 版本管理 → 开发版本，选为体验版（只需一次）。

set -euo pipefail
cd "$(dirname "$0")"

if [[ "${1:-}" == "--upload-only" ]]; then
  shift
  npm run upload:mp-weixin -- "$@"
else
  npm run release:mp-weixin -- "$@"
fi
