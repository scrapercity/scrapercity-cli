#!/bin/bash
# scripts/publish-python.sh - builds the Python SDK (python/) at the package.json version and uploads
# it to PyPI. Runs on the box before every npm publish (and again from prepublishOnly, where it finds
# the version already on PyPI and skips), so npm and PyPI always ship the same tool list.
#
#   bash scripts/publish-python.sh            build, test, upload (skips if PyPI already has it)
#   bash scripts/publish-python.sh --check    build and test only, upload nothing
#
# The PyPI token lives in ~/.pypirc on the box (chmod 600, outside the repo); it never asks for it.
# Builds happen in a temp folder, never in the repo, and the tools live in ~/.scrapercity-pyrelease.
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-upload}"
V=$(node -p "require('./package.json').version")
PYV=$(sed -n 's/^VERSION = "\(.*\)"$/\1/p' python/scrapercity/_catalog.py)
say() { echo "[pypi] $*"; }
[ "$V" = "$PYV" ] || { say "STOP: python/scrapercity/_catalog.py is $PYV but package.json is $V (run npm run generate)"; exit 1; }

if [ "$MODE" != "--check" ]; then
  CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://pypi.org/pypi/scrapercity/$V/json" || true)
  if [ "$CODE" = "200" ]; then say "scrapercity $V is already on PyPI, nothing to upload"; exit 0; fi
  [ -s "$HOME/.pypirc" ] || { say "STOP: no PyPI token in ~/.pypirc on this box"; exit 1; }
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# The release tools live in their own Python environment. Ubuntu's python3 often ships without
# ensurepip (python3-venv not installed), so when a normal venv can't be made, make one without pip
# and install pip into it from pip's own wheel on PyPI. Nothing is installed system-wide.
VENV="$HOME/.scrapercity-pyrelease"
if [ ! -x "$VENV/bin/pip" ]; then
  rm -rf "$VENV"
  if ! python3 -m venv "$VENV" > "$WORK/venv.log" 2>&1; then
    rm -rf "$VENV"
    say "python3 has no ensurepip here; making the environment without it"
    python3 -m venv --without-pip "$VENV" || { say "STOP: python3 -m venv --without-pip failed"; exit 1; }
    # pip's own wheel from PyPI runs as a program: it installs itself into the new environment.
    PIPURL=$(curl -fsSL https://pypi.org/pypi/pip/json | python3 -c 'import json,sys; print(next(u["url"] for u in json.load(sys.stdin)["urls"] if u["filename"].endswith("-py3-none-any.whl")))') \
      && PIPWHL="$WORK/${PIPURL##*/}" && curl -fsSL "$PIPURL" -o "$PIPWHL" || { say "STOP: could not download pip from PyPI"; exit 1; }
    "$VENV/bin/python" "$PIPWHL/pip" install -q --no-index "$PIPWHL" || { say "STOP: installing pip into the environment failed"; exit 1; }
  fi
fi
"$VENV/bin/python" -m pip install -q --upgrade pip build twine
cp -r python "$WORK/src"
say "testing the SDK"
(cd "$WORK/src" && "$VENV/bin/python" -I -W ignore -m unittest discover -s tests -q)
say "building $V"
"$VENV/bin/python" -m build -q --outdir "$WORK/dist" "$WORK/src" > "$WORK/build.log" 2>&1 || { cat "$WORK/build.log"; say "STOP: build failed"; exit 1; }
"$VENV/bin/twine" check --strict "$WORK"/dist/*
ls "$WORK/dist" | grep -qx "scrapercity-$V-py3-none-any.whl" || { say "STOP: wheel for $V not built"; ls "$WORK/dist"; exit 1; }

if [ "$MODE" = "--check" ]; then say "check OK: scrapercity $V builds and passes (nothing uploaded)"; exit 0; fi
"$VENV/bin/twine" upload --non-interactive --skip-existing --disable-progress-bar "$WORK"/dist/*
say "+ scrapercity==$V"
