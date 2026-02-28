#!/bin/bash

echo "Fixing import paths in TypeScript files..."

# Fix all .ts files
find . -name "*.ts" -type f | while read -r file; do
  echo "Fixing $file"
  
  # Fix incorrect .js.js extensions
  sed -i '' "s/\.js\.js'/.js'/g" "$file"
  
  # Fix module imports that have incorrect extensions
  sed -i '' "s/from 'fs\/promises\.js'/from 'fs\/promises'/g" "$file"
  sed -i '' "s/from 'path\.js'/from 'path'/g" "$file"
  sed -i '' "s/from 'chalk\.js'/from 'chalk'/g" "$file"
  sed -i '' "s/from 'commander\.js'/from 'commander'/g" "$file"
  sed -i '' "s/from 'child_process\.js'/from 'child_process'/g" "$file"
  sed -i '' "s/from 'util\.js'/from 'util'/g" "$file"
  sed -i '' "s/from 'url\.js'/from 'url'/g" "$file"
  sed -i '' "s/from 'module\.js'/from 'module'/g" "$file"
  
  # Fix local imports - ensure they have .js extension
  sed -i '' "s/from '\.\(\/[^']*\)'$/from '.\1.js'/g" "$file"
  sed -i '' "s/from '\.\.\(\/[^']*\)'$/from '..\1.js'/g" "$file"
  
  # Fix double .js.js that might have been created
  sed -i '' "s/\.js\.js'/.js'/g" "$file"
  
  # Fix imports that already have .ts extension - change to .js
  sed -i '' "s/\.ts'/\.js'/g" "$file"
done

echo "Import paths fixed!"