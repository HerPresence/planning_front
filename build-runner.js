const { execSync } = require('child_process');
const path = require('path');

const projectDir = path.resolve('.');
console.log('Building from:', projectDir);

try {
  const output = execSync('npm run build', {
    cwd: projectDir,
    encoding: 'utf-8',
    stdio: 'pipe',
    maxBuffer: 50 * 1024 * 1024
  });
  console.log(output);
  console.log('\n✅ Build completed successfully');
} catch (error) {
  console.error('Build failed:');
  console.error(error.stdout || error.message);
  console.error(error.stderr || '');
  process.exit(1);
}
