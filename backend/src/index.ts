import { Hono } from "hono";
import { zValidator } from '@hono/zod-validator'
import { createPrismaClient } from "./prisma";
import { analyzeSchema, refrigeratorSchema, registerSchema } from "./schema";
import { sign } from "hono/jwt";
import { auth } from "./auth";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { createS3Client } from "./s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

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
    // body.imageをbase64 decodeし、r2に保存する
    // signed urlを取得して、OpenAIに送信する

    const decoded = await fetch(`data:text/plain;charset=UTF-8;base64,${body.image}`)
        .then(response => response.arrayBuffer());

    const { id } = await prisma.userRefregiratorImage.create({
        data: {
            userId: userId
        }
    });
    const s3 = createS3Client(c.env);
    await s3.send(new PutObjectCommand({
        Bucket: "diet-support-bucket",
        Key: `${id}.jpg`,
        Body: new Uint8Array(decoded),
        ServerSideEncryption: "AES256",
    }));

    const signedUrl = await getSignedUrl(
        s3,
        new GetObjectCommand({ Bucket: "diet-support-bucket", Key: `${id}.jpg` }),
        { expiresIn: 3600 }
    );

    const client = new OpenAI({
        apiKey: c.env.OPENAI_API_KEY,
    });

    try {
        const completion = await client.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: "ユーザーから冷蔵庫の画像が与えれれますので、冷蔵庫に入っている食品を解析してください。食品名はは日本語で返してください。",
                },
                {
                    role: "user",
                    content: [
                        {
                            image_url: { url: signedUrl },
                            type: "image_url",
                        }
                    ]
                },
            ],
            response_format: zodResponseFormat(refrigeratorSchema, "foods"),
        });
        if (!completion.choices[0].message.content) {
            return c.json({
                message: "Failed to analyze image",
            }, {
                status: 500,
            });
        }

        const response = refrigeratorSchema.parse(JSON.parse(completion.choices[0].message.content));

        return c.json(response);
    } catch (e) {
        console.log(e);
    } finally {
        await s3.send(new DeleteObjectCommand({
            Bucket: "diet-support-bucket",
            Key: `${id}.jpg`,
        }));
    }
});

export default app;