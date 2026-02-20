import express from 'express';
import { readFileSync, existsSync, statSync, createReadStream } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

interface ReleaseFile {
  name: string;
  type: 'installer' | 'portable';
  size: number;
  sha512: string;
  downloadUrl: string;
}

interface Release {
  version: string;
  date: string;
  environment: 'production' | 'staging';
  files: ReleaseFile[];
  changelog: string;
}

interface ReleasesData {
  releases: Release[];
}

function getReleasesJsonPath(): string {
  return resolve(process.cwd(), 'releases/releases.json');
}

function loadReleases(): ReleasesData {
  const jsonPath = getReleasesJsonPath();
  if (!existsSync(jsonPath)) {
    return { releases: [] };
  }
  return JSON.parse(readFileSync(jsonPath, 'utf-8'));
}

function getCurrentEnvironment(): string {
  return process.env.NODE_ENV || 'production';
}

router.get('/version', async (req, res) => {
  try {
    const packageJsonPath = resolve(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    res.json({
      version: packageJson.version,
      buildDate: process.env.BUILD_DATE || new Date().toISOString(),
      environment: getCurrentEnvironment()
    });
  } catch (error) {
    console.error('Error getting version:', error);
    res.status(500).json({ error: 'Failed to get version information' });
  }
});

// Serve latest.yml for electron-updater auto-update checks.
// The file lives at server/updates/latest.yml. process.cwd() is the server/ dir
// in both dev (tsx) and production (node dist/api/index.js run from server/).
router.get('/updates/latest.yml', async (req, res) => {
  try {
    const ymlPath = resolve(process.cwd(), 'updates/latest.yml');
    if (!existsSync(ymlPath)) {
      return res.status(404).send('No update metadata found');
    }
    const content = readFileSync(ymlPath, 'utf-8');
    res.setHeader('Content-Type', 'text/yaml');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(content);
  } catch (error) {
    console.error('Error serving latest.yml:', error);
    res.status(500).send('Failed to serve update metadata');
  }
});

// Serve installer exe files for electron-updater auto-update downloads.
// Looks in server/releases/ for the requested file.
router.get('/updates/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const safeName = basename(filename);
    if (!safeName.endsWith('.exe') && !safeName.endsWith('.blockmap')) {
      return res.status(400).send('Invalid file type');
    }
    const filePath = resolve(process.cwd(), 'releases', safeName);
    if (!existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    const stat = statSync(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'no-cache');
    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error serving update file:', error);
    res.status(500).send('Failed to serve update file');
  }
});

// List all releases for the current environment
router.get('/releases', async (req, res) => {
  try {
    const data = loadReleases();
    const env = getCurrentEnvironment();
    const envFilter = env === 'staging' ? 'staging' : 'production';
    const filtered = data.releases
      .filter(r => r.environment === envFilter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      environment: envFilter,
      releases: filtered
    });
  } catch (error) {
    console.error('Error listing releases:', error);
    res.status(500).json({ error: 'Failed to list releases' });
  }
});

// Get the latest release for the current environment
router.get('/releases/latest', async (req, res) => {
  try {
    const data = loadReleases();
    const env = getCurrentEnvironment();
    const envFilter = env === 'staging' ? 'staging' : 'production';
    const sorted = data.releases
      .filter(r => r.environment === envFilter)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (sorted.length === 0) {
      return res.status(404).json({ error: 'No releases found' });
    }

    res.json(sorted[0]);
  } catch (error) {
    console.error('Error getting latest release:', error);
    res.status(500).json({ error: 'Failed to get latest release' });
  }
});

// Download a release file directly from this server (fallback if files are hosted locally)
router.get('/releases/download/:filename', async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);
    const safeName = basename(filename);
    if (!safeName.endsWith('.exe')) {
      return res.status(400).json({ error: 'Invalid file type' });
    }

    const filePath = resolve(process.cwd(), 'releases', safeName);
    if (!existsSync(filePath)) {
      return res.status(404).json({ error: 'Release file not found. It may be hosted externally.' });
    }

    const stat = statSync(filePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Error serving release file:', error);
    res.status(500).json({ error: 'Failed to serve release file' });
  }
});

export default router;
