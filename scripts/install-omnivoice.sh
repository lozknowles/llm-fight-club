#!/usr/bin/env bash
set -euo pipefail
runtime_root="${OMNIVOICE_RUNTIME_ROOT:-/fast/work/omnivoice-runtime}"
source_ref="${OMNIVOICE_SOURCE_REF:-08be0b4ccbac3e13e374e86fbfead4b4cac343e2}"
mkdir -p "$runtime_root"
if [[ ! -d "$runtime_root/source/.git" ]]; then git clone https://github.com/k2-fsa/OmniVoice.git "$runtime_root/source"; fi
git -C "$runtime_root/source" fetch --depth=1 origin "$source_ref"
git -C "$runtime_root/source" checkout --detach FETCH_HEAD
python3 -m venv "$runtime_root/venv"
"$runtime_root/venv/bin/python" -m pip install --upgrade pip
"$runtime_root/venv/bin/pip" install "$runtime_root/source"
echo "OmniVoice installed at $runtime_root from $source_ref"
