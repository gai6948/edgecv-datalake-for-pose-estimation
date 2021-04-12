import json
import boto3
import os
import re


def lambda_handler(event, context):
    # Get AWS Account Id
    awsAccountId = context.invoked_function_arn.split(':')[4]

    # Read in the environment variables
    dashboardIdList = re.sub(' ', '', os.environ['DashboardIdList']).split(',')
    dashboardNameList = os.environ['DashboardNameList'].split(',')
    dashboardRegion = os.environ['DashboardRegion']

    response = getQuickSightDashboardUrl(
        awsAccountId, dashboardIdList, dashboardRegion)

    # Return response from get-dashboard-embed-url call.
    # Access-Control-Allow-Origin doesn't come into play in this sample as origin is the API Gateway url itself.
    # When using the static mode wherein initial static HTML is loaded from a different domain, this header becomes relevant.
    # You can change to the specific origin domain from * to secure further.
    return {'statusCode': 200,
            'headers': {
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Credentials" : True,
                "Content-Type": "application/json"
            },
            'body': json.dumps(response)
            }


def getQuickSightDashboardUrl(awsAccountId, dashboardIdList, dashboardRegion):
    # Create QuickSight client
    quickSight = boto3.client('quicksight', region_name=dashboardRegion)

    # Generate Anonymous Embed url
    response = quickSight.get_dashboard_embed_url(
        AwsAccountId=awsAccountId,
        Namespace='default',
        DashboardId=dashboardIdList[0],
        IdentityType='ANONYMOUS',
        SessionLifetimeInMinutes=120,
        UndoRedoDisabled=True,
        ResetDisabled=True
    )
    return response
