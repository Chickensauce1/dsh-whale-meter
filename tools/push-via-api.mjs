/**
 * 通过 GitHub API 推送仓库（绕过 github.com:443 被墙/不通的情况）。
 *
 * 背景：本机 git push 连不上 github.com，但 api.github.com 直连可用。
 * Git Data API 能完成同样的事：blob → tree → commit → 更新 ref，
 * 全部走 HTTPS API，不需要 git 协议也不需要 smart HTTP。
 *
 * 用法：node tools/push-via-api.mjs OWNER/REPO [--branch main] [--message "..."]
 * 凭据：从 git credential helper 取（不读环境变量、不落盘）。
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')

const repoArg = process.argv[2]
if (!repoArg || !repoArg.includes('/')) {
  console.error('用法: node tools/push-via-api.mjs OWNER/REPO [--branch main] [--message "..."]')
  process.exit(2)
}

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag)
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}
const branch = argOf('--branch', 'main')
const message = argOf('--message', `chore: sync ${new Date().toISOString()}`)

/* ── 取凭据 ─────────────────────────────────────────────────────── */

const cred = spawnSync('git', ['credential', 'fill'], {
  input: 'protocol=https\nhost=github.com\n\n',
  encoding: 'utf8',
})
const token = /^password=(.+)$/m.exec(cred.stdout ?? '')?.[1]?.trim()
if (!token) {
  console.error('拿不到 GitHub 凭据（git credential fill 无输出）')
  process.exit(2)
}

const API = 'https://api.github.com'
async function api(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      authorization: `token ${token}`,
      accept: 'application/vnd.github+json',
      'user-agent': 'dsh-whale-meter-push',
      'content-type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* 非 JSON 响应 */ }
  if (!res.ok) {
    throw new Error(`${method} ${route} → ${res.status} ${json?.message ?? text.slice(0, 300)}`)
  }
  return json
}

/* ── 收集要推的文件（遵守 .gitignore 的核心规则） ────────────────── */

const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', '.memsearch'])
const IGNORE_FILE = /(^|\/)(_preview|_panel-check|_fix\d|_p\d+|.*\.log|.*\.tgz)$/

function collect(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (IGNORE_DIRS.has(name)) continue
    const abs = path.join(dir, name)
    const rel = path.relative(root, abs).split(path.sep).join('/')
    if (IGNORE_FILE.test(rel)) continue
    const st = statSync(abs)
    if (st.isDirectory()) collect(abs, out)
    else out.push({ rel, abs })
  }
  return out
}

const files = collect(root).sort((a, b) => a.rel.localeCompare(b.rel))
console.log(`[push] ${files.length} 个文件`)

/* ── 依次上传 blob ──────────────────────────────────────────────── */

const tree = []
for (const f of files) {
  const buf = readFileSync(f.abs)
  const isText = !/\.(svg|png|jpg|webp|gif|ico)$/i.test(f.rel) || f.rel.endsWith('.svg')
  // svg 是文本，直接按 utf8 传；二进制走 base64
  const body = isText
    ? { content: buf.toString('utf8'), encoding: 'utf-8' }
    : { content: buf.toString('base64'), encoding: 'base64' }
  const blob = await api('POST', `/repos/${repoArg}/git/blobs`, body)
  tree.push({ path: f.rel, mode: '100644', type: 'blob', sha: blob.sha })
  console.log(`  ↑ ${f.rel}`)
}

/* ── 建 tree / commit / 推 ref ──────────────────────────────────── */

const newTree = await api('POST', `/repos/${repoArg}/git/trees`, { tree })
console.log(`[push] tree ${newTree.sha.slice(0, 8)}`)

let parentSha = null
try {
  const ref = await api('GET', `/repos/${repoArg}/git/ref/heads/${branch}`)
  parentSha = ref.object.sha
} catch {
  console.log(`[push] 分支 ${branch} 尚不存在，将创建首个提交`)
}

const commit = await api('POST', `/repos/${repoArg}/git/commits`, {
  message,
  tree: newTree.sha,
  ...(parentSha ? { parents: [parentSha] } : {}),
})
console.log(`[push] commit ${commit.sha.slice(0, 8)}`)

if (parentSha) {
  await api('PATCH', `/repos/${repoArg}/git/refs/heads/${branch}`, { sha: commit.sha, force: false })
} else {
  await api('POST', `/repos/${repoArg}/git/refs`, { ref: `refs/heads/${branch}`, sha: commit.sha })
}
console.log(`[push] ✓ ${repoArg}@${branch} → ${commit.sha.slice(0, 8)}`)
console.log(`[push] https://github.com/${repoArg}/tree/${branch}`)
