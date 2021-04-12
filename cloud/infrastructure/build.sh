#!/bin/bash
# Build Portal first
mkdir portal-build-output
cd src/portal
npm i
npm run build
cp -R build/ ../../portal-build-output/
rm -rf build
rm -rf node_modules
cd ../..
# Deploy CDK app
npm i
npx cdk deploy --require-approval never
