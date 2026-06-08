#!/usr/bin/env node
/**
 * Repair a broken Electron install when path.txt / dist/electron.exe are missing.
 * npm's postinstall sometimes exits before @electron/get finishes on some setups.
 */
const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const fs = require('fs');
const path = require('path');

const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
const pkg = require(path.join(electronDir, 'package.json'));
const version = pkg.version;
const distDir = path.join(electronDir, 'dist');
const exeName = process.platform === 'win32' ? 'electron.exe' : 'electron';
const arch = process.env.npm_config_arch || process.arch;

async function main() {
  if (fs.existsSync(path.join(electronDir, 'path.txt')) && fs.existsSync(path.join(distDir, exeName))) {
    console.log(`Electron ${version} already installed (${path.join(distDir, exeName)})`);
    return;
  }

  console.log(`Downloading Electron ${version} for ${process.platform}-${arch}...`);
  const zipPath = await downloadArtifact({
    version,
    artifactName: 'electron',
    platform: process.platform === 'win32' ? 'win32' : process.platform,
    arch: arch === 'arm64' ? 'arm64' : 'x64',
  });
  console.log(`Extracting ${zipPath} -> ${distDir}`);

  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
  }
  fs.mkdirSync(distDir, { recursive: true });
  await extract(zipPath, { dir: distDir });
  await fs.promises.writeFile(path.join(electronDir, 'path.txt'), exeName, 'utf8');

  const exePath = path.join(distDir, exeName);
  if (!fs.existsSync(exePath)) {
    throw new Error(`Expected binary missing after extract: ${exePath}`);
  }
  console.log(`Electron ${version} repaired: ${exePath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
