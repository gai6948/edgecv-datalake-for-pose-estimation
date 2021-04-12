#!/bin/bash
SAGEMAKER_BUCKET_NAME=<bucket_storing_your_model_artifacts>
GG_BUCKET_NAME=<bucket_to_store_greengrass_artifacts>
AWS_REGION=ap-northeast-1

VERSION=0.2.0

# Pi
aws s3 cp s3://$SAGEMAKER_BUCKET_NAME/edge-cv-datalake-demo/models/pose-estimator/compilation-output/posenet-mobile-rasp3b.tar.gz  s3://$GG_BUCKET_NAME/edge-cv-datalake-demo/artifacts/com.model.tflite.pose/$VERSION/pose-estimator-pi.tar.gz

# Nano
aws s3 cp s3://$SAGEMAKER_BUCKET_NAME/edge-cv-datalake-demo/models/pose-estimator/compilation-output/posenet-mobile-jetson_nano.tar.gz s3://$GG_BUCKET_NAME/edge-cv-datalake-demo/artifacts/com.model.tflite.pose/$VERSION/pose-estimator-nano.tar.gz

aws greengrassv2 create-component-version --inline-recipe fileb://edge-device/components/recipes/com.model.tflite.pose/$VERSION/com.model.tflite.pose.yaml --region $AWS_REGION
sleep 5

## Prepare template for Greengrass Component Deployment
mkdir -p edge-device/components/recipes/com.model.tflite.pose/$VERSION
sed "s/<version>/$VERSION/g" edge-device/components/recipes/com.model.tflite.pose/com.model.tflite.pose.yaml > edge-device/components/recipes/com.model.tflite.pose/$VERSION/com.model.tflite.pose.yaml
aws greengrassv2 create-component-version --inline-recipe fileb://edge-device/components/recipes/com.model.tflite.pose/$VERSION/com.model.tflite.pose.yaml --region $AWS_REGION
rm -rf edge-device/components/recipes/com.model.tflite.pose/$VERSION

jq --arg ver $VERSION '.components["com.model.tflite.pose"]["componentVersion"] = $ver' edge-device/deployment/previous-deployment/nano/deployment.json > edge-device/deployment/nano/deployment.json
aws greengrassv2 create-deployment --deployment-name 'Deployment for Jetson Nano' --region ap-northeast-1 \
  --cli-input-json file://edge-device/deployment/nano/deployment.json
mv edge-device/deployment/nano/deployment.json edge-device/deployment/previous-deployment/nano/deployment.json

jq --arg ver $VERSION '.components["com.model.tflite.pose"]["componentVersion"] = $ver' edge-device/deployment/previous-deployment/pi/deployment.json > edge-device/deployment/pi/deployment.json
aws greengrassv2 create-deployment --deployment-name 'Deployment for Raspberry Pi' --region ap-northeast-1 \
  --cli-input-json file://edge-device/deployment/pi/deployment.json
mv edge-device/deployment/pi/deployment.json edge-device/deployment/previous-deployment/pi/deployment.json
