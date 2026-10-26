const { spawn } = require('child_process');
const path = require('path');

const env = {
  ...process.env,
  PORT: '3001',
  NEXT_DIST_DIR: '.next_staging',
  NEXT_PUBLIC_API_URL: 'http://localhost:5001/api',
  NEXT_PUBLIC_SOCKET_URL: 'http://localhost:5001'
};

const nextBinPath = require.resolve('next/dist/bin/next');
console.log('Starting Staging Frontend on port 3001 pointing to http://localhost:5001/api...');

const child = spawn(process.execPath, [nextBinPath, 'dev', '-p', '3001'], {
  env,
  cwd: __dirname,
  stdio: 'inherit'
});

child.on('exit', (code) => {
  console.log(`Staging frontend process exited with code ${code}`);
  process.exit(code || 0);
});
