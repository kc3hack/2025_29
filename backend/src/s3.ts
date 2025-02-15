import { S3Client } from "@aws-sdk/client-s3";

export function createS3Client(env: Env) {
    return new S3Client({
        region: "auto",
        endpoint: `https://${env.ACCOUNT_ID}.r2.cloudflarestorage.com/diet-support-bucket`,
        credentials: {
            accessKeyId: env.ACCESS_KEY_ID,
            secretAccessKey: env.SECRET_ACCESS_KEY,
        },
    });
}
