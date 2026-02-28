#!/bin/bash

# Script to batch convert remaining JS files to TS with proper imports

echo "Converting remaining JavaScript files to TypeScript..."

# Function to update import extensions in a file
update_imports() {
  local file="$1"
  # Update imports from .js to .js (keeping .js for ESM)
  # Update imports from '../workspace' to '../workspace.js'
  # Update imports from './services/OutputService' to './services/OutputService.js'
  sed -i '' \
    -e "s/from '\([^']*\)'/from '\1.js'/g" \
    -e "s/\.js\.js'/.js'/g" \
    -e "s/\.ts\.js'/.js'/g" \
    "$file"
}

# Convert ConfigManager
if [ -f "lib/config.js" ]; then
  echo "Converting ConfigManager..."
  mv lib/config.js lib/config.ts
  update_imports lib/config.ts
fi

# Convert WorkspaceManager
if [ -f "lib/workspace.js" ]; then
  echo "Converting WorkspaceManager..."
  mv lib/workspace.js lib/workspace.ts
  update_imports lib/workspace.ts
fi

# Convert ShadowManager
if [ -f "lib/shadow.js" ]; then
  echo "Converting ShadowManager..."
  mv lib/shadow.js lib/shadow.ts
  update_imports lib/shadow.ts
fi

# Convert git utility
if [ -f "lib/git.js" ]; then
  echo "Converting git utility..."
  mv lib/git.js lib/git.ts
  update_imports lib/git.ts
fi

# Convert command files
for cmd in new update remove list open; do
  if [ -f "lib/commands/${cmd}.js" ]; then
    echo "Converting ${cmd} command..."
    mv "lib/commands/${cmd}.js" "lib/commands/${cmd}.ts"
    update_imports "lib/commands/${cmd}.ts"
  fi
done

# Convert index.js
if [ -f "index.js" ]; then
  echo "Converting index.js..."
  mv index.js index.ts
  update_imports index.ts
fi

echo "Conversion complete! Files renamed to .ts with import paths updated."
echo "Manual review needed for:"
echo "  - Type annotations"
echo "  - Any type replacements"
echo "  - Interface implementations"
echo "  - Error handling types"