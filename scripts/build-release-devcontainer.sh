#!/bin/bash
# Build script for use with VS Code Dev Containers
# Builds both the phone app (Tauri) and the Wear OS companion app
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

# Link keystore.properties into both Android projects
PHONE_ANDROID_PROJECT="apps/threshold/src-tauri/gen/android"
PHONE_TARGET_PROPS="$PHONE_ANDROID_PROJECT/keystore.properties"
WEAR_PROJECT="apps/threshold-wear"
WEAR_TARGET_PROPS="$WEAR_PROJECT/keystore.properties"

echo -e "${BLUE}🔗 Linking keystore.properties...${NC}"

# Phone app
if [ -L "$PHONE_TARGET_PROPS" ] || [ -f "$PHONE_TARGET_PROPS" ]; then
    rm "$PHONE_TARGET_PROPS"
fi
ln -s "$KEYS_PROPS" "$PHONE_TARGET_PROPS"

if [ ! -L "$PHONE_TARGET_PROPS" ]; then
    echo -e "${RED}Error: Failed to create phone app symlink${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Phone app keystore linked${NC}"

# Wear app
if [ -L "$WEAR_TARGET_PROPS" ] || [ -f "$WEAR_TARGET_PROPS" ]; then
    rm "$WEAR_TARGET_PROPS"
fi
ln -s "$KEYS_PROPS" "$WEAR_TARGET_PROPS"

if [ ! -L "$WEAR_TARGET_PROPS" ]; then
    echo -e "${RED}Error: Failed to create wear app symlink${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Wear app keystore linked${NC}\n"

# Set up cleanup trap to ensure symlinks are removed even on failure
cleanup() {
    if [ -L "$PHONE_TARGET_PROPS" ]; then
        rm "$PHONE_TARGET_PROPS"
    fi
    if [ -L "$WEAR_TARGET_PROPS" ]; then
        rm "$WEAR_TARGET_PROPS"
    fi
    echo -e "\n${BLUE}🧹 Cleaned up keystore symlinks${NC}"
}
trap cleanup EXIT

# Create release directory
RELEASE_DIR="release"
mkdir -p "$RELEASE_DIR"

# ───────────────────────────────────────────────────
# Phone App Build
# ───────────────────────────────────────────────────

echo -e "${MAGENTA}╔════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║     Building Phone App Release AAB...  ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════╝${NC}\n"

pnpm build:android

PHONE_BUILD_RESULT=$?

if [ $PHONE_BUILD_RESULT -ne 0 ]; then
    echo -e "\n${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║       Phone App Build Failed ❌        ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}\n"
    exit 1
fi

AAB_PATH=$(find apps/threshold/src-tauri/gen/android/app/build/outputs/bundle/universalRelease -name "*.aab" -type f 2>/dev/null | head -n1)

if [ -z "$AAB_PATH" ]; then
    echo -e "\n${RED}✗ Phone build completed but no AAB found${NC}"
    exit 1
fi

echo -e "\n${GREEN}✓ Phone app built successfully${NC}"

# Extract version from tauri.properties
TAURI_PROPS="apps/threshold/src-tauri/gen/android/app/tauri.properties"
if [ -f "$TAURI_PROPS" ]; then
    VERSION_NAME=$(grep "tauri.android.versionName" "$TAURI_PROPS" | cut -d'=' -f2)
    VERSION_CODE=$(grep "tauri.android.versionCode" "$TAURI_PROPS" | cut -d'=' -f2)
    PHONE_VERSION_SUFFIX="-v${VERSION_NAME}-${VERSION_CODE}"
else
    PHONE_VERSION_SUFFIX=""
fi

# Copy phone AAB
AAB_FILENAME=$(basename "$AAB_PATH" .aab)
cp "$AAB_PATH" "$RELEASE_DIR/${AAB_FILENAME}${PHONE_VERSION_SUFFIX}.aab"
PHONE_AAB_SIZE=$(du -h "$RELEASE_DIR/${AAB_FILENAME}${PHONE_VERSION_SUFFIX}.aab" | cut -f1)
echo -e "  📦 ${BLUE}$RELEASE_DIR/${AAB_FILENAME}${PHONE_VERSION_SUFFIX}.aab${NC} ($PHONE_AAB_SIZE)"

# Check for debug symbols
SYMBOLS_DIR=$(find apps/threshold/src-tauri/gen/android/app/build/intermediates/merged_native_libs/universalRelease -type d -name "lib" 2>/dev/null | head -n1)

if [ -n "$SYMBOLS_DIR" ] && [ -d "$SYMBOLS_DIR" ]; then
    SAMPLE_LIB=$(find "$SYMBOLS_DIR" -name "libthreshold.so" | head -n1)

    if [ -n "$SAMPLE_LIB" ] && file "$SAMPLE_LIB" | grep -q "not stripped"; then
        echo -e "${BLUE}🔍 Creating debug symbols zip...${NC}"

        REPO_ROOT=$(pwd)
        cd "$SYMBOLS_DIR"
        SYMBOLS_ZIP="native-debug-symbols.zip"
        zip -r -q "$SYMBOLS_ZIP" arm64-v8a/ armeabi-v7a/ x86/ x86_64/ 2>/dev/null || true

        if [ -f "$SYMBOLS_ZIP" ]; then
            SYMBOLS_SIZE=$(du -h "$SYMBOLS_ZIP" | cut -f1)
            cp "$SYMBOLS_ZIP" "$REPO_ROOT/$RELEASE_DIR/native-debug-symbols${PHONE_VERSION_SUFFIX}.zip"
            echo -e "  🐛 ${BLUE}$RELEASE_DIR/native-debug-symbols${PHONE_VERSION_SUFFIX}.zip${NC} ($SYMBOLS_SIZE)"
        fi
        cd - > /dev/null
    else
        echo -e "${YELLOW}⚠ Native libraries are stripped (no debug symbols)${NC}"
        echo "   To enable crash symbolication, add to apps/threshold/src-tauri/Cargo.toml:"
        echo "   [profile.release]"
        echo "   strip = false"
    fi
fi
echo ""

# ───────────────────────────────────────────────────
# Wear OS App Build
# ───────────────────────────────────────────────────

echo -e "${MAGENTA}╔════════════════════════════════════════╗${NC}"
echo -e "${MAGENTA}║     Building Wear OS Release AAB...    ║${NC}"
echo -e "${MAGENTA}╚════════════════════════════════════════╝${NC}\n"

"$WEAR_PROJECT/gradlew" --project-dir "$WEAR_PROJECT" bundleRelease

WEAR_BUILD_RESULT=$?

if [ $WEAR_BUILD_RESULT -ne 0 ]; then
    echo -e "\n${RED}╔════════════════════════════════════════╗${NC}"
    echo -e "${RED}║       Wear OS Build Failed ❌          ║${NC}"
    echo -e "${RED}╚════════════════════════════════════════╝${NC}\n"
    exit 1
fi

WEAR_AAB_PATH=$(find "$WEAR_PROJECT/build/outputs/bundle/release" -name "*.aab" -type f 2>/dev/null | head -n1)

if [ -z "$WEAR_AAB_PATH" ]; then
    echo -e "\n${RED}✗ Wear build completed but no AAB found${NC}"
    exit 1
fi

echo -e "\n${GREEN}✓ Wear OS app built successfully${NC}"

# Extract wear version from build.gradle.kts
WEAR_VERSION_NAME=$(grep "versionName" "$WEAR_PROJECT/build.gradle.kts" | head -n1 | sed 's/.*"\(.*\)".*/\1/')
WEAR_VERSION_CODE=$(grep "versionCode" "$WEAR_PROJECT/build.gradle.kts" | head -n1 | sed 's/[^0-9]//g')
if [ -n "$WEAR_VERSION_NAME" ] && [ -n "$WEAR_VERSION_CODE" ]; then
    WEAR_VERSION_SUFFIX="-v${WEAR_VERSION_NAME}-${WEAR_VERSION_CODE}"
else
    WEAR_VERSION_SUFFIX=""
fi

# Copy wear AAB
WEAR_AAB_FILENAME=$(basename "$WEAR_AAB_PATH" .aab)
cp "$WEAR_AAB_PATH" "$RELEASE_DIR/${WEAR_AAB_FILENAME}${WEAR_VERSION_SUFFIX}.aab"
WEAR_AAB_SIZE=$(du -h "$RELEASE_DIR/${WEAR_AAB_FILENAME}${WEAR_VERSION_SUFFIX}.aab" | cut -f1)
echo -e "  📦 ${BLUE}$RELEASE_DIR/${WEAR_AAB_FILENAME}${WEAR_VERSION_SUFFIX}.aab${NC} ($WEAR_AAB_SIZE)"

# Copy R8 mapping file for crash symbolication (ProGuard/R8 obfuscation map)
WEAR_MAPPING="$WEAR_PROJECT/build/outputs/mapping/release/mapping.txt"
if [ -f "$WEAR_MAPPING" ]; then
    cp "$WEAR_MAPPING" "$RELEASE_DIR/wear-mapping${WEAR_VERSION_SUFFIX}.txt"
    MAPPING_SIZE=$(du -h "$RELEASE_DIR/wear-mapping${WEAR_VERSION_SUFFIX}.txt" | cut -f1)
    echo -e "  🐛 ${BLUE}$RELEASE_DIR/wear-mapping${WEAR_VERSION_SUFFIX}.txt${NC} ($MAPPING_SIZE)"
else
    echo -e "${YELLOW}⚠ Wear R8 mapping.txt not found (crash reports will be obfuscated)${NC}"
fi
echo ""

# ───────────────────────────────────────────────────
# Summary
# ───────────────────────────────────────────────────

echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║     ✓ Release Build Successful! 🎉     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}\n"

# Verify signatures
echo -e "${BLUE}🔐 Verifying signatures...${NC}"
if command -v jarsigner &> /dev/null; then
    for aab in "$AAB_PATH" "$WEAR_AAB_PATH"; do
        APP_LABEL="Phone"
        if [ "$aab" = "$WEAR_AAB_PATH" ]; then APP_LABEL="Wear "; fi
        SIGNER=$(jarsigner -verify -verbose -certs "$aab" 2>&1 | grep "CN=" | head -n1 | sed 's/.*CN=/CN=/g')
        if [ -n "$SIGNER" ]; then
            echo -e "${GREEN}✓ $APP_LABEL signed by: $SIGNER${NC}"
        else
            echo -e "${YELLOW}⚠ $APP_LABEL could not verify signature (but build succeeded)${NC}"
        fi
    done
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
echo "   📱 Phone: release/${AAB_FILENAME}${PHONE_VERSION_SUFFIX}.aab"
echo "   ⌚ Wear:  release/${WEAR_AAB_FILENAME}${WEAR_VERSION_SUFFIX}.aab"

if [ -f "release/native-debug-symbols${PHONE_VERSION_SUFFIX}.zip" ]; then
    echo "   🐛 Phone symbols: release/native-debug-symbols${PHONE_VERSION_SUFFIX}.zip"
fi
if [ -f "release/wear-mapping${WEAR_VERSION_SUFFIX}.txt" ]; then
    echo "   🐛 Wear mapping:  release/wear-mapping${WEAR_VERSION_SUFFIX}.txt"
fi

echo ""
echo -e "${YELLOW}2.${NC} Before next build, run:"
echo "   pnpm version:release"
echo "   (interactive TUI for phone + wear version updates and tag validation)"
echo ""
echo -e "${GREEN}✨ Build complete! Happy releasing! ✨${NC}"
echo ""
