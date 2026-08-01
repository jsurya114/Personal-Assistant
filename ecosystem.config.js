module.exports = {
  apps: [
    {
      name: 'ultron-server',
      script: 'server.ts',
      interpreter: './node_modules/.bin/tsx',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'development',
      },
    },
    {
      name: 'ultron-voice',
      script: 'src/voice.ts',
      interpreter: './node_modules/.bin/tsx',
      cwd: __dirname,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: 'development',
      },
    },
  ],
};
