#!/usr/bin/env bash
# Explicitly approved: add only one localhost destination for user loz.
set -euo pipefail
test "$(hostname)" = hpubuntu
test "${1:-}" = --approved
root=/fast/work/llm-fight-club-voice-lab-20260912
target=/etc/ssh/sshd_config.d/49-loz-local-forwarding.conf
backup=/var/backups/49-loz-local-forwarding.before-voice-lab-20260912.conf
cmp -s "$target" "$root/deploy/voice-lab-ssh-before.conf" || { echo 'SSH policy changed; refusing to overwrite'; exit 1; }
sudo -n /usr/sbin/sshd -t
test ! -e "$backup" || { echo 'Existing backup found; inspect before another change'; exit 1; }
sudo -n cp --preserve=mode,ownership,timestamps "$target" "$backup"
sudo -n install -o root -g root -m 0644 "$root/deploy/voice-lab-ssh-forwarding.conf" "$target"
if ! sudo -n /usr/sbin/sshd -t; then
  sudo -n cp --preserve=mode,ownership,timestamps "$backup" "$target"
  echo 'Validation failed; original policy restored without reload'
  exit 1
fi
effective=$(sudo -n /usr/sbin/sshd -T -C user=loz,addr=100.101.176.25,host=msi)
if ! grep -qx 'permitopen 127.0.0.1:4173 127.0.0.1:8766 127.0.0.1:18891' <<< "$effective"; then
  sudo -n cp --preserve=mode,ownership,timestamps "$backup" "$target"
  echo 'Effective destination list differed; original policy restored'
  exit 1
fi
sudo -n systemctl reload ssh
printf '%s\n' "$effective" | grep -E '^(port|allowtcpforwarding|permitopen) '
echo 'SSH reloaded, not restarted; existing destinations preserved'
