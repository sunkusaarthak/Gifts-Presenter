import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { downloadArtifact } from '@electron/get';

const ELECTRON_VERSION = '33.4.11';
const ROOT_DIR = process.cwd();
const RELEASE_DIR = path.join(ROOT_DIR, 'release');
const ASAR_SRC = path.join(RELEASE_DIR, 'win-unpacked', 'resources', 'app.asar');
const DEMO_SRC = path.join(RELEASE_DIR, 'win-unpacked', 'resources', 'demo-project');
const UNPACKED_SRC = path.join(RELEASE_DIR, 'win-unpacked', 'resources', 'app.asar.unpacked');

if (!fs.existsSync(ASAR_SRC)) {
  console.error('Error: app.asar not found at', ASAR_SRC);
  console.error('Please run "npm run build:win" first to build the application bundle.');
  process.exit(1);
}

async function packageForArch(arch) {
  console.log(`\n--- Packaging macOS (${arch}) ---`);
  console.log(`Fetching Electron v${ELECTRON_VERSION} darwin-${arch} runtime...`);
  const zipPath = await downloadArtifact({
    version: ELECTRON_VERSION,
    platform: 'darwin',
    arch,
    artifactName: 'electron',
  });
  console.log('Runtime downloaded:', zipPath);

  const stagingDir = path.join(RELEASE_DIR, `mac-staging-${arch}`);
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
  fs.mkdirSync(stagingDir, { recursive: true });

  console.log('Extracting Electron macOS runtime via tar...');
  execSync(`tar -xf "${zipPath}" -C "${stagingDir}"`, { stdio: 'inherit' });

  const appDir = path.join(stagingDir, 'Electron.app');
  if (!fs.existsSync(appDir)) {
    throw new Error('Electron.app not found inside extracted runtime');
  }

  // Update Info.plist
  const plistPath = path.join(appDir, 'Contents', 'Info.plist');
  let plist = fs.readFileSync(plistPath, 'utf8');
  plist = plist
    .replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>Gifts Presenter</string>')
    .replace(/<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleName</key>\n\t<string>Gifts Presenter</string>')
    .replace(/<key>CFBundleIdentifier<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleIdentifier</key>\n\t<string>org.gifts.presenter</string>');
  fs.writeFileSync(plistPath, plist, 'utf8');
  console.log('Updated Info.plist bundle metadata.');

  // Inject app.asar
  const resourcesDir = path.join(appDir, 'Contents', 'Resources');
  const targetAsar = path.join(resourcesDir, 'app.asar');
  fs.copyFileSync(ASAR_SRC, targetAsar);
  console.log('Copied app.asar into macOS bundle.');

  // Inject demo-project
  if (fs.existsSync(DEMO_SRC)) {
    const targetDemo = path.join(resourcesDir, 'demo-project');
    fs.cpSync(DEMO_SRC, targetDemo, { recursive: true });
    console.log('Copied demo-project into macOS bundle.');
  }

  // Inject unpacked native dependencies if any
  if (fs.existsSync(UNPACKED_SRC)) {
    const targetUnpacked = path.join(resourcesDir, 'app.asar.unpacked');
    fs.cpSync(UNPACKED_SRC, targetUnpacked, { recursive: true });
    console.log('Copied app.asar.unpacked into macOS bundle.');
  }

  // Rename Electron.app to Gifts Presenter.app
  const finalAppDir = path.join(stagingDir, 'Gifts Presenter.app');
  fs.renameSync(appDir, finalAppDir);

  // Archive into release zip preserving Unix permissions
  const outputZip = path.join(RELEASE_DIR, `Gifts-Presenter-1.0.0-mac-${arch}.zip`);
  console.log(`Archiving into ${outputZip}...`);
  execSync(`tar -a -cf "${outputZip}" -C "${stagingDir}" "Gifts Presenter.app"`, { stdio: 'inherit' });

  // Cleanup staging
  fs.rmSync(stagingDir, { recursive: true, force: true });
  console.log(`Successfully built: ${outputZip} (${(fs.statSync(outputZip).size / (1024 * 1024)).toFixed(1)} MB)`);
  return outputZip;
}

(async () => {
  try {
    const arm64Zip = await packageForArch('arm64');
    const x64Zip = await packageForArch('x64');

    // Create a default alias Gifts-Presenter-1.0.0-mac.zip pointing to Apple Silicon (arm64)
    const defaultMacZip = path.join(RELEASE_DIR, 'Gifts-Presenter-1.0.0-mac.zip');
    fs.copyFileSync(arm64Zip, defaultMacZip);

    console.log('\n--- macOS Packaging Complete ---');
    console.log('Apple Silicon (M1/M2/M3/M4):', arm64Zip);
    console.log('Intel (x64):', x64Zip);
    console.log('Default macOS bundle:', defaultMacZip);
  } catch (err) {
    console.error('Packaging failed:', err);
    process.exit(1);
  }
})();
