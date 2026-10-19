// Load root configuration without propagating --env-file into Next worker flags.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
process.chdir(path.join(root, 'apps/web'));
require('next/dist/bin/next');
