1. Run the notebook `cloud/sagemaker/prepare-pose-models.ipynb`

2. Copy packaged models to an S3 bucket for greengrass deployment
   ```
   export SAGEMAKER_BUCKET=sagemaker-ap-northeast-1-949970762186
   export GG_BUCKET=gai-ggv2-deployment-bucket-ap-northeast-1
   export PROJECT_NAME=edge-cv-pose-datalake-demo

   aws s3 cp s3://$SAGEMAKER_BUCKET/$PROJECT_NAME/packaging-output/detector-model-packaged-1.0.tar.gz s3://$GG_BUCKET/$PROJECT_NAME/artifacts/com.model.mxnet_gluoncv.yolo3/0.1.0/detector-model-packaged-1.0.tar.gz
   
   aws s3 cp s3://$SAGEMAKER_BUCKET/$PROJECT_NAME/packaging-output/pose-estimator-model-packaged-1.0.tar.gz s3://$GG_BUCKET/$PROJECT_NAME/artifacts/com.model.mxnet_gluoncv.pose/0.1.0/pose-estimator-model-packaged-1.0.tar.gz
   ```
