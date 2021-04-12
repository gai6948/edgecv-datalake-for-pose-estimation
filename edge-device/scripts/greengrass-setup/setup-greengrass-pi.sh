#!/bin/bash
THING_NAME=Raspberry-Pi-Demo
export GG_BUCKET_NAME=gai-ggv2-deployment-bucket-ap-northeast-1
IOT_THING_ARN=$(aws iot create-thing --region ap-northeast-1 --thing-name $THING_NAME | jq -r '.thingArn')
certs_folder=ggv2-certs/pi
mkdir -p $certs_folder
CERT_ARN=$(aws iot create-keys-and-certificate --region ap-northeast-1 --set-as-active --certificate-pem-outfile $certs_folder/device.pem.crt --public-key-outfile $certs_folder/public.pem.key --private-key-outfile $certs_folder/private.pem.key | jq -r '.certificateArn')
aws iot attach-thing-principal --region ap-northeast-1 --thing-name $THING_NAME \
    --principal $CERT_ARN
THING_GROUP_NAME=GGv2RaspberryPiGroup
THING_GROUP_ARN=$(aws iot create-thing-group --region ap-northeast-1 --thing-group-name $THING_GROUP_NAME | jq -r '.thingGroupArn')
aws iot add-thing-to-thing-group --region ap-northeast-1 --thing-name $THING_NAME --thing-group-name $THING_GROUP_NAME
POLICY_NAME=GGv2RaspberryPiIoTThingPolicy
aws iot create-policy --region ap-northeast-1 --policy-name $POLICY_NAME --policy-document file://ggv2-iot-policy.json
aws iot attach-policy --region ap-northeast-1 --policy-name $POLICY_NAME --target $THING_GROUP_ARN
aws iot attach-policy --region ap-northeast-1 --policy-name $POLICY_NAME --target $CERT_ARN
export IOT_DATA_ENDPOINT=$(aws iot describe-endpoint --region ap-northeast-1 --endpoint-type iot:Data-ATS | jq -r '.endpointAddress')
export IOT_CRED_ENDPOINT=$(aws iot describe-endpoint --region ap-northeast-1 --endpoint-type iot:CredentialProvider | jq -r '.endpointAddress')
GG_TES_ROLE_NAME=GGv2RaspberryPiTokenExchangeRole
GG_TES_ROLE_ARN=$(aws iam create-role --region ap-northeast-1 --role-name $GG_TES_ROLE_NAME --assume-role-policy-document file://device-role-trust-policy.json | jq -r '.Role.Arn')

# Set up greengrass deployment bucket and required permissions as well
aws s3 mb s3://$GG_BUCKET_NAME
sed -i.bak "s|<gg_deployment_bucket_arn>|arn:aws:s3:::$GG_BUCKET_NAME/*|" device-role-access-policy.json

GG_TES_POLICY_ARN=$(aws iam create-policy --policy-name GGv2RaspberryPiTokenExchangeRoleAccess --policy-document file://device-role-access-policy.json | jq -r '.Policy.Arn')
aws iam attach-role-policy --role-name $GG_TES_ROLE_NAME --policy-arn $GG_TES_POLICY_ARN
GG_TES_ROLE_ALIAS_ARN=$(aws iot create-role-alias --region ap-northeast-1 --role-alias GGv2RaspberryPiTokenExchangeRoleAlias --role-arn $GG_TES_ROLE_ARN | jq -r '.roleAliasArn')
GG_TES_POLICY_NAME=GGv2RaspberryPiTokenExchangeRoleAliasPolicy
sed -i.bak "s|<gg_role_alias_arn>|$GG_TES_ROLE_ALIAS_ARN|" greengrass-v2-iot-role-alias-policy.json
aws iot create-policy --region ap-northeast-1 --policy-name $GG_TES_POLICY_NAME --policy-document file://greengrass-v2-iot-role-alias-policy.json
aws iot attach-policy --region ap-northeast-1 --policy-name $GG_TES_POLICY_NAME --target $CERT_ARN

sed -i.bak "s|<ggv2_thing_name>|$THING_NAME|" $certs_folder/config.yaml && \
 sed -i.bak "s|<ggv2_role_alias>|GGv2RaspberryPiTokenExchangeRoleAlias|" $certs_folder/config.yaml && \
 sed -i.bak "s|<iot_data_endpoint>|$IOT_DATA_ENDPOINT|" $certs_folder/config.yaml && \
 sed -i.bak "s|<iot_cred_endpoint>|$IOT_CRED_ENDPOINT|" $certs_folder/config.yaml