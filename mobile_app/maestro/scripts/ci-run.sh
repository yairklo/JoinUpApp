#!/usr/bin/env bash
# Runs the Maestro suite on the CI emulator and always leaves screenshot + logcat behind for the artifact.
mkdir -p maestro/.reports
adb shell getprop ro.build.version.sdk > maestro/.reports/sdk.txt
node maestro/scripts/run.mjs --tags "${1:-smoke}"
rc=$?
adb exec-out screencap -p > maestro/.reports/final-screen.png 2>/dev/null
adb logcat -d -t 4000 > maestro/.reports/logcat.txt 2>/dev/null
exit $rc
