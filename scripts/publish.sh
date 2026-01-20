#!/bin/bash

# =============================================================================
# PDF Decomposer - Automated Publish Script
# =============================================================================
# This script automates:
# 1. Version bump (patch/minor/major)
# 2. Build and test
# 3. Git commit and tag
# 4. Publish to npm and GitHub packages
#
# Usage:
#   npm run publish           # patch version bump (default)
#   npm run publish:minor     # minor version bump
#   npm run publish:major     # major version bump
# =============================================================================

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get version bump type from argument (default: patch)
BUMP_TYPE=${1:-patch}

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   PDF Decomposer - Publish Script${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Validate bump type
if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
    echo -e "${RED}Error: Invalid version bump type '$BUMP_TYPE'${NC}"
    echo "Valid options: patch, minor, major"
    exit 1
fi

# Check for uncommitted changes
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${YELLOW}Warning: You have uncommitted changes${NC}"
    git status --short
    echo ""
    read -p "Do you want to continue? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}Aborted.${NC}"
        exit 1
    fi
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}Current version:${NC} $CURRENT_VERSION"
echo -e "${BLUE}Bump type:${NC} $BUMP_TYPE"

# Calculate new version
case $BUMP_TYPE in
    patch)
        NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{print $1"."$2"."$3+1}')
        ;;
    minor)
        NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{print $1"."$2+1".0"}')
        ;;
    major)
        NEW_VERSION=$(echo $CURRENT_VERSION | awk -F. '{print $1+1".0.0"}')
        ;;
esac

echo -e "${GREEN}New version:${NC} $NEW_VERSION"
echo ""

# Confirm
read -p "Proceed with publishing v$NEW_VERSION? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Aborted.${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}Step 1/6: Running lint...${NC}"
npm run lint
echo -e "${GREEN}✓ Lint passed${NC}"

echo ""
echo -e "${BLUE}Step 2/6: Running tests...${NC}"
npm run test
echo -e "${GREEN}✓ Tests passed${NC}"

echo ""
echo -e "${BLUE}Step 3/6: Building...${NC}"
npm run build
echo -e "${GREEN}✓ Build completed${NC}"

echo ""
echo -e "${BLUE}Step 4/6: Bumping version to $NEW_VERSION...${NC}"
# Update package.json version
npm version $BUMP_TYPE --no-git-tag-version
echo -e "${GREEN}✓ Version bumped to $NEW_VERSION${NC}"

echo ""
echo -e "${BLUE}Step 5/6: Committing and tagging...${NC}"
git add package.json package-lock.json
git commit -m "chore: release v$NEW_VERSION"
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
git push
git push --tags
echo -e "${GREEN}✓ Committed and tagged${NC}"

echo ""
echo -e "${BLUE}Step 6/6: Publishing to registries...${NC}"

# Backup original .npmrc if exists
if [[ -f .npmrc ]]; then
    cp .npmrc .npmrc.backup
fi

# Publish to npm
echo -e "${BLUE}  Publishing to npm...${NC}"
if [[ -f .npmrc.npmjs ]]; then
    cp .npmrc.npmjs .npmrc
    npm publish --access=public
    echo -e "${GREEN}  ✓ Published to npm${NC}"
else
    echo -e "${YELLOW}  ⚠ .npmrc.npmjs not found, skipping npm publish${NC}"
fi

# Publish to GitHub Packages
echo -e "${BLUE}  Publishing to GitHub Packages...${NC}"
if [[ -f .npmrc.github ]]; then
    cp .npmrc.github .npmrc
    npm publish --access=public
    echo -e "${GREEN}  ✓ Published to GitHub Packages${NC}"
else
    echo -e "${YELLOW}  ⚠ .npmrc.github not found, skipping GitHub publish${NC}"
fi

# Restore original .npmrc
if [[ -f .npmrc.backup ]]; then
    mv .npmrc.backup .npmrc
elif [[ -f .npmrc.npmjs ]]; then
    cp .npmrc.npmjs .npmrc
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   Successfully published v$NEW_VERSION${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "npm: https://www.npmjs.com/package/@febbyrg/pdf-decomposer"
echo -e "GitHub: https://github.com/febbyRG/pdf-decomposer/packages"
