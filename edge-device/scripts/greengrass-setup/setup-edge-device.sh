## on-device
curl -o ~/iot-certs/AmazonRootCA1.pem https://www.amazontrust.com/repository/AmazonRootCA1.pem
sudo mkdir -p /greengrass/v2
sudo cp -R ~/iot-certs/* /greengrass/v2

curl -s https://d2s8p88vqu9w66.cloudfront.net/releases/greengrass-nucleus-latest.zip > greengrass-nucleus-latest.zip
unzip greengrass-nucleus-latest.zip -d GreengrassCoreV2 && rm greengrass-nucleus-latest.zip
cd GreengrassCoreV2
sudo -E java -Droot="/greengrass/v2" -Dlog.store=FILE \
  -jar ./lib/Greengrass.jar \
  --init-config ./config.yaml \
  --component-default-user ggc_user:ggc_group \
  --setup-system-service true \
  --deploy-dev-tools true

