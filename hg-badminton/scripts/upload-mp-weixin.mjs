/**
 * 把 dist/build/mp-weixin 上传到微信公众平台（开发版）。
 * 该 CI 机器人的开发版若已选为体验版，再次上传会直接更新体验版。
 *
 * 用法：
 *   npm run release:mp-weixin
 *   npm run release:mp-weixin -- --version 1.0.1 --desc "体验版"
 *
 * 上传成功后：写入 docs/体验版上传记录.md 和 package.json 版本号，
 * 提交当前改动并推送到 origin 当前分支。未指定版本号时，补丁号自动 +1。
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const ci = require('miniprogram-ci')

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseDotEnv(text) {
  const out = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const i = line.indexOf('=')
    if (i <= 0) continue
    const key = line.slice(0, i).trim()
    let val = line.slice(i + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function loadWxEnv() {
  for (const name of ['.env', '.env.local']) {
    const file = resolve(root, name)
    if (!existsSync(file)) continue
    for (const [key, val] of Object.entries(parseDotEnv(readFileSync(file, 'utf8')))) {
      if (!key.startsWith('WX_')) continue
      if (process.env[key] === undefined) process.env[key] = val
    }
  }
}

function arg(flag) {
  const argv = process.argv.slice(2)
  const eq = argv.find((item) => item.startsWith(`${flag}=`))
  if (eq) return eq.slice(flag.length + 1)
  const index = argv.indexOf(flag)
  if (index >= 0 && argv[index + 1] && !argv[index + 1].startsWith('-')) {
    return argv[index + 1]
  }
  return ''
}

function readAppid() {
  const manifest = JSON.parse(readFileSync(resolve(root, 'src/manifest.json'), 'utf8'))
  const appid = manifest?.['mp-weixin']?.appid || ''
  if (!/^wx[0-9a-f]{16}$/i.test(appid)) {
    throw new Error('src/manifest.json 的 mp-weixin.appid 无效')
  }
  return appid
}

function localStamp() {
  const date = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
  return pkg.version || '1.0.0'
}

function bumpPatch(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) return ''
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

function writePackageVersion(version) {
  const file = resolve(root, 'package.json')
  const text = readFileSync(file, 'utf8')
  const next = text.replace(/"version":\s*"[^"]+"/, `"version": "${version}"`)
  if (next === text) fail(`package.json 里没有可更新的 version 字段`)
  writeFileSync(file, next)
}

function appendUploadLog({ version, desc, robot }) {
  const file = resolve(root, 'docs/体验版上传记录.md')
  const line = `- ${localStamp()} · ${version} · CI 机器人 ${robot} · ${desc}`
  if (!existsSync(file)) {
    writeFileSync(file, `# 体验版上传记录\n\n${line}\n`)
    return
  }
  const text = readFileSync(file, 'utf8').trimEnd()
  writeFileSync(file, `${text}\n${line}\n`)
}

function scrub(text) {
  return String(text || '')
    .replace(/ghp_[A-Za-z0-9]+/g, '***')
    .replace(/https:\/\/[^@\s]+@/g, 'https://')
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  const out = scrub(`${result.stdout || ''}\n${result.stderr || ''}`).trim()
  if (result.status !== 0) {
    throw new Error(out || `git ${args.join(' ')} 失败`)
  }
  if (out) console.log(out)
}

function publishGit(version, desc) {
  runGit(['add', '-A'])
  const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  if (!(status.stdout || '').trim()) {
    console.log('没有需要提交的改动。')
    return
  }
  runGit(['commit', '-m', `体验版 ${version}`, '-m', desc])
  runGit(['push', 'origin', 'HEAD'])
  console.log('已推送到 git。')
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

async function main() {
  loadWxEnv()
  const appid = readAppid()
  const projectPath = resolve(root, 'dist/build/mp-weixin')
  if (!existsSync(resolve(projectPath, 'app.json'))) {
    fail('找不到正式包 dist/build/mp-weixin。请执行 npm run release:mp-weixin，它会先编译再上传。')
  }

  const keyRel = arg('--key') || process.env.WX_PRIVATE_KEY_PATH || `private.${appid}.key`
  const privateKeyPath = resolve(root, keyRel)
  if (!existsSync(privateKeyPath)) {
    fail(
      [
        `找不到上传密钥：${privateKeyPath}`,
        '打开 https://mp.weixin.qq.com → 管理 → 开发管理 → 开发设置 → 小程序代码上传，生成并下载密钥。',
        '将 private.<AppID>.key 放在项目根目录，或在 .env.local 设置 WX_PRIVATE_KEY_PATH。',
        '若开启了 IP 白名单，把当前出口 IP 加入白名单，或关闭 IP 校验。'
      ].join('\n')
    )
  }

  const explicitVersion = arg('--version') || process.env.WX_UPLOAD_VERSION || ''
  const version = explicitVersion || bumpPatch(readPackageVersion())
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    fail(`版本号须为 x.y.z，当前是「${version}」。示例：npm run release:mp-weixin -- --version 1.0.1`)
  }

  const robot = Number(arg('--robot') || process.env.WX_CI_ROBOT || 1)
  if (!Number.isInteger(robot) || robot < 1 || robot > 30) {
    fail('CI 机器人编号须为 1 到 30')
  }

  const desc = (arg('--desc') || process.env.WX_UPLOAD_DESC || `体验版 ${localStamp()}`).slice(0, 120)
  const project = new ci.Project({
    appid,
    type: 'miniProgram',
    projectPath,
    privateKeyPath,
    ignores: ['node_modules/**/*']
  })

  console.log(`上传 ${appid} ${version}（CI 机器人 ${robot}）`)
  console.log(desc)
  const result = await ci.upload({
    project,
    version,
    desc,
    robot,
    setting: { useProjectConfig: true },
    onProgressUpdate(info) {
      const message = typeof info === 'string' ? info : info?.message
      if (message) console.log(message)
    }
  })
  console.log('上传完成。')
  if (result) console.log(result)
  writePackageVersion(version)
  appendUploadLog({ version, desc, robot })
  console.log(`已记录体验版 ${version}`)
  try {
    publishGit(version, desc)
  } catch (error) {
    console.error('上传已成功，记录也已写好，但提交或推送 git 失败：')
    console.error(scrub(error?.message || error))
    process.exit(1)
  }
  console.log('')
  console.log(`CI 机器人 ${robot} 的开发版已更新。`)
  console.log('这个机器人的版本若已经是体验版，本次代码会直接成为新的体验版。')
  console.log('若还没有体验版：打开 https://mp.weixin.qq.com → 管理 → 版本管理 → 开发版本，将该机器人上传的版本选为体验版。这一步只需做一次。')
}

main().catch((error) => {
  const message = error?.message || String(error)
  console.error(message)
  if (/ip/i.test(message) || message.includes('白名单')) {
    console.error('到 mp.weixin.qq.com → 开发管理 → 开发设置 → 小程序代码上传，把当前 IP 加入白名单，或关闭 IP 校验。')
  }
  process.exit(1)
})
