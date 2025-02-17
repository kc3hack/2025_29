import { Hono } from "hono";
import { zValidator } from '@hono/zod-validator'
import { createPrismaClient } from "./prisma";
import { analyzeSchema, refrigeratorDeltaSchema, refrigeratorSchema, registerSchema } from "./schema";
import { sign } from "hono/jwt";
import { auth } from "./auth";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { createS3Client, deleteImage, signedUrl, uploadImage } from "./s3";

const app = new Hono<{ Bindings: Env }>();

// ユーザー情報を登録する
app.post("/register", zValidator("json", registerSchema), async (c) => {
    const prisma = createPrismaClient(c);
    const body = c.req.valid("json");

    const user = await prisma.user.create({
        data: {
            name: body.userData.name,
            nameKana: body.userData.nameKana,
            cpuSerialNumber: body.deviceData.cpuSerialNumber,
        },
    });

    try {
        await prisma.$transaction([
            prisma.userBodyData.create({
                data: {
                    userId: user.id,
                    weight: body.userData.bodyData.weight,
                    height: body.userData.bodyData.height,
                    bodyFatPercentage: body.userData.bodyData.bodyFatPercentage,
                    bmi: body.userData.bodyData.BMI,
                    gender: body.userData.bodyData.gender !== 0 ? "MALE" : "FEMALE",
                },
            }),
            prisma.userLifecycle.create({
                data: {
                    userId: user.id,
                    wakeUpTime: body.userData.lifeCycle.wakeUpTime,
                    sleepTime: body.userData.lifeCycle.sleepTime,
                },
            }),
            prisma.userLikeFood.createMany({
                data: body.userData.likes.likeFoods.map((food) => ({
                    userId: user.id,
                    food: food,
                })),
            }),
            prisma.userLikeHobby.createMany({
                data: body.userData.likes.likeHobbies.map((hobby) => ({
                    userId: user.id,
                    hobby: hobby,
                })),
            }),
        ]);
    } catch {
        await prisma.user.delete({
            where: {
                id: user.id,
            },
        });

        return c.json({
            message: "Failed to register user",
        }, {
            status: 500,
        });
    }

    const token = await sign(
        {
            uid: user.id,
            jti: crypto.randomUUID(),
            nbf: Math.floor(Date.now() / 1000),
        },
        c.env.JWT_SECRET,
    );
    return c.json({
        userId: user.id,
        token: token,
    });
});

// 冷蔵庫の画像から食品一覧をOpenAI APIを使って取得する
app.post("/analyze", zValidator("json", analyzeSchema), async (c) => {
    const userId = await auth(c);
    if (!userId) {
        return c.json({
            message: "Unauthorized",
        }, {
            status: 401,
        });
    }

    const prisma = createPrismaClient(c);
    const body = c.req.valid("json");

    const client = new OpenAI({
        apiKey: c.env.OPENAI_API_KEY,
    });
    const s3 = createS3Client(c.env);

    try {
        const status = await prisma.userFridgeLastStatus.findFirst({
            where: {
                userId: userId,
            }
        });
        if (!status) {
            const id = await uploadImage(s3, prisma, userId, body.image);
            const url = await signedUrl(s3, id);
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
                return c.json(
                    {
                        message: "Failed to analyze image",
                    },
                    {
                        status: 500,
                    },
                );
            }

            const response = refrigeratorSchema.parse(
                JSON.parse(completion.choices[0].message.content),
            );

            await prisma.userFridgeLastStatus.create({
                data: {
                    userId: userId,
                    status: JSON.stringify(response),
                },
            });

            return c.json(response);
        }

        const lastImage = await prisma.userRefregiratorImage.findFirstOrThrow({
            where: {
                userId: userId
            },
        });
        await prisma.userRefregiratorImage.delete({
            where: {
                id: lastImage.id,
            },
        });
        const lastImageUrl = await signedUrl(s3, lastImage.id);
        const id = await uploadImage(s3, prisma, userId, body.image);
        const url = await signedUrl(s3, id);

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
                            image_url: {
                                url: lastImageUrl,
                            },
                            type: "image_url",
                        },
                        {
                            image_url: { url },
                            type: "image_url",
                        },
                        {
                            type: "text",
                            text: status.status,
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
        await deleteImage(s3, lastImage.id);
        if (!completion.choices[0].message.content) {
            return c.json(
                {
                    message: "Failed to analyze image",
                },
                {
                    status: 500,
                },
            );
        }

        console.log(completion.choices[0].message.content);
        const response = refrigeratorDeltaSchema.parse(
            JSON.parse(completion.choices[0].message.content),
        );

        // 差分から現在の状態を計算
        const lastStatus = (JSON.parse(status.status) as { foods: { name: string, calories: number }[] }).foods;
        let currentStatus = lastStatus.filter((food) => {
            return !response.remove.some((remove) => {
                return food.name === remove.name;
            });
        });
        currentStatus = currentStatus.concat(response.add);

        await prisma.userFridgeLastStatus.update({
            where: {
                id: status.id,
            },
            data: {
                status: JSON.stringify({
                    foods: currentStatus,
                }),
                date: new Date(Date.now()),
            },
        });
        await prisma.userCalorieIntake.createMany({
            data: response.remove.filter((x) => lastStatus.some((y) => x.name === y.name))
                .map((food) => ({
                    userId: userId,
                    food: food.name,
                    calorie: food.calories,
                    date: new Date(Date.now()),
                })),
        });

        return c.json({
            foods: currentStatus,
        });
    } catch (e) {
        console.log(e);
    }
});

export default app;