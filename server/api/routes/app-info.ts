import express from 'express';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = express.Router();

router.get('/version', async (req, res) => {
  try {
    // Read version from package.json (server is in server/, package.json is in parent)
    const packageJsonPath = resolve(__dirname, '../../../package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    
    res.json({
      version: packageJson.version,
      buildDate: process.env.BUILD_DATE || new Date().toISOString(),
      environment: process.env.NODE_ENV || 'production'
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

export default router;
