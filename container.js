import { create } from '../hashrpc/base.js'
import * as Block from 'multiformats/block'
import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import net from 'net'

const load = async (filename, port) => {
  let s
  const mod = await import(filename)
  const fn = mod.default.default || mod.default
  if (typeof fn !== 'function') throw new Error('Must be function')
  const onControl = async ({ cid, bytes }) => {
    // assumes all control message are dag-cbor
    const { value } = await Block.create({ cid, bytes, codec, hasher })
    if (value.type === 'run') {
      const result = await fn(value.options, { sendControl, sendBlock, getBlock })
      const finished = { type: 'finish', result: result || null }
      await sendControl(await Block.encode({ value: finished, hasher, codec }))
      await new Promise((resolve, reject) => {
        s.end(error => {
          if (error) return reject(error)
          resolve()
        })
      })
    }
  }
  const socket = await new Promise((resolve, reject) => {
    s = net.connect(port, (error) => {
      if (error) return reject(error)
      resolve(s)
    })
  })
  const opts = { onControl }
  const write = (...args) => socket.write(...args)
  const { sendBlock, sendControl, getBlock } = await create(socket, write, opts)
}

const [, , filename, port] = process.argv

;(async () => {
  await load(filename, parseInt(port))
})()
