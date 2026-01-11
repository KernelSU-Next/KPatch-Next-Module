#!/bin/bash

if [[ $1 == "clean" ]]; then
    rm -rf out module/bin module/webroot
    exit 0
fi

mkdir -p out module/bin module/webroot

# Build WebUI
cd webui
npm run build || npm install && npm run build
cd ..

download_bin() {
    local suffix="$1"
    local target="$2"
    local url=$(echo "$RELEASE_JSON" | jq -r ".assets[] | select(.name | endswith(\"$suffix\")) | .browser_download_url")
    
    echo "Downloading $target from $url"
    curl -L "$url" -o "module/bin/$target"
}

# Fetch KPatch-Next binaries
if [[ ! -f "module/bin/kpatch" || ! -f "module/bin/kpimg" || ! -f "module/bin/kptools" ]]; then
    URL="https://api.github.com/repos/KernelSU-Next/KPatch-Next/releases"
    RELEASE_JSON=$(curl -s "$URL" | jq '.[0]')

    download_bin "kpatch-android" "kpatch"
    download_bin "kpimg-linux" "kpimg"
    download_bin "kptools-android" "kptools"
fi

# Fetch magiskboot
if [[ ! -f "module/bin/magiskboot" ]]; then
    URL="https://api.github.com/repos/topjohnwu/Magisk/releases"
    RELEASE_JSON=$(curl -s "$URL" | jq '.[0]')
    download_bin "Magisk*.apk" "magiskboot"
fi

# zip module
commit_number=$(git rev-list --count HEAD)
commit_hash=$(git rev-parse --short HEAD)

cd module
zip -r ../out/KPatch-Next-${commit_number}-${commit_hash}.zip .
cd ..
