#!/bin/bash

# Firebase Hosting Deployment Script
# This script builds the application and deploys it to Firebase Hosting

set -e  # Exit on error

echo "🔥 Starting Firebase deployment..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI is not installed. Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if user is logged in
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase. Run: firebase login"
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Build the application
echo "🔨 Building application..."
npm run build

# Check if build was successful
if [ ! -d "dist/public" ]; then
    echo "❌ Build failed: dist/public directory not found"
    exit 1
fi

# Deploy to Firebase Hosting
echo "🚀 Deploying to Firebase Hosting..."
firebase deploy --only hosting

echo "✅ Deployment complete!"
echo "🌐 Your app should be live at: https://$(firebase projects:list --json | jq -r '.[0].projectId').web.app"

