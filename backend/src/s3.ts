import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PrismaClient } from "@prisma/client";

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

export async function uploadImage(s3: S3Client, prisma: PrismaClient, userId: string, base64: string) {
    const buffer = Buffer.from(base64, "base64");
    const { id } = await prisma.userRefregiratorImage.create({
        data: {
            userId,
        },
    });
    await s3.send(new PutObjectCommand({
        Bucket: "diet-support-bucket",
        Key: id,
        Body: buffer,
        ServerSideEncryption: "AES256",
    }));
    return id;
}

export async function signedUrl(s3: S3Client, key: string) {
    return await getSignedUrl(s3, new GetObjectCommand({
        Bucket: "diet-support-bucket",
        Key: key,
    }));
}

export async function deleteImage(s3: S3Client, key: string) {
    try {
        await s3.send(new DeleteObjectCommand({
            Bucket: "diet-support-bucket",
            Key: key,
        }));
        return true;
    } catch {
        return false;
    }
}