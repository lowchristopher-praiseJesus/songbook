#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto'

const SECRET = process.env.LICENSE_SECRET
if (!SECRET) {
  console.error('Error: LICENSE_SECRET environment variable is required')
  console.error('Usage: LICENSE_SECRET=<secret> node scripts/generate-license.js')
  process.exit(1)
}
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function bitsToChar(bits) {
  return ALPHABET[bits & 0x1f]
}

function encodePayload({ version, expiresAt, licenseType, random }) {
  const bits = new Array(60).fill(0)

  function writeBits(start, count, value) {
    for (let i = count - 1; i >= 0; i--) {
      bits[start + i] = value & 1
      value >>= 1
    }
  }

  writeBits(0, 4, version)
  writeBits(4, 31, expiresAt)
  writeBits(35, 4, licenseType)
  writeBits(39, 21, random)

  let chars = ''
  for (let i = 0; i < 12; i++) {
    let v = 0
    for (let b = 0; b < 5; b++) {
      v = (v << 1) | bits[i * 5 + b]
    }
    chars += bitsToChar(v)
  }
  return chars
}

function computeChecksum(payload) {
  const hash = createHash('md5').update(SECRET + payload).digest('hex')
  let bits = 0
  for (let i = 0; i < 5; i++) {
    bits = (bits << 4) | parseInt(hash[i], 16)
  }
  let checksum = ''
  for (let i = 0; i < 4; i++) {
    checksum += bitsToChar((bits >> (15 - i * 5)) & 0x1f)
  }
  return checksum
}

function generateLicenseKey({ expiresAt, licenseType = 1 }) {
  const random = randomBytes(4).readUInt32BE(0) & 0x1fffff
  const payload = encodePayload({ version: 0, expiresAt, licenseType, random })
  const checksum = computeChecksum(payload)
  return `SONGBOOK-${payload.slice(0, 4)}-${payload.slice(4, 8)}-${payload.slice(8, 12)}-${checksum}`
}

function parseArgs() {
  const args = process.argv.slice(2)
  let expiryDays = 365
  let count = 1

  for (const arg of args) {
    if (arg.startsWith('--expiry-days=')) {
      expiryDays = parseInt(arg.split('=')[1], 10)
      if (isNaN(expiryDays) || expiryDays < 0) {
        console.error('Invalid --expiry-days value')
        process.exit(1)
      }
    } else if (arg.startsWith('--count=')) {
      count = parseInt(arg.split('=')[1], 10)
      if (isNaN(count) || count < 1) {
        console.error('Invalid --count value')
        process.exit(1)
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/generate-license.js [options]

Options:
  --expiry-days=N  Days until license expires (default: 365, 0 = no expiry)
  --count=N        Number of keys to generate (default: 1)
  --help, -h       Show this help

Environment:
  LICENSE_SECRET   Secret for checksum (must match the app's embedded secret)`)
      process.exit(0)
    }
  }

  return { expiryDays, count }
}

const { expiryDays, count } = parseArgs()
const expiresAt = expiryDays > 0
  ? Math.floor(Date.now() / 1000) + expiryDays * 86400
  : 0

for (let i = 0; i < count; i++) {
  console.log(generateLicenseKey({ expiresAt }))
}
