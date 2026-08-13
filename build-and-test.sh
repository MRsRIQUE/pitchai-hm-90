#!/bin/bash
echo "Running typecheck..."
npx tsc --noEmit
echo "Typecheck exit code: $?"
echo "Running build..."
npm run build
echo "Build exit code: $?"