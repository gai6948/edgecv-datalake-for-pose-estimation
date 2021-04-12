#!/bin/bash
GG_BUCKET_NAME=<bucket_to_store_greengrass_artifacts>
AWS_REGION=ap-northeast-1

VERSION=0.38.0

# Prepare for Jetson Nano
# cd src/edge/pose-estimator/nano
cd edge-device/components/src/aws.edgecv.datalake.demo.poseEstimator/nano
zip -r ../poseEstimator-package.zip ./*
aws s3 cp ../poseEstimator-package.zip s3://$GG_BUCKET_NAME/edge-cv-datalake-demo/artifacts/aws.edgecv.datalake.demo.poseEstimator/$VERSION/nano/poseEstimator-package.zip
rm ../poseEstimator-package.zip
cd ../../../../..

# Prepare for Raspberry Pi
# cd src/edge/pose-estimator/pi
cd edge-device/components/src/aws.edgecv.datalake.demo.poseEstimator/pi
zip -r ../poseEstimator-package.zip ./*
aws s3 cp ../poseEstimator-package.zip s3://$GG_BUCKET_NAME/edge-cv-datalake-demo/artifacts/aws.edgecv.datalake.demo.poseEstimator/$VERSION/pi/poseEstimator-package.zip
rm ../poseEstimator-package.zip
cd ../../../../..

## Prepare template for Greengrass Component Deployment
mkdir -p edge-device/components/recipes/aws.edgecv.datalake.demo.poseEstimator/$VERSION
sed "s/<version>/$VERSION/g" edge-device/components/recipes/aws.edgecv.datalake.demo.poseEstimator/aws.edgecv.datalake.demo.poseEstimator.yaml > edge-device/components/recipes/aws.edgecv.datalake.demo.poseEstimator/$VERSION/aws.edgecv.datalake.demo.poseEstimator.yaml
aws greengrassv2 create-component-version --inline-recipe fileb://edge-device/components/recipes/aws.edgecv.datalake.demo.poseEstimator/$VERSION/aws.edgecv.datalake.demo.poseEstimator.yaml --region $AWS_REGION
rm -rf edge-device/components/recipes/aws.edgecv.datalake.demo.poseEstimator/$VERSION

jq --arg ver $VERSION '.components["aws.edgecv.datalake.demo.poseEstimator"]["componentVersion"] = $ver' edge-device/deployment/previous-deployment/nano/deployment.json > edge-device/deployment/nano/deployment.json
aws greengrassv2 create-deployment --deployment-name 'Deployment for Jetson Nano' --region $AWS_REGION \
  --cli-input-json file://edge-device/deployment/nano/deployment.json
mv edge-device/deployment/nano/deployment.json edge-device/deployment/previous-deployment/nano/deployment.json

jq --arg ver $VERSION '.components["aws.edgecv.datalake.demo.poseEstimator"]["componentVersion"] = $ver' edge-device/deployment/previous-deployment/pi/deployment.json > edge-device/deployment/pi/deployment.json
aws greengrassv2 create-deployment --deployment-name 'Deployment for Raspberry Pi' --region $AWS_REGION \
  --cli-input-json file://edge-device/deployment/pi/deployment.json
mv edge-device/deployment/pi/deployment.json edge-device/deployment/previous-deployment/pi/deployment.json
