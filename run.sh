#!/bin/bash
# launchd entrypoint for the tweet scheduler.
cd /Users/bogdan/Desktop/bgd0x
exec /opt/homebrew/bin/node --env-file=.env scheduler.mjs
