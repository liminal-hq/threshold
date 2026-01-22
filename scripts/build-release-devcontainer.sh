#!/bin/bash
# Build script for use with VS Code Dev Containers
# Automatically uses keystore.properties from /keys mount
# NO MANUAL SETUP REQUIRED! 🎉

set -e

# Colours for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Colour

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Threshold Android Release Builder    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Check we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    echo -e "${RED}Error: Must be run from repo root${NC}"
    exit 1
fi

# Check for keystore.properties at /keys mount
KEYS_PROPS="/keys/keystore.properties"
KEYS_DIR="/keys"

if [ ! -f "$KEYS_PROPS" ]; then
    echo -e "${RED}Error: keystore.properties not found${NC}"
    echo ""
    echo -e "${YELLOW}Setup required:${NC}"
    echo ""
    echo "  1. On your HOST machine, create keystore.properties:"
    echo "     cat > ~/threshold-keys/keystore.properties <<EOF"
    echo "     keyAlias=google-play-upload"
    echo "     password=YOUR_KEYSTORE_PASSWORD"
    echo "     storeFile=/keys/upload-keystore.jks"
    echo "     EOF"
    echo ""
    echo "  2. Make sure .devcontainer/devcontainer.json has the mount:"
    echo "     \"mounts\": ["
    echo "       \"source=\${localEnv:HOME}/threshold-keys,target=/keys,type=bind,readonly\""
    echo "     ]"
    echo ""
    echo "  3. Rebuild your dev container"
    echo ""
    exit 1
fi

# Verify the keystore file exists
KEYSTORE_FILE=$(grep "^storeFile=" "$KEYS_PROPS" | cut -d'=' -f2)

# If the keystore path is absolute, use it directly
# If relative, it's relative to the keys directory
if [[ "$KEYSTORE_FILE" =~ ^/ ]]; then
    # Absolute path - check if it exists or needs to be mapped
    if [ ! -f "$KEYSTORE_FILE" ]; then
        # Try mapping /keys to actual location
        if [ -n "$KEYS_DIR" ]; then
            KEYSTORE_FILE="${KEYSTORE_FILE//\/keys/$KEYS_DIR}"
        fi
    fi
else
    # Relative path - make it relative to keys directory
    KEYSTORE_FILE="$KEYS_DIR/$KEYSTORE_FILE"
fi

if [ ! -f "$KEYSTORE_FILE" ]; then
    echo -e "${RED}Error: Keystore file not found: $KEYSTORE_FILE${NC}"
    echo "Check that your keys are accessible:"
    echo "  ls -la $KEYS_DIR"
    exit 1
fi

echo -e "${GREEN}✓ Keystore configuration found${NC}"
echo -e "  Location: $KEYS_PROPS"
echo -e "  Keystore: $KEYSTORE_FILE${NC}\n"

# Check NDK
if [ -z "$NDK_HOME" ]; then
    echo -e "${YELLOW}⚠ NDK_HOME not set, attempting to find NDK...${NC}"
    
    if [ -d "$ANDROID_HOME/ndk" ]; then
        # Find latest NDK (preferably r28+)
        NDK_VERSION=$(ls -1 "$ANDROID_HOME/ndk" | sort -V | tail -n1)
        export NDK_HOME="$ANDROID_HOME/ndk/$NDK_VERSION"
        export ANDROID_NDK_HOME="$NDK_HOME"
        echo -e "${GREEN}✓ Found NDK: $NDK_HOME${NC}\n"
    else
        echo -e "${RED}Error: No NDK found. Install with: sdkmanager 'ndk;28.0.12674558'${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✓ NDK configured: $NDK_HOME${NC}\n"
fi

# Ensure Rust targets are installed
echo -e "${BLUE}📦 Checking Rust Android targets...${NC}"
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android 2>/dev/null || true
echo -e "${GREEN}✓ Rust targets ready${NC}\n"

# Link keystore.properties into Android project
ANDROID_PROJECT="apps/threshold/src-tauri/gen/android"
TARGET_PROPS="$ANDROID_PROJECT/keystore.properties"

echo -e "${BLUE}🔗 Linking keystore.properties...${NC}"

# Remove existing link/file if present
if [ -L "$TARGET_PROPS" ] || [ -f "$TARGET_PROPS" ]; then
    rm "$TARGET_PROPS"
fi

# Create symlink
ln -s "$KEYS_PROPS" "$TARGET_PROPS"

if [ ! -L "$TARGET_PROPS" ]; then
    echo -e "${RED}Error: Failed to create symlink${NC}"
    exit 1
fi

echo -e "${GREEN}✓ keystore.properties linked${NC}\n"

# Set up cleanup trap to ensure symlink is removed even on failure
cleanup() {
    if [ -L "$TARGET_PROPS" ]; then
        echo -e "\n${BLUE}🧹 Cleaning up keystore symlink...${NC}"
        rm "$TARGET_PROPS"
        echo -e "${GREEN}✓ Removed keystore.properties symlink${NC}"
    fi
}
trap cleanup EXIT

# Build
echo -e "${MAGENTA}╔════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║         Building Release AAB...        ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════╝${NC}\n"

pnpm build:android

BUILD_RESULT=$?

# Check if build succeeded
if [ $BUILD_RESULT -ne 0 ]; then
    echo -e "\n${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║           Build Failed ❌              ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}\n"
    exit 1
fi

AAB_PATH=$(find apps/threshold/src-tauri/gen/android/app/build/outputs/bundle/universalRelease -name "*.aab" -type f 2>/dev/null | head -n1)

if [ -z "$AAB_PATH" ]; then
    echo -e "\n${RED}✗ Build completed but no AAB found${NC}"
    exit 1
fi

echo -e "\n${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✓ Release Build Successful! 🎉     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}\n"

# Create release directory and copy outputs
RELEASE_DIR="release"
echo -e "${BLUE}📦 Copying release files...${NC}"

mkdir -p "$RELEASE_DIR"

# Extract version from tauri.properties
TAURI_PROPS="apps/threshold/src-tauri/gen/android/app/tauri.properties"
if [ -f "$TAURI_PROPS" ]; then
    VERSION_NAME=$(grep "tauri.android.versionName" "$TAURI_PROPS" | cut -d'=' -f2)
    VERSION_CODE=$(grep "tauri.android.versionCode" "$TAURI_PROPS" | cut -d'=' -f2)
    VERSION_SUFFIX="-v${VERSION_NAME}-${VERSION_CODE}"
else
    VERSION_SUFFIX=""
fi

# Copy AAB
AAB_FILENAME=$(basename "$AAB_PATH" .aab)
cp "$AAB_PATH" "$RELEASE_DIR/${AAB_FILENAME}${VERSION_SUFFIX}.aab"
echo -e "${GREEN}✓ Copied AAB to: $RELEASE_DIR/${AAB_FILENAME}${VERSION_SUFFIX}.aab${NC}"

# Show file info
AAB_SIZE=$(du -h "$RELEASE_DIR/${AAB_FILENAME}${VERSION_SUFFIX}.aab" | cut -f1)
echo -e "${BLUE}📦 AAB Size:${NC} $AAB_SIZE"
echo ""

# Check for debug symbols
SYMBOLS_DIR=$(find apps/threshold/src-tauri/gen/android/app/build/intermediates/merged_native_libs/universalRelease -type d -name "lib" 2>/dev/null | head -n1)

if [ -n "$SYMBOLS_DIR" ] && [ -d "$SYMBOLS_DIR" ]; then
    # Check if libraries actually have debug symbols
    SAMPLE_LIB=$(find "$SYMBOLS_DIR" -name "libthreshold.so" | head -n1)
    
    if [ -n "$SAMPLE_LIB" ] && file "$SAMPLE_LIB" | grep -q "not stripped"; then
        echo -e "${BLUE}🔍 Creating debug symbols zip...${NC}"
        
        # Save current directory (repo root)
        REPO_ROOT=$(pwd)
        
        # Create symbols zip
        cd "$SYMBOLS_DIR"
        SYMBOLS_ZIP="native-debug-symbols.zip"
        zip -r -q "$SYMBOLS_ZIP" arm64-v8a/ armeabi-v7a/ x86/ x86_64/ 2>/dev/null || true
        
        if [ -f "$SYMBOLS_ZIP" ]; then
            SYMBOLS_SIZE=$(du -h "$SYMBOLS_ZIP" | cut -f1)
            
            # Copy to release directory at repo root with version suffix
            cp "$SYMBOLS_ZIP" "$REPO_ROOT/$RELEASE_DIR/native-debug-symbols${VERSION_SUFFIX}.zip"
            
            echo -e "${GREEN}✓ Debug Symbols Package Created${NC}"
            echo -e "   Copied to: $RELEASE_DIR/native-debug-symbols${VERSION_SUFFIX}.zip"
            echo -e "${BLUE}📦 Symbols Size:${NC} $SYMBOLS_SIZE"
            echo ""
        fi
        cd - > /dev/null
    else
        echo -e "${YELLOW}⚠ Native libraries are stripped (no debug symbols)${NC}"
        echo "   To enable crash symbolication, add to apps/threshold/src-tauri/Cargo.toml:"
        echo "   [profile.release]"
        echo "   strip = false"
        echo ""
    fi
else
    echo -e "${YELLOW}⚠ Native libraries directory not found${NC}"
    echo "   (Build may not have completed successfully)"
    echo ""
fi

# Verify signature
echo -e "${BLUE}🔐 Verifying signature...${NC}"
if command -v jarsigner &> /dev/null; then
    SIGNER=$(jarsigner -verify -verbose -certs "$AAB_PATH" 2>&1 | grep "CN=" | head -n1 | sed 's/.*CN=/CN=/g')
    if [ -n "$SIGNER" ]; then
        echo -e "${GREEN}✓ Signed by: $SIGNER${NC}"
    else
        echo -e "${YELLOW}⚠ Could not verify signature (but build succeeded)${NC}"
    fi
else
    echo -e "${YELLOW}⚠ jarsigner not found, skipping signature verification${NC}"
fi

echo ""
echo -e "${MAGENTA}╔════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║            Next Steps                  ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════╝${NC}"
echo ""
echo -e "${YELLOW}1.${NC} Upload files from ${BLUE}release/${NC} folder to Play Console:"
echo "   https://play.google.com/console"
echo "   📦 AAB: release/${AAB_FILENAME}${VERSION_SUFFIX}.aab"

# Check if we created symbols
if [ -f "release/native-debug-symbols${VERSION_SUFFIX}.zip" ]; then
    echo "   🐛 Symbols: release/native-debug-symbols${VERSION_SUFFIX}.zip"
fi

echo ""
echo -e "${YELLOW}2.${NC} Before next build, increment version in:"
echo "   apps/threshold/src-tauri/tauri.conf.json"
echo "   (Look for 'versionCode' under bundle.android)"
echo ""
echo -e "${GREEN}✨ Build complete! Happy releasing! ✨${NC}"
echo ""