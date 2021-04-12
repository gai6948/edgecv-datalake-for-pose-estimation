const {
  COGNITO_IDENTITY_POOL,
  COGNITO_USERPOOL_ID,
  COGNITO_USERPOOLCLIENT_ID,
  FILE_BUCKET,
  REGION,
  API_ENDPOINT,
} = process.env;

const CONFIG_FILENAME = "settings.js";

const ACL = "private";

module.exports = (s3) => {
  const deleteFile = (params) => s3.deleteObject(params).promise();
  const listFiles = (params) => s3.listObjects(params).promise();

  return {
    removeFiles: () =>
      listFiles({
        Bucket: FILE_BUCKET,
      }).then((result) =>
        Promise.all(
          result.Contents.map((file) => file.Key).map((file) =>
            deleteFile({
              Bucket: FILE_BUCKET,
              Key: file,
            })
          )
        )
      ),
    writeSettings: () =>
      s3
        .putObject({
          ACL,
          Bucket: FILE_BUCKET,
          Key: CONFIG_FILENAME,
          ContentType: "text/javascript",
          Body: `window.portalSettings = ${JSON.stringify({
            identityPoolId: COGNITO_IDENTITY_POOL,
            userPoolId: COGNITO_USERPOOL_ID,
            userPoolWebClientId: COGNITO_USERPOOLCLIENT_ID,
            region: REGION,
            apiEndpoint: API_ENDPOINT,
          })};`,
        })
        .promise(),
  };
};
