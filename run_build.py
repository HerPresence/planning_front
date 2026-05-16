import subprocess
import os

os.chdir('t:\\planning_front')
print('Working directory:', os.getcwd())
print('Running: npm run build')
print('-' * 50)

result = subprocess.run(
    ['npm', 'run', 'build'],
    capture_output=False,
    text=True
)

print('-' * 50)
print(f'Exit code: {result.returncode}')
if result.returncode == 0:
    print('✅ Build succeeded')
else:
    print('❌ Build failed')
