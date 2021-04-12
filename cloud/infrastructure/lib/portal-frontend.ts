import * as cdk from "@aws-cdk/core";
import * as cognito from "@aws-cdk/aws-cognito";
import * as lambda from "@aws-cdk/aws-lambda";
import * as nodejsLambda from "@aws-cdk/aws-lambda-nodejs";
import * as apigw from "@aws-cdk/aws-apigateway";
import { SPADeploy } from "cdk-spa-deploy";

export interface PortalFrontendProps {
  userPool: cognito.UserPool;
  appClient: cognito.UserPoolClient;
  identityPool: cognito.CfnIdentityPool;
  apiEndpoint: apigw.RestApi;
}

export class PortalFrontend extends cdk.Construct {
  constructor(scope: cdk.Construct, id: string, props: PortalFrontendProps) {
    super(scope, id);

    const portalfrontend = new SPADeploy(this, "PortalFrontend", {
      encryptBucket: true,
    }).createSiteWithCloudfront({
      indexDoc: "index.html",
      websiteFolder: "portal-build-output",
    });

    const setupLambda = new nodejsLambda.NodejsFunction(this, "SetupUILambda", {
      entry: "./src/lambda/setup-portal/index.js",
      handler: "handler",
      runtime: lambda.Runtime.NODEJS_12_X,
      timeout: cdk.Duration.minutes(10),
      environment: {
        COGNITO_IDENTITY_POOL: props.identityPool.ref,
        COGNITO_USERPOOL_ID: props.userPool.userPoolId,
        COGNITO_USERPOOLCLIENT_ID: props.appClient.userPoolClientId,
        API_ENDPOINT: props.apiEndpoint.url,
        REGION: cdk.Aws.REGION,
        FILE_BUCKET: portalfrontend.websiteBucket.bucketName,
      },
    });

    portalfrontend.websiteBucket.grantReadWrite(setupLambda);

    new cdk.CfnCustomResource(this, "SetupPortalCR", {
        serviceToken: setupLambda.functionArn,
      });  

    new cdk.CfnOutput(this, "PortalLink", {
      value: "https://" + portalfrontend.distribution.distributionDomainName,
      description: "URL of the portal",
    });
  }
}
