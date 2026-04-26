const { spawn } = require('child_process')
const http = require('http')
const electronPath = require('electron')

const tryStart = (retries = 0) => {
  http.get('http://localhost:5173', () => {
    const proc = spawn(electronPath, ['.'], {
      stdio: 'inherit',
      env: { ...process.env, NODE_ENV: 'development' },
    })
    proc.on('close', () => process.exit(0))
  }).on('error', () => {
    if (retries < 40) {
      setTimeout(() => tryStart(retries + 1), 500)
    } else {
      console.error('Vite server not ready after 20s, aborting.')
      process.exit(1)
    }
  })
}

tryStart()
