#!/bin/bash

# Alias to backup the .gemini folder to the current workspace
# Usage: backup-gemini
alias backup-gemini='tar -cv -I "gzip -9" -f /workspaces/tauri-mobile-test/gemini-backup.tar.gz -C /home/vscode .gemini'

# Alias to restore the .gemini folder from the current workspace
# Usage: restore-gemini
alias restore-gemini='tar -xzvf /workspaces/tauri-mobile-test/gemini-backup.tar.gz -C /home/vscode'

echo "Gemini backup/restore aliases loaded!"
echo "Use 'backup-gemini' to save your settings."
echo "Use 'restore-gemini' to restore them."
