#!/bin/sh

MODDIR=${0%/*}
KPNDIR="/data/adb/kp-next"
PATH="$MODDIR/bin:$PATH"
CONFIG="$KPNDIR/package_config"
REHOOK="$(cat $KPNDIR/rehook)"

if [ -z "$(kpatch hello)" ]; then
    touch "$MODDIR/unresolved"
    exit 0
fi

for kpm in $KPNDIR/kpm/*.kpm; do
    [ -s "$kpm" ] || continue
    kpatch kpm load "$kpm" || rm -f "$kpm"
done

[ -n "$REHOOK" ] && [ "$REHOOK" -ge 0 ] && [ "$REHOOK" -le 2 ] && kpatch rehook $REHOOK

until [ "$(getprop sys.boot_completed)" = "1" ]; do
    sleep 1
done

[ -f "$CONFIG" ] || exit 0

tail -n +2 "$CONFIG" | while IFS=, read -r pkg exclude allow uid; do
    if [ "$exclude" = "1" ]; then
        # priotize uid if exists
        UID=$(grep "^$pkg $uid" /data/system/packages.list | cut -d' ' -f2)
        # fallback to package name based
        [ -z "$UID" ] && UID=$(grep "^$pkg " /data/system/packages.list | cut -d' ' -f2)
        [ -n "$UID" ] && kpatch exclude_set "$UID" 1
    fi
done
