# Firebase Hosting Deployment Script (PowerShell)
# This script builds the application and deploys it to Firebase Hosting

$ErrorActionPreference = "Stop"

Write-Host "🔥 Starting Firebase deployment..." -ForegroundColor Cyan

# Check if Firebase CLI is installed
try {
    $null = Get-Command firebase -ErrorAction Stop
} catch {
    Write-Host "❌ Firebase CLI is not installed. Install it with: npm install -g firebase-tools" -ForegroundColor Red
    exit 1
}

# Check if user is logged in
try {
    $null = firebase projects:list 2>&1
} catch {
    Write-Host "❌ Not logged in to Firebase. Run: firebase login" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install

# Build the application
Write-Host "🔨 Building application..." -ForegroundColor Yellow
npm run build

# Check if build was successful
if (-not (Test-Path "dist/public")) {
    Write-Host "❌ Build failed: dist/public directory not found" -ForegroundColor Red
    exit 1
}

# Deploy to Firebase Hosting
Write-Host "🚀 Deploying to Firebase Hosting..." -ForegroundColor Yellow
firebase deploy --only hosting

Write-Host "✅ Deployment complete!" -ForegroundColor Green
$projectId = (firebase projects:list --json | ConvertFrom-Json)[0].projectId
Write-Host "🌐 Your app should be live at: https://$projectId.web.app" -ForegroundColor Green

