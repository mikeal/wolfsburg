import esbuild from 'esbuild'
import { file } from 'tmp-promise'
import { Web3Storage } from 'web3.storage'
import { createReadStream } from 'fs'
import { readFile } from 'fs/promises'
import { packToFs } from 'ipfs-car/pack/fs'
import { FsBlockStore } from 'ipfs-car/blockstore/fs'
import { CarReader } from '@ipld/car'

// Construct with token and endpoint
if (!process.env.W3S_API_TOKEN) {
  throw new Error('Must set API token to env variable W3S_API_TOKEN')
}
const client = new Web3Storage({ token: process.env.W3S_API_TOKEN })
// const res = await client.get(rootCid)
// const files = await res.files() // Promise<Web3File[]>
// for (const file of files) {
//   console.log(`${file.cid} ${file.name} ${file.size}`)
//   }

const run = async (input) => {
  const tmp = await file()
  const result = await esbuild.build(
    { bundle:true,
      entryPoints: [input],
      platform: 'node',
      outfile: tmp.path
    }
  )
  const carout = await file()
  const { root } = await packToFs({
    input: tmp.path,
    output: carout.path,
    wrapWithDirectory: false,
    blockstore: new FsBlockStore()
  })
  const inStream = createReadStream(carout.path)
  const carReader = await CarReader.fromIterable(inStream)
  await client.putCar(carReader)
  console.log(root.toString())
}

run(process.argv[2])
