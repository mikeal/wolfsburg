import { dir } from 'tmp-promise'
import { createWriteStream } from 'fs'
import { Readable } from 'stream'
import { writeFile } from 'fs/promises'
import { CarWriter } from '@ipld/car'
import { CID } from 'multiformats/cid'
import bent from 'bent'
import getport from 'get-port'
import net from 'net'
import { create } from '../hashrpc/base.js'
import { spawn } from 'child_process'
import * as Block from 'multiformats/block'
import * as codec from '@ipld/dag-cbor'
import { sha256 as hasher } from 'multiformats/hashes/sha2'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://ipfs.io/api/v0/block/get/bafkreiaqu6mzcnodytj754pyx6pzo2csiirkjxpvchajma6qija22zdk5q
// https://ipfs.io/ipfs/bafkreiaqu6mzcnodytj754pyx6pzo2csiirkjxpvchajma6qija22zdk5q.js

const gateway = bent('https://ipfs.io', 'buffer')

/*
if (!process.env.W3S_API_TOKEN) {
  throw new Error('Must set API token to env variable W3S_API_TOKEN')
}
const client = new Web3Storage({ token: process.env.W3S_API_TOKEN })
*/

const container = __dirname + '/container.js'

const run = async (cid, outfile, ...options) => {
  let child
  if (typeof cid === 'string') cid = CID.parse(cid)
  const buildDir = (await dir()).path

  const functionData = await gateway(`/ipfs/${cid.toString()}`)
  const filename = buildDir + '/' + cid.toString() + '.js'
  await writeFile(filename, functionData)

  const value = { type: 'run', fn: cid, options, engine: 'nodejs' }
  const root = await Block.encode({ value, hasher, codec })

  const { writer, out } = await CarWriter.create([root.cid])

  const outStream = createWriteStream(outfile)
  const readable = Readable.from(out)
  readable.pipe(outStream)
  writer.put(root)

  const server = net.createServer(async socket => {
    const onGetBlock = async cid => {
      const bytes = await gateway(`/api/v0/block/get/${cid.toString()}`)
      return sendBlock({ cid, bytes })
    }
    const onControl = async ({ cid, bytes }) => {
      const block = await Block.create({ cid, bytes, hasher, codec })
      writer.put(block)
      if (block.value.type === 'finish') {
        if (!child.killed) child.kill()
        server.close()
      }
    }
    const onSendBlock = async ({ cid, bytes }) => {
      return writer({ cid, bytes })
    }
    const opts = { onControl, onSendBlock, onGetBlock }
    const write = (...args) => socket.write(...args)
    const { sendBlock, sendControl } = await create(socket, write, opts)
    sendControl(root)
  })

  const start = async () => {
    const port = await getport()
    server.listen(port, async () => {
      child = spawn('node',  [container, filename, port], { stdio: 'inherit' })
      child.on('close' , () => {
        server.close()
      })
    })
  }

  await start()
}

run(...process.argv.slice(2))
