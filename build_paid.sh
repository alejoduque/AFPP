#!/bin/bash
# SoundWalk paid listing (com.soundwalk.recorder). See build_release.sh.
exec "$(dirname "$0")/build_release.sh" paid "$@"
