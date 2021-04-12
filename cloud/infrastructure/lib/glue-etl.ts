import * as cdk from "@aws-cdk/core";
import * as s3deploy from "@aws-cdk/aws-s3-deployment";
import * as glue from "@aws-cdk/aws-glue";
import * as iam from "@aws-cdk/aws-iam";
import * as s3 from "@aws-cdk/aws-s3";
import * as ec2 from '@aws-cdk/aws-ec2';
import * as redshift from '@aws-cdk/aws-redshift';

import crawlerConfig from "../src/glue/crawler-config.json";

export interface GlueETLResourcesProps {
  sourceBucket: s3.Bucket;
  outputBucket: s3.Bucket;
  redshiftVPC?: ec2.Vpc;
  redshiftSubnet?: ec2.ISubnet;
  redshiftSG?: ec2.SecurityGroup;
  redshiftCluster?: redshift.Cluster;
  redshiftRole?: iam.Role;
}

export class GlueETLResources extends cdk.Construct {
  public glueDatabase: glue.Database;
  // public glueProcessedEventTable: glue.Table;
  public glueCrawlerRole: iam.Role;

  constructor(scope: cdk.Construct, id: string, props: GlueETLResourcesProps) {
    super(scope, id);

    // IAM Role for Glue Crawlers
    this.glueCrawlerRole = new iam.Role(this, "GlueRawDataCrawlerRole", {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      description: "Role used by Glue to crawl raw S3 data",
    });

    props.sourceBucket.grantReadWrite(this.glueCrawlerRole);
    props.outputBucket.grantReadWrite(this.glueCrawlerRole);
    this.glueCrawlerRole.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSGlueServiceRole"
      )
    );
    this.glueCrawlerRole.addToPolicy(
      new iam.PolicyStatement({
        resources: [
          "arn:aws:logs:" +
            cdk.Aws.REGION +
            ":" +
            cdk.Aws.ACCOUNT_ID +
            ":log-group:/*",
        ],
        actions: [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ],
      })
    );

    // Create Glue Database and Table for Firehose format conversion and Athena queries
    this.glueDatabase = new glue.Database(this, "EdgeCVGlueDatabase", {
      databaseName: "edgecv-datalake-demo-glue-database",
    });

    // const edgeCVGlueRawDataTable = new glue.Table(
    //   this,
    //   "EdgeCVRawDataGlueTable",
    //   {
    //     database: edgeCVGlueDatabase,
    //     tableName: "edgecv-datalake-demo-glue-raw-data-table",
    //     dataFormat: glue.DataFormat.PARQUET,
    //     columns: [
    //       {
    //         name: "msg_id",
    //         type: glue.Schema.STRING,
    //         comment: "Unique ID of the message",
    //       },
    //       {
    //         name: "ts",
    //         type: glue.Schema.TIMESTAMP,
    //         comment: "Event Timestamp",
    //       },
    //       {
    //         name: "ppl_count",
    //         type: glue.Schema.INTEGER,
    //         comment: "Number of people detected",
    //       },
    //       {
    //         name: "detection_result",
    //         type: glue.Schema.struct([
    //           {
    //             name: "bbox",
    //             type: glue.Schema.STRING,
    //           },
    //           {
    //             name: "class",
    //             type: glue.Schema.DOUBLE,
    //           },
    //           {
    //             name: "confidence",
    //             type: glue.Schema.DOUBLE,
    //           },
    //         ]),
    //         comment:
    //           "A struct of detection result containing detected class, bounding box and confidence score",
    //       },
    //       // {
    //       //   name: "detection_result",
    //       //   type: glue.Schema.array(
    //       //     glue.Schema.map(glue.Schema.STRING, glue.Schema.FLOAT)
    //       //   ),
    //       //   comment:
    //       //     "A map of detection result containing detected class, bounding box and confidence score",
    //       // },
    //     ],
    //     partitionKeys: [
    //       {
    //         name: "year",
    //         type: glue.Schema.INTEGER,
    //       },
    //       {
    //         name: "month",
    //         type: glue.Schema.INTEGER,
    //       },
    //       {
    //         name: "day",
    //         type: glue.Schema.INTEGER,
    //       },
    //       {
    //         name: "hour",
    //         type: glue.Schema.INTEGER,
    //       },
    //     ],
    //     bucket: props.sourceBucket,
    //     compressed: true,
    //     s3Prefix: "firehose-delivered",
    //     storedAsSubDirectories: false,
    //   }
    // );

    const glueCrawler = new glue.CfnCrawler(
      this,
      "EdgeCV-RawCVDataGlueCrawler",
      {
        name: "edgecv-datalake-raw-cv-data-glue-crawler",
        databaseName: this.glueDatabase.databaseName,
        role: this.glueCrawlerRole.roleArn,
        targets: {
          s3Targets: [
            {
              path:
                "s3://" +
                props.sourceBucket.bucketName +
                "/firehose-delivered/",
            },
          ],
        },
        configuration: `{
        "Version": 1.0,
        "Grouping": {
          "TableGroupingPolicy": "CombineCompatibleSchemas"
        }
      }`,
        schemaChangePolicy: {
          deleteBehavior: "LOG",
        },
        schedule: {
          scheduleExpression: "cron(0 * * * ? *)",
        },
      }
    );

    // S3 Bucket to store ETL scripts
    const etlScriptsBucket = new s3.Bucket(this, "ETLScriptsBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // Create Glue job for ETL from raw event bucket to output bucket
    const uploadETLScript = new s3deploy.BucketDeployment(
      this,
      "UploadETLScript",
      {
        destinationBucket: etlScriptsBucket,
        sources: [
          s3deploy.Source.asset("src/glue", {
          }),
        ],
        destinationKeyPrefix: "etl-scripts/",
      }
    );

    const glueETLJobRole = new iam.Role(this, "GlueETLJobRole", {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      managedPolicies: [
        {
          managedPolicyArn:
            "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole",
        },
      ],
      inlinePolicies: {
        "etl-job-permission": new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                "s3:ListBucket",
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
              ],
              resources: [
                etlScriptsBucket.bucketArn,
                etlScriptsBucket.bucketArn + "/*",
                props.sourceBucket.bucketArn,
                props.sourceBucket.bucketArn + "/*",
                props.outputBucket.bucketArn,
                props.outputBucket.bucketArn + "/*",
              ],
            }),
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["glue:*"],
              resources: [
                "arn:" +
                  cdk.Aws.PARTITION +
                  ":glue:" +
                  cdk.Aws.REGION +
                  ":" +
                  cdk.Aws.ACCOUNT_ID +
                  ":catalog",
                "arn:" +
                  cdk.Aws.PARTITION +
                  ":glue:" +
                  cdk.Aws.REGION +
                  ":" +
                  cdk.Aws.ACCOUNT_ID +
                  ":table/" +
                  this.glueDatabase.databaseName +
                  "/*",
                this.glueDatabase.databaseArn,
              ],
            }),
          ],
        }),
      },
    });

    const glueJobToAthena = new glue.CfnJob(this, "PoseDataToAthena", {
      glueVersion: "1.0",
      timeout: 30,
      command: {
        name: "glueetl",
        pythonVersion: "3",
        scriptLocation:
          "s3://" +
          etlScriptsBucket.bucketName +
          "/etl-scripts/pose-for-athena.py",
      },
      role: glueETLJobRole.roleArn,
      defaultArguments: {
        "--enable-metrics": "true",
        "--enable-continuous-cloudwatch-log": "true",
        "--enable-glue-datacatalog": "true",
        "--database_name": this.glueDatabase.databaseName,
        "--raw_pose_data_table": "firehose_delivered",
        "--processed_pose_data_table": "pose_processed",
        "--output_bucket": "s3://" + props.outputBucket.bucketName + "/",
        "--processed_data_prefix": "output",
        "--glue_tmp_prefix": "tmp",
        "--job-bookmark-option": "job-bookmark-enable",
        "--TempDir": "s3://" + props.outputBucket.bucketName + "/tmp",
      },
      maxRetries: 0,
    });

    const glueJobToAthenaTrigger = new glue.CfnTrigger(this, "GluePoseAthenaETLJobTrigger", {
      type: "SCHEDULED",
      schedule: "cron(0 * * * ? *)",
      startOnCreation:true,
      actions: [
        {
          jobName: glueJobToAthena.ref,
        },
      ],
    });

    if (props.redshiftVPC && props.redshiftSubnet && props.redshiftSG && props.redshiftCluster) {
      const redshiftConnection = new glue.Connection(this, "RedshiftConection", {
        type: glue.ConnectionType.JDBC,
        securityGroups: [props.redshiftSG],
        subnet: props.redshiftSubnet,
        properties: {
          JDBC_CONNECTION_URL: "jdbc:redshift://".concat(props.redshiftCluster.clusterEndpoint.hostname, ":5439/default_db"),
          USERNAME: props.redshiftCluster.secret?.secretValueFromJson("username").toString() as string,
          PASSWORD: props.redshiftCluster.secret?.secretValueFromJson("password").toString() as string,
        },
      });

      const glueJobToRedshift = new glue.CfnJob(this, "PoseDataToRedshift", {
        glueVersion: "1.0",
        timeout: 300,
        command: {
          name: "glueetl",
          pythonVersion: "3",
          scriptLocation:
            "s3://" +
            etlScriptsBucket.bucketName +
            "/etl-scripts/pose-to-redshift.py",
        },
        role: glueETLJobRole.roleArn,
        connections: {
          connections: [
            redshiftConnection.connectionName
          ]
        },
        defaultArguments: {
          "--enable-metrics": "true",
          "--enable-continuous-cloudwatch-log": "true",
          "--enable-glue-datacatalog": "true",
          "--database_name": this.glueDatabase.databaseName,
          "--raw_pose_data_table": "firehose_delivered",
          "--redshift_conn": redshiftConnection.connectionName,
          "--redshift_role": props.redshiftRole?.roleArn,
          "--job-bookmark-option": "job-bookmark-enable",
          "--TempDir": "s3://" + props.outputBucket.bucketName + "/redshift-tmp",
        },
        maxRetries: 0,
      });
  
      const glueJobToRedshiftTrigger = new glue.CfnTrigger(this, "GluePoseRedshiftETLJobTrigger", {
        type: "SCHEDULED",
        schedule: "cron(0 0 * * ? *)",
        startOnCreation:true,
        actions: [
          {
            jobName: glueJobToRedshift.ref,
          },
        ],
      });

    }

  }
}
