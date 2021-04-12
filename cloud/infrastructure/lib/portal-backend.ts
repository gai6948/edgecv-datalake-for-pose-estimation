import * as cdk from "@aws-cdk/core";
import * as cognito from "@aws-cdk/aws-cognito";
import * as iam from "@aws-cdk/aws-iam";
import * as lambda from "@aws-cdk/aws-lambda";
import * as apigw from "@aws-cdk/aws-apigateway";

import lambdaQSPolicy from "../src/iam/qs-authN-dashboard-policy.json";

export interface PortalBackendProps {}

export class PortalBackend extends cdk.Construct {
  public userPool: cognito.UserPool;
  public appClient: cognito.UserPoolClient;
  public identityPool: cognito.CfnIdentityPool;
  public cognitoAuthRole: iam.Role;
  public apiEndpoint: apigw.RestApi;

  constructor(scope: cdk.Construct, id: string, props: PortalBackendProps) {
    super(scope, id);

    // Cognito user pool for API access control
    const cognitoUserPool = new cognito.UserPool(
      this,
      "VideoAnalyticsUserPool",
      {
        autoVerify: {
          email: true,
          phone: false,
        },
        selfSignUpEnabled: true,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }
    );
    this.userPool = cognitoUserPool;

    const portalAppClient = cognitoUserPool.addClient("portalAppClient");
    this.appClient = portalAppClient;

    const cognitoIdentityPool = new cognito.CfnIdentityPool(
      this,
      "EdgeCVPortalIdentityPool",
      {
        allowUnauthenticatedIdentities: true,
        cognitoIdentityProviders: [
          {
            clientId: portalAppClient.userPoolClientId,
            providerName: cognitoUserPool.userPoolProviderName,
          },
        ],
      }
    );
    this.identityPool = cognitoIdentityPool;

    const authRole = new iam.Role(this, "CognitoAuthRole", {
      assumedBy: new iam.WebIdentityPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": cognitoIdentityPool.ref,
          },
          "ForAnyValue:StringEquals": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        }
      ),
      description: "Role assumed by authenticated users",
    });

    const unAuthRole = new iam.Role(this, "CognitoUnAuthRole", {
      assumedBy: new iam.WebIdentityPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": cognitoIdentityPool.ref,
          },
          "ForAnyValue:StringEquals": {
            "cognito-identity.amazonaws.com:amr": "unauthenticated",
          },
        }
      ),
      description: "Role assumed by unauthenticated users",
    });

    authRole.node.addDependency(cognitoIdentityPool);
    this.cognitoAuthRole = authRole;

    authRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "kinesisvideo:GetDASHStreamingSessionURL",
          "kinesisvideo:GetHLSStreamingSessionURL",
          "kinesisvideo:GetDataEndpoint",
        ],
        resources: ["*"],
      })
    );

    const cognitoRoleMapping = new cognito.CfnIdentityPoolRoleAttachment(
      this,
      "EdgeCVPortalIdentityRoleMapping",
      {
        identityPoolId: cognitoIdentityPool.ref,
        roleMappings: {
          cognito: {
            identityProvider: "cognito-idp.ap-northeast-1.amazonaws.com/".concat(
              cognitoUserPool.userPoolId,
              ":",
              portalAppClient.userPoolClientId
            ),
            ambiguousRoleResolution: "AuthenticatedRole",
            type: "Token",
          },
        },
        roles: {
          authenticated: authRole.roleArn,
          unauthenticated: unAuthRole.roleArn,
        },
      }
    );

    const lambdaQuickSightPolicy = iam.PolicyDocument.fromJson(lambdaQSPolicy);

    const lambdaQuickSightHandler = new lambda.Function(
      this,
      "qsLambdaHandler",
      {
        code: lambda.Code.fromAsset("src/lambda/quicksight-handler"),
        handler: "index.lambda_handler",
        runtime: lambda.Runtime.PYTHON_3_8,
        environment: {
          DashboardIdList:
            "b4d0411f-e4e6-4a43-bad4-11d302dbb77c",
          DashboardNameList: "pose-redshift",
          DashboardRegion: "ap-northeast-1",
        },
        timeout: cdk.Duration.seconds(30),
      }
    );

    lambdaQuickSightHandler.role?.attachInlinePolicy(
      new iam.Policy(this, "edgeCVQSEmbedDemo", {
        document: lambdaQuickSightPolicy,
      })
    );

    const api = new apigw.RestApi(this, 'EdgeCVQuickSightEmbedDemoAPI', {
    });
    this.apiEndpoint = api;

    // const apiAuth = new apigw.CognitoUserPoolsAuthorizer(
    //   this,
    //   "qsDashboardAPIAuth",
    //   {
    //     cognitoUserPools: [cognitoUserPool],
    //   }
    // );

    const anoEmbedSampleResource = api.root.addResource("embed-dashboard-link");
    const qsLambdaIntegration = new apigw.LambdaIntegration(lambdaQuickSightHandler);
    anoEmbedSampleResource.addMethod("GET", qsLambdaIntegration);
    addCorsOptions(anoEmbedSampleResource);


    new cdk.CfnOutput(this, "DashboardUserPoolId", {
      value: cognitoUserPool.userPoolId,
    });

    new cdk.CfnOutput(this, "DashboardIdentityPoolId", {
      value: cognitoIdentityPool.ref,
    });

    new cdk.CfnOutput(this, "DashboardAppClient", {
      value: portalAppClient.userPoolClientId,
    });
  }
}

export function addCorsOptions(apiResource: apigw.IResource) {
  apiResource.addMethod('OPTIONS', new apigw.MockIntegration({
    integrationResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': "'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent'",
        'method.response.header.Access-Control-Allow-Origin': "'*'",
        'method.response.header.Access-Control-Allow-Credentials': "'false'",
        'method.response.header.Access-Control-Allow-Methods': "'OPTIONS,GET,PUT,POST,DELETE'",
      },
    }],
    passthroughBehavior: apigw.PassthroughBehavior.NEVER,
    requestTemplates: {
      "application/json": "{\"statusCode\": 200}"
    },
  }), {
    methodResponses: [{
      statusCode: '200',
      responseParameters: {
        'method.response.header.Access-Control-Allow-Headers': true,
        'method.response.header.Access-Control-Allow-Methods': true,
        'method.response.header.Access-Control-Allow-Credentials': true,
        'method.response.header.Access-Control-Allow-Origin': true,
      },  
    }]
  })
}