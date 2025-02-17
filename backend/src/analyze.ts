import type { S3Client } from "@aws-sdk/client-s3";
import { deleteImage, signedUrl, uploadImage } from "./s3";
import type { Prisma, PrismaClient, UserFridgeLastStatus } from "@prisma/client";
import type OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import { refrigeratorDeltaSchema, refrigeratorSchema } from "./schema";
import { HTTPException } from "hono/http-exception";

async function askFridge(client: OpenAI, url: string) {
    try {
        const completion = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content:
                        "ユーザーから冷蔵庫の画像が与えれれますので、冷蔵庫に入っている食品を __なるべく詳細に__ 解析してください。食品名はは日本語にして、なるべく簡潔にして返してください。",
                },
                {
                    role: "user",
                    content: [
                        {
                            image_url: { url },
                            type: "image_url",
                        },
                    ],
                },
            ],
            response_format: zodResponseFormat(
                refrigeratorSchema,
                "foods",
            ),
            seed: 0,
        });
        if (!completion.choices[0].message.content) {
            throw new Error("Content is empty");
        }

        return completion.choices[0].message.content;
    } catch (ex) {
        console.error(ex);
        throw new HTTPException(500, {
            message: "Failed to analyze image",
        });
    }
}

export async function analyzeImageFirstTime({
    s3, prisma, client, userId, image
}: {
    s3: S3Client;
    prisma: PrismaClient;
    client: OpenAI;
    userId: string;
    image: string;
}) {
    let id: string | undefined;
    try {
        id = await uploadImage(s3, prisma, userId, image);
        const url = await signedUrl(s3, id);
        const content = await askFridge(client, url);
        const response = refrigeratorSchema.parse(JSON.parse(content));

        await prisma.userFridgeLastStatus.create({
            data: {
                userId: userId,
                status: JSON.stringify(response),
            },
        });

        return response;
    } catch (ex) {
        if (id) {
            await prisma.userRefregiratorImage.deleteMany({
                where: {
                    id,
                },
            });
            await deleteImage(s3, id);
        }

        throw ex;
    }
}

async function askFridgeDelta(client: OpenAI, url1: string, url2: string, status: string) {
    try {
        const completion = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content:
                        `ユーザーから二つの冷蔵庫の画像と一つ目の画像の食品のリストが与えられます。
                        この二つの画像を比べて、食品の差分を返してください。
                        食品の名前などは与えられたリストを参考にしてください。`,
                },
                {
                    role: "user",
                    content: [
                        {
                            image_url: { url: url1 },
                            type: "image_url",
                        },
                        {
                            image_url: { url: url2 },
                            type: "image_url",
                        },
                        {
                            type: "text",
                            text: status,
                        }
                    ],
                },
            ],
            response_format: zodResponseFormat(
                refrigeratorDeltaSchema,
                "foods",
            ),
            seed: 0,
        });
        if (!completion.choices[0].message.content) {
            throw new Error("Content is empty");
        }

        return completion.choices[0].message.content;
    } catch (ex) {
        console.error(ex);
        throw new HTTPException(500, {
            message: "Failed to analyze image",
        });
    }
}

export async function analyzeImageDelta({
    s3, prisma, client, userId, image, status
}: {
    s3: S3Client;
    prisma: PrismaClient;
    client: OpenAI;
    userId: string;
    image: string;
    status: UserFridgeLastStatus;
}) {
    let delImageId: string | undefined;
    try {
        const lastImage = await prisma.userRefregiratorImage.findFirstOrThrow({
            where: {
                userId: userId
            },
        });
        const lastImageUrl = await signedUrl(s3, lastImage.id);
        const id = await uploadImage(s3, prisma, userId, image);
        const url = await signedUrl(s3, id);
        // 最終的に処理が完了するまで、新しい画像を削除するようにする
        // 処理が完了したら、古い画像を削除する
        delImageId = id;

        const content = await askFridgeDelta(client, lastImageUrl, url, status.status);

        const response = refrigeratorDeltaSchema.parse(JSON.parse(content));

        // 差分から現在の状態を計算
        const lastStatus = (JSON.parse(status.status) as { foods: { name: string, calories: number }[] }).foods;
        let currentStatus = lastStatus.filter((food) => {
            return !response.remove.some((remove) => {
                return food.name === remove.name;
            });
        });
        currentStatus = currentStatus.concat(response.add);

        await prisma.$transaction([
            prisma.userFridgeLastStatus.update({
                where: {
                    id: status.id,
                },
                data: {
                    status: JSON.stringify({
                        foods: currentStatus,
                    }),
                    date: new Date(Date.now()),
                },
            }),
            prisma.userCalorieIntake.createMany({
                data: response.remove
                    .filter((x) => lastStatus.some((y) => x.name === y.name))
                    .map((food) => ({
                        userId: userId,
                        food: food.name,
                        calorie: food.calories,
                        date: new Date(Date.now()),
                    })),
            }),
        ]);
        delImageId = lastImage.id;

        return {
            foods: currentStatus,
        };
    } finally {
        if (delImageId) {
            await deleteImage(s3, delImageId);
            await prisma.userRefregiratorImage.deleteMany({
                where: {
                    id: delImageId,
                },
            });
        }

    }
}
