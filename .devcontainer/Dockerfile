FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# Set Timezone to America/Toronto
ENV TZ="America/Toronto"
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# Install Tauri system dependencies and build tools
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    build-essential \
    curl \
    wget \
    file \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libwebkit2gtk-4.1-dev \
    patchelf \
    xdg-utils \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-bad \
    fonts-noto-color-emoji \
    pkg-config \
    unzip \
    xvfb \
    vim\
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Android build dependencies
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
    && apt-get -y install --no-install-recommends \
    openjdk-17-jdk \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Node.js 20.x
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm

# Switch to non-root user 'vscode' (provided by base image)
USER vscode
ENV HOME=/home/vscode
ENV EDITOR=vim

# Configure pnpm global bin path
ENV PNPM_HOME=$HOME/.local/share/pnpm

# Configure Rust paths
ENV RUSTUP_HOME=$HOME/.rustup
ENV CARGO_HOME=$HOME/.cargo

# Set JAVA_HOME for Android builds
ENV JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

# Configure Android SDK paths
ENV ANDROID_HOME=$HOME/Android/Sdk
ENV ANDROID_SDK_ROOT=$ANDROID_HOME

# Update PATH to include pnpm, cargo, Java, and Android tools
ENV PATH=$PNPM_HOME:$CARGO_HOME/bin:$JAVA_HOME/bin:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/36.0.0:$PATH

# Install Android SDK Command Line Tools
RUN mkdir -p $ANDROID_HOME/cmdline-tools && \
    cd $ANDROID_HOME/cmdline-tools && \
    wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip && \
    unzip -q commandlinetools-linux-11076708_latest.zip && \
    rm commandlinetools-linux-11076708_latest.zip && \
    mv cmdline-tools latest

# Accept Android SDK licenses and install required SDK components for building
# Using --channel=0 for parallel downloads (faster installation)
RUN yes | sdkmanager --licenses && \
    sdkmanager --channel=0 --install \
    "platform-tools" \
    "platforms;android-36" \
    "build-tools;36.0.0" \
    "ndk;28.2.13676358"

# Install Rust toolchain (stable)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable \
    && rustup component add clippy rustfmt

# Install experimental Tauri CLI for portable AppImage builds
RUN cargo install tauri-cli \
    --git https://github.com/tauri-apps/tauri \
    --branch feat/truly-portable-appimage \
    --force

# Default to portable AppImage format to avoid EGL issues on modern distros
ENV TAURI_BUNDLER_NEW_APPIMAGE_FORMAT=true

# Create pnpm home directory to ensure permissions are correct
RUN mkdir -p $PNPM_HOME
