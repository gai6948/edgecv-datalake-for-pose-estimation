import * as cdk from "@aws-cdk/core";
import * as iam from "@aws-cdk/aws-iam";
import * as iot from "@aws-cdk/aws-iot";
import * as firehose from "@aws-cdk/aws-kinesisfirehose";
import * as s3 from "@aws-cdk/aws-s3";

import { GlueETLResources } from "./glue-etl";
import { PortalBackend } from "./portal-backend";
import { PortalFrontend } from "./portal-frontend";
import { RedshiftClusterResources } from "./redshift-cluster";

export class InfrastructureStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const redShiftCluster = new RedshiftClusterResources(this, "RedshiftClusterResources", {});


    const edgeCVDataLakeRawDataBucket = new s3.Bucket(
      this,
      "EdgeCVDataLakeRawDataBucket",
      {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
      }
    );

    const edgeCVDataLakeProcessedDataBucket = new s3.Bucket(
      this,
      "EdgeCVDataLakeProcessedDataBucket",
      {
        blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
        encryption: s3.BucketEncryption.S3_MANAGED,
      }
    );

    const glueETLResources = new GlueETLResources(this, "GlueETLResources", {
      sourceBucket: edgeCVDataLakeRawDataBucket,
      outputBucket: edgeCVDataLakeProcessedDataBucket,
      redshiftCluster: redShiftCluster.redshiftCluster,
      redshiftRole: redShiftCluster.redshiftRole,
      redshiftSG: redShiftCluster.redshiftSG,
      redshiftSubnet: redShiftCluster.redshiftSubnet,
      redshiftVPC: redShiftCluster.redshiftVPC,
    });

    const portalBackend = new PortalBackend(this, "PortalBackendResources", {});
    const portalFrontend = new PortalFrontend(this, "PortalFrontendResources", {
      userPool: portalBackend.userPool,
      identityPool: portalBackend.identityPool,
      appClient: portalBackend.appClient,
      apiEndpoint: portalBackend.apiEndpoint,
    });

    // Create an IAM role for Kinesis Firehose to write to S3
    const firehoseRole = new iam.Role(this, "FirehoseRole", {
      assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com"),
      description: "Allow Firehose to read from Kinesis Stream",
    });

    // Create an S3 bucket in case of failed delivery for Firehose
    const firehoseBackupBucket = new s3.Bucket(this, "FirehoseBackupBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    firehoseRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:GetObject",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject",
        ],
        resources: [
          firehoseBackupBucket.bucketArn,
          firehoseBackupBucket.bucketArn + "/*",
          edgeCVDataLakeRawDataBucket.bucketArn,
          edgeCVDataLakeRawDataBucket.bucketArn + "/*",
        ],
        sid: "AllowS3WriteToS3Bucket",
      })
    );

    firehoseRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "glue:GetTable",
          "glue:GetTableVersion",
          "glue:GetTableVersions",
        ],
        resources: [
          "arn:" +
            cdk.Aws.PARTITION +
            ":glue:" +
            cdk.Aws.REGION +
            ":" +
            cdk.Aws.ACCOUNT_ID +
            ":catalog",
          // edgeCVGlueRawDataTable.tableArn,
          glueETLResources.glueDatabase.databaseArn,
        ],
        sid: "AllowGlueCatalogRead",
      })
    );

    const deliveryStream = new firehose.CfnDeliveryStream(
      this,
      "EdgeCVRawDataDeliveryStream",
      {
        deliveryStreamType: "DirectPut",
        extendedS3DestinationConfiguration: {
          bucketArn: edgeCVDataLakeRawDataBucket.bucketArn,
          prefix:
            "firehose-delivered/year=!{timestamp:YYYY}/month=!{timestamp:MM}/day=!{timestamp:dd}/hour=!{timestamp:HH}/",
          roleArn: firehoseRole.roleArn,
          bufferingHints: {
            intervalInSeconds: 300,
            sizeInMBs: 64,
          },
          errorOutputPrefix: "firehose-error/",
          // dataFormatConversionConfiguration: {
          //   enabled: true,
          //   inputFormatConfiguration: {
          //     deserializer: {
          //       openXJsonSerDe: {
          //         columnToJsonKeyMappings: {
          //           ts: "timestamp",
          //         },
          //       },
          //     },
          //   },
          //   outputFormatConfiguration: {
          //     serializer: {
          //       parquetSerDe: {
          //         compression: "GZIP",
          //       },
          //     },
          //   },
          //   schemaConfiguration: {
          //     databaseName: edgeCVGlueRawDataTable.database.databaseName,
          //     tableName: edgeCVGlueRawDataTable.tableName,
          //     roleArn: firehoseRole.roleArn,
          //   },
          // },
          s3BackupConfiguration: {
            bucketArn: firehoseBackupBucket.bucketArn,
            roleArn: firehoseRole.roleArn,
          },
          s3BackupMode: "Enabled",
        },
      }
    );
    deliveryStream.node.addDependency(firehoseRole);

    // Setting up IAM role for AWS IoT Core
    const iotPolicy = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ["firehose:PutRecord"],
          resources: [deliveryStream.getAtt("Arn").toString()],
        }),
      ],
    });

    const iotRole = new iam.Role(this, "IoTRoleForEdgeCVDataLake", {
      assumedBy: new iam.ServicePrincipal("iot.amazonaws.com"),
      inlinePolicies: {
        firehosePut: iotPolicy,
      },
    });


    // Create the IoT Rules that send data to Firehose
    const rawPoseEventToFirehoseIoTRule = new iot.CfnTopicRule(
      this,
      "EdgeCVDataLakeIoTRulePoseToFirehose",
      {
        ruleName: "edge_cv_datalake_raw_pose_data_to_firehose",
        topicRulePayload: {
          ruleDisabled: false,
          awsIotSqlVersion: "2016-03-23",
          sql: "SELECT * FROM 'dt/camera/+/pose-estimator/result'",
          actions: [
            {
              firehose: {
                deliveryStreamName: deliveryStream.ref,
                roleArn: iotRole.roleArn,
                separator: "\n",
              },
            },
          ],
        },
      }
    );
    
  }
}
