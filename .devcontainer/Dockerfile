FROM ghcr.io/liminal-hq/tauri-dev-mobile:latest

# Ensure pnpm resolves via corepack to the exact packageManager-pinned version
# in package.json, regardless of whichever pnpm the shared image ships globally.
USER root
RUN corepack enable
USER vscode
