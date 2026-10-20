#!/bin/bash
# SoundWalk Free listing (com.soundwalk.recorder.free). See build_release.sh.
exec "$(dirname "$0")/build_release.sh" free "$@"
