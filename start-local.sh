#!/usr/bin/env bash

set -euo pipefail

PORT="${PORT:-4173}"

exec python3 -m http.server "$PORT" --bind 127.0.0.1
