import subprocess
import os
import sys
import datetime

BUILD_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BUILD_DIR)
print('Working directory:', os.getcwd())

# ── Set build-time env variables ──────────────────────────────────────────────
build_time = datetime.datetime.now().isoformat(timespec='seconds')
env = os.environ.copy()
env['REACT_APP_BUILD_TIME'] = build_time
env['REACT_APP_VERSION']    = '1.0'
env['CI']                   = 'false'   # prevents CRA from treating warnings as errors

# Try to get git commit hash (non-fatal if git not available)
try:
    git_hash = subprocess.check_output(
        f'git -C "{BUILD_DIR}" rev-parse --short HEAD',
        stderr=subprocess.DEVNULL, text=True, shell=True
    ).strip()
    env['REACT_APP_GIT_HASH'] = git_hash
    print(f'Git hash: {git_hash}')
except Exception:
    env['REACT_APP_GIT_HASH'] = 'n/a'

print(f'Build time: {build_time}')
print('Running: npm run build')
print('-' * 60)

result = subprocess.run('npm run build', env=env, shell=True)

print('-' * 60)
print(f'Exit code: {result.returncode}')
if result.returncode == 0:
    build_js = os.path.join(BUILD_DIR, 'build', 'static', 'js')
    if os.path.isdir(build_js):
        bundles = [f for f in os.listdir(build_js) if f.startswith('main.') and f.endswith('.js')]
        for b in bundles:
            print(f'  Bundle: {b}')
    print(f'\n✅ Build succeeded — REACT_APP_BUILD_TIME={build_time}')
else:
    print('❌ Build failed — check errors above')

sys.exit(result.returncode)
