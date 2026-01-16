#!/system/bin/sh
#######################################################################################
# APatch Boot Image Patcher
# Imported from https://github.com/bmax121/APatch/blob/main/app/src/main/assets/boot_patch.sh
#######################################################################################
#
# Usage: boot_patch.sh <superkey> <bootimage> [ARGS_PASS_TO_KPTOOLS]
#
# This script should be placed in a directory with the following files:
#
# File name          Type          Description
#
# boot_patch.sh      script        A script to patch boot image for APatch.
#                  (this file)      The script will use files in its same
#                                  directory to complete the patching process.
# bootimg            binary        The target boot image
# kpimg              binary        KernelPatch core Image
# kptools            executable    The KernelPatch tools binary to inject kpimg to kernel Image
# magiskboot         executable    Magisk tool to unpack boot.img.
#
#######################################################################################

MODPATH=${0%/*}
ARCH=$(getprop ro.product.cpu.abi)

# Load utility functions
. "$MODPATH/util_functions.sh"

BOOTIMAGE=$1
FLASH_TO_DEVICE=$2
shift 2

[ -e "$BOOTIMAGE" ] || { >&2 echo "! $BOOTIMAGE does not exist"; exit 1; }

# Check for dependencies
command -v magiskboot >/dev/null 2>&1 || { >&2 echo "! Command magiskboot not found"; exit 1; }
command -v kptools >/dev/null 2>&1 || { >&2 echo "! Command kptools not found"; exit 1; }

if [ ! -f kernel ]; then
echo "- Unpacking boot image"
magiskboot unpack "$BOOTIMAGE" >/dev/null 2>&1
  if [ $? -ne 0 ]; then
    >&2 echo "! Unpack error: $?"
    exit 1
  fi
fi

if [ ! $(kptools -i kernel -f | grep CONFIG_KALLSYMS=y) ]; then
	echo "! Patcher has Aborted."
	echo "! APatch requires CONFIG_KALLSYMS to be Enabled."
	echo "! But your kernel seems NOT enabled it."
	exit 1
fi

if [  $(kptools -i kernel -l | grep patched=false) ]; then
	echo "- Backing boot.img "
  cp "$BOOTIMAGE" "ori.img" >/dev/null 2>&1
fi

mv kernel kernel.ori

echo "- Patching kernel"

set -x
kptools -p -i kernel.ori -k kpimg -o kernel "$@"
patch_rc=$?
set +x

if [ $patch_rc -ne 0 ]; then
  >&2 echo "! Patch kernel error: $patch_rc"
  exit 1
fi

echo "- Repacking boot image"
magiskboot repack "$BOOTIMAGE" >/dev/null 2>&1

if [ ! $(kptools -i kernel.ori -f | grep CONFIG_KALLSYMS_ALL=y) ]; then
	echo "! Detected CONFIG_KALLSYMS_ALL is not set!"
	echo "! APatch has patched but maybe your device won't boot."
	echo "! Make sure you have original boot image backup."
fi

if [ $? -ne 0 ]; then
  >&2 echo "! Repack error: $?"
  exit 1
fi

if [ "$FLASH_TO_DEVICE" = "true" ]; then
  # flash
  if [ -b "$BOOTIMAGE" ] || [ -c "$BOOTIMAGE" ] && [ -f "new-boot.img" ]; then
    echo "- Flashing new boot image"
    flash_image new-boot.img "$BOOTIMAGE"
    if [ $? -ne 0 ]; then
      >&2 echo "! Flash error: $?"
      save_image_to_storage "new-boot.img"
      exit 1
    fi
  fi

  echo "- Successfully Flashed!"
else
  save_image_to_storage "new-boot.img"
  echo "- Successfully Patched!"
fi

