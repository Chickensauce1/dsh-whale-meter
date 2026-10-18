/**
 * 会话日志解压：会话文件既可能是纯 JSONL，也可能是「多帧拼接」的 zstd。
 * Node 的 zstdDecompress 只吃单帧，遇到拼接帧会截断，所以这里先扫描帧边界再逐帧解。
 *
 * 兼容性说明（重要）：
 *  - zstd 支持在 Node 22.15 / 23.8 才进入 node:zlib。宿主自带 Node 24，
 *    但若被装进更老的运行时，这里不静默返回空串，而是把 zstdSupported 报出去，
 *    让面板显示「运行时缺少 zstd 支持」，而不是假装「你没有用量」。
 *  - 拼接流里可能出现 skippable frame（magic 0x184D2A5x），旧实现遇到就 break，
 *    后面所有帧全丢。这里按规范跳过。
 */

import zlib from 'node:zlib'

const ZSTD_MAGIC = 0xfd2fb528
const SKIPPABLE_MASK = 0xfffffff0
const SKIPPABLE_MAGIC = 0x184d2a50

/** 运行时可用的 zstd 解压入口；都没有则为 null。 */
const zstdImpl = (() => {
  try {
    if (typeof zlib.zstdDecompress === 'function') return { kind: 'callback', fn: zlib.zstdDecompress }
    if (typeof zlib.zstdDecompressSync === 'function') return { kind: 'sync', fn: zlib.zstdDecompressSync }
  } catch { /* 老运行时 */ }
  return null
})()

/** 运行时是否支持 zstd 解压。面板据此区分「真没用量」与「压根读不了」。 */
export const zstdSupported = zstdImpl !== null

/**
 * 扫描缓冲区内所有 zstd 帧的字节区间；非 zstd 开头返回空数组。
 * 同时跳过 skippable frame（规范允许，且真实文件里出现过）。
 */
export function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) break
    const magic = buffer.readUInt32LE(offset)

    // skippable frame：[magic:4][size:4][payload:size]
    if ((magic & SKIPPABLE_MASK) === SKIPPABLE_MAGIC) {
      if (buffer.length - offset < 8) break
      const size = buffer.readUInt32LE(offset + 4)
      offset += 8 + size
      if (offset > buffer.length) break
      continue
    }

    if (magic !== ZSTD_MAGIC) break
    offset += 4
    if (offset === buffer.length) break
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) break
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) break
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 0x03
      const blockSize = blockHeader >>> 3
      const payloadBytes = blockType === 0x01 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) break
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) break
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

function decompressOne(buffer) {
  if (zstdImpl === null) return Promise.resolve('')
  if (zstdImpl.kind === 'sync') {
    try {
      return Promise.resolve(zstdImpl.fn(buffer).toString('utf8'))
    } catch {
      return Promise.resolve('')
    }
  }
  return new Promise((resolve) => {
    zstdImpl.fn(buffer, (err, out) => {
      resolve(err || !out ? '' : out.toString('utf8'))
    })
  })
}

/** 解压单帧或拼接多帧的 zstd 缓冲，返回 UTF-8 文本；失败返回空串。 */
export async function decompressZstd(buffer) {
  if (zstdImpl === null) return ''
  const frames = scanZstdFrames(buffer)
  if (frames.length === 0) return await decompressOne(buffer)
  let result = ''
  for (const frame of frames) {
    result += await decompressOne(buffer.subarray(frame.start, frame.end))
  }
  return result
}

/**
 * 把 JSONL 文本解析成事件数组。
 *
 * 第一行是头部元信息（{type:'session',version,cwd,...}），从第二行开始才是事件。
 * 最后一行可能是写入中的半截 JSON，解析失败就跳过，不影响前面的事件。
 * 也兼容「头部之后又出现一条 session 头」的写法：靠 type 字段判断，不靠行号硬跳过。
 *
 * @param {string} text 已解压的文本
 * @returns {object[]} 事件数组（仅保留带 string 类型字段的对象）
 */
export function parseEventLines(text) {
  const events = []
  if (!text) return events
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].trim()
    if (!line) continue
    try {
      const event = JSON.parse(line)
      if (event && typeof event === 'object' && typeof event.type === 'string') {
        if (event.type === 'session') continue
        events.push(event)
      }
    } catch {
      // 写入中的截断行
    }
  }
  return events
}
