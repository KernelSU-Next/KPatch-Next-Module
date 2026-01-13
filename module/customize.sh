MODDIR="/data/adb/modules/KPatch-Next"

# Conflict with APatch
if [ "$APATCH" ]; then
    abort "! APatch is unsupported"
fi

# We only support arm64
if [ "$ARCH" != "arm64" ]; then
    abort "! Only arm64 is supported"
fi

set_perm_recursive "$MODPATH/bin" 0 2000 0755 0755

mkdir -p /data/adb/kp-next

# try get package_config from APatch
if [ -f "/data/adb/ap/package_config" ] && [ ! -f "/data/adb/kp-next/package_config" ]; then
    cp "/data/adb/ap/package_config" /data/adb/kp-next/package_config
fi

# backup module.prop
cp "$MODPATH/module.prop" "$MODPATH/module.prop.bak"

# Hot update webui, patch scripts and binaries
rm -rf "$MODDIR/webroot"/* "$MODDIR/bin"/* "$MODDIR/patch"/*
cp -Lrf "$MODPATH/webroot"/* "$MODDIR/webroot"
cp -Lrf "$MODPATH/bin"/* "$MODDIR/bin"
cp -Lrf "$MODPATH/patch"/* "$MODDIR/patch"
