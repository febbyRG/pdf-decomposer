#!/usr/bin/env node

/**
 * Dev-only: make sure the native `canvas` binding loads on the CURRENT Node
 * before an install finishes or a harness script runs.
 *
 * `canvas` ships a compiled C++ addon (build/Release/canvas.node) tied to one
 * Node ABI. This repo's dev toolchain is Node 16, but an `npm install` run
 * from a shell that happens to be on another Node (e.g. 22) fetches that
 * ABI's binary, and every harness script then dies on Node 16 with
 * ERR_DLOPEN_FAILED / NODE_MODULE_VERSION mismatch.
 *
 * Hooked in two places:
 *  - `prepare` (runs on local installs in this repo, never on consumers
 *    installing the published tarball, which ships dist/ only). Do NOT move
 *    this to `postinstall`: that lifecycle also executes on every consumer
 *    install of this published package, where the script does not exist in
 *    the tarball, which fails their install outright.
 *  - `pre<harness>` hooks, so a run under a different Node than the last
 *    install self-heals by rebuilding for the Node actually running.
 *
 * Never throws: a dev convenience must not fail an install or a test run.
 */

const { execSync } = require('child_process')

const log = (msg) => console.log(`[rebuild-canvas-dev] ${msg}`)

// canvas may be absent (fresh clone mid-install edge cases).
try {
  require.resolve('canvas')
} catch {
  process.exit(0)
}

// Binding loads on this Node: healthy, nothing to do.
try {
  require('canvas')
  process.exit(0)
} catch {
  // Missing binary or ABI mismatch: fall through and rebuild.
}

const major = Number(process.versions.node.split('.')[0])
log(`canvas failed to load on Node ${process.version}, rebuilding...`)
if (major !== 16) {
  log(`note: this repo's dev flow is Node 16 (nvm use 16). Rebuilding for Node ${major} works, but the binding will need another rebuild back on 16.`)
}

// Plain rebuild first: node-pre-gyp fetches the prebuilt binary for this ABI
// when one exists (fast, no toolchain needed).
try {
  execSync('npm rebuild canvas', { stdio: 'inherit' })
  require('canvas')
  log('canvas rebuilt (prebuilt binary).')
  process.exit(0)
} catch {
  // No prebuilt for this ABI or the fetch failed: try building from source.
}

// Source build needs Homebrew's pkg-config libs on macOS.
if (process.platform === 'darwin') {
  try {
    const prefix = execSync('brew --prefix', { encoding: 'utf8' }).trim()
    execSync('npm rebuild canvas --build-from-source', {
      stdio: 'inherit',
      env: { ...process.env, PKG_CONFIG_PATH: `${prefix}/lib/pkgconfig` }
    })
    require('canvas')
    log('canvas rebuilt from source.')
    process.exit(0)
  } catch (err) {
    log(`canvas rebuild failed (${err.message}).`)
  }
}

log('Rebuild manually if a harness script needs canvas: nvm use 16 && npm rebuild canvas')
process.exit(0)
