#!/bin/bash

echo "🚀 Starting deployment..."

# 1. Pull latest code
echo "📥 Pulling latest code..."
git pull origin main

# 2. Install dependencies
echo "📦 Installing dependencies..."
npm install

# 3. Clean dist directory
echo "🧹 Cleaning dist directory..."
rm -rf dist

# 4. Build TypeScript
echo "🔨 Building TypeScript..."
npm run build

# 5. Check if utils directory exists
echo "🔍 Checking utils directory..."
if [ -d "dist/src/utils" ]; then
  echo "✅ Utils directory exists"
  ls -la dist/src/utils/
else
  echo "❌ Utils directory missing"
  exit 1
fi

# 6. Restart application
echo "🔄 Restarting application..."
pm2 restart tricarios

# 7. Show status
echo "📊 Application status..."
pm2 status

echo "✅ Deployment completed!"
