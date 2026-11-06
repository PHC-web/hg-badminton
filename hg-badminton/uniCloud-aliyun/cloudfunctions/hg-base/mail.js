'use strict'

const tls = require('tls')

function encodeSubject(subject) {
  return `=?UTF-8?B?${Buffer.from(String(subject || ''), 'utf8').toString('base64')}?=`
}

function dotStuff(text) {
  return String(text || '')
    .replace(/\r?\n/g, '\r\n')
    .split('\r\n')
    .map((line) => (line.startsWith('.') ? `.${line}` : line))
    .join('\r\n')
}

/**
 * 通过 SMTPS（465）发一封纯文本邮件。163 要求发件人与登录账号一致。
 */
function sendMail({ host, port, user, pass, to, subject, text }) {
  const recipients = [
    ...new Set(
      (Array.isArray(to) ? to : [to]).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    )
  ]
  if (!host || !user || !pass || !recipients.length) {
    return Promise.reject(new Error('SMTP 配置不完整'))
  }

  return new Promise((resolve, reject) => {
    let buf = ''
    let stage = 'greeting'
    let rcptIndex = 0
    let settled = false
    const socket = tls.connect({
      host,
      port: Number(port) || 465,
      servername: host,
      timeout: 12000
    })
    const finish = (err) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      socket.destroy()
      if (err) reject(err)
      else resolve()
    }
    const timer = setTimeout(() => finish(new Error('SMTP 超时')), 12000)
    const send = (line) => socket.write(`${line}\r\n`)
    const failLine = (line, fallback) => finish(new Error(line || fallback))

    const onCode = (code, line) => {
      if (stage === 'greeting') {
        if (code !== 220) return failLine(line, 'SMTP 问候失败')
        stage = 'ehlo'
        send('EHLO hg-badminton')
        return
      }
      if (stage === 'ehlo') {
        if (code !== 250) return failLine(line, 'EHLO 失败')
        stage = 'auth'
        send('AUTH LOGIN')
        return
      }
      if (stage === 'auth') {
        if (code !== 334) return failLine(line, 'AUTH 失败')
        stage = 'user'
        send(Buffer.from(user).toString('base64'))
        return
      }
      if (stage === 'user') {
        if (code !== 334) return failLine(line, '发件账号被拒绝')
        stage = 'pass'
        send(Buffer.from(pass).toString('base64'))
        return
      }
      if (stage === 'pass') {
        if (code !== 235) return failLine(line, 'SMTP 授权失败')
        stage = 'from'
        send(`MAIL FROM:<${user}>`)
        return
      }
      if (stage === 'from') {
        if (code !== 250) return failLine(line, '发件人被拒绝')
        stage = 'rcpt'
        send(`RCPT TO:<${recipients[rcptIndex]}>`)
        return
      }
      if (stage === 'rcpt') {
        if (code !== 250 && code !== 251) return failLine(line, '收件人被拒绝')
        rcptIndex += 1
        if (rcptIndex < recipients.length) {
          send(`RCPT TO:<${recipients[rcptIndex]}>`)
          return
        }
        stage = 'data'
        send('DATA')
        return
      }
      if (stage === 'data') {
        if (code !== 354) return failLine(line, 'DATA 被拒绝')
        stage = 'body'
        const message = [
          `From: ${user}`,
          `To: ${recipients.join(', ')}`,
          `Subject: ${encodeSubject(subject)}`,
          'MIME-Version: 1.0',
          'Content-Type: text/plain; charset=UTF-8',
          'Content-Transfer-Encoding: 8bit',
          '',
          dotStuff(text),
          '.'
        ].join('\r\n')
        socket.write(`${message}\r\n`)
        return
      }
      if (stage === 'body') {
        if (code !== 250) return failLine(line, '邮件发送失败')
        send('QUIT')
        finish()
      }
    }

    socket.on('data', (chunk) => {
      buf += chunk.toString('utf8')
      let idx
      while ((idx = buf.indexOf('\n')) >= 0) {
        const raw = buf.slice(0, idx).replace(/\r$/, '')
        buf = buf.slice(idx + 1)
        if (/^\d{3}-/.test(raw)) continue
        const matched = /^(\d{3})(?:\s|$)/.exec(raw)
        if (!matched) continue
        onCode(Number(matched[1]), raw)
      }
    })
    socket.on('error', (err) => finish(err))
    socket.on('timeout', () => finish(new Error('SMTP 超时')))
  })
}

module.exports = { sendMail }
