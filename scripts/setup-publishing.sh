#!/bin/bash
# Setup script for pdf-decomposer dual publishing

echo "🔧 Setting up pdf-decomposer for dual publishing..."

# Check if .npmrc exists
if [ ! -f ".npmrc" ]; then
    echo "📝 Creating .npmrc from template..."
    cp .npmrc.template .npmrc
    echo "⚠️  Please edit .npmrc and add your authentication tokens:"
    echo "   - NPM token: https://www.npmjs.com/settings/tokens"
    echo "   - GitHub token: https://github.com/settings/tokens (with write:packages scope)"
    echo ""
    echo "💡 Then run 'npm run setup:verify' to test your configuration"
    exit 1
fi

echo "✅ .npmrc file exists"

# Test NPM authentication
echo "🧪 Testing NPM authentication..."
NPM_AUTH=$(npm whoami --registry=https://registry.npmjs.org/ 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ NPM authentication successful as: $NPM_AUTH"
else
    echo "❌ NPM authentication failed - check your NPM token in .npmrc"
    exit 1
fi

# Test GitHub Packages authentication  
echo "🧪 Testing GitHub Packages authentication..."
GITHUB_AUTH=$(npm whoami --registry=https://npm.pkg.github.com/ 2>/dev/null)
if [ $? -eq 0 ]; then
    echo "✅ GitHub Packages authentication successful as: $GITHUB_AUTH"
else
    echo "❌ GitHub Packages authentication failed - check your GitHub token in .npmrc"
    exit 1
fi

echo ""
echo "🎉 Dual publishing setup complete!"
echo "📦 You can now use:"
echo "   npm run publish:npm     - Publish to NPM only"
echo "   npm run publish:github  - Publish to GitHub Packages only"  
echo "   npm run publish:both    - Publish to both registries"
echo ""
