import { Auth } from "aws-amplify";
import S3 from "aws-sdk/clients/s3";

const settings = window.portalSettings || {};

const FRAME_BUCKET = settings.frameBucketName;

export const initialize = async () => {
  const credentials = await Auth.currentCredentials();
  const s3 = new S3({
    apiVersion: "latest",
    region: "us-west-2",
    credentials: Auth.essentialCredentials(credentials),
    params: {
      Bucket: FRAME_BUCKET,
    },
  });
  console.log("Created S3 client");
  return s3;
};

export const fetchImage = async (s3, s3key) => {
  try {
    const data = await s3
      .getObject({
        Bucket: FRAME_BUCKET,
        Key: s3key,
      })
      .promise();
    return data.Body;
  } catch (err) {
    console.error("Cannot get image from S3: ", err);
  }
};
