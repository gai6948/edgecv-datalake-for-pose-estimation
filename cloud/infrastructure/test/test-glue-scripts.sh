export AWS_REGION=ap-northeast-1
gluesparksubmit src/glue/pose-for-athena.py --JOB_NAME test-pose-etl \
    --enable-metrics true --enable-glue-datacatalog true \
    --database_name edgecv-datalake-demo-glue-database \
    --raw_pose_data_table firehose_delivered \
    --processed_pose_data_table pose_processed \
    --output_bucket s3://edgecvdatalakestack-edgecvdatalakeprocesseddatabu-1sdxcnw8kyz2g/ \
    --processed_data_prefix output \
    --glue_tmp_prefix tmp \
    --TempDir s3://edgecvdatalakestack-edgecvdatalakeprocesseddatabu-1sdxcnw8kyz2g/tmp

gluesparksubmit src/glue/pose-to-redshift.py --JOB_NAME test-pose-etl \
    --enable-metrics true --enable-glue-datacatalog true \
    --database_name edgecv-datalake-demo-glue-database \
    --raw_pose_data_table firehose_delivered \
    --redshift_conn GlueETLResourcesRedshiftCon-j5LC2CUKSBpH \
    --redshift_role arn:aws:iam::949970762186:role/EdgeCVDatalakeStack-RedshiftClusterResourcesRedshi-DZWP5X8S9UCF \
    --TempDir s3://edgecvdatalakestack-edgecvdatalakeprocesseddatabu-1sdxcnw8kyz2g/redshift-tmp