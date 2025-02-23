import { Hono } from "hono";
import { zValidator } from '@hono/zod-validator'
import { createPrismaClient } from "./prisma";
import { analyzeSchema, refrigeratorDeltaSchema, refrigeratorSchema, registerSchema } from "./schema";
import { sign } from "hono/jwt";
import { auth } from "./auth";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { createS3Client, deleteImage, signedUrl, uploadImage } from "./s3";
import { S3Client } from "@aws-sdk/client-s3";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";
import { DefaultArgs } from "@prisma/client/runtime/library";
import { HTTPException } from "hono/http-exception";
import { analyzeImageDelta, analyzeImageFirstTime } from "./analyze";

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

    const status = await prisma.userFridgeLastStatus.findFirst({
        where: {
            userId: userId,
        }
    });
    if (!status) {
        const response = await analyzeImageFirstTime({
            s3,
            prisma,
            client,
            userId,
            image: body.image
        });
        return c.json(response);
    }
    const response = await analyzeImageDelta({
        s3,
        prisma,
        client,
        userId,
        image: body.image,
        status,
    });
    return c.json(response);
});

app.get("/calorie-intakes", async (c) => {
    const userId = await auth(c);
    if (!userId) {
        return c.json({
            message: "Unauthorized",
        }, {
            status: 401,
        });
    }

    const prisma = createPrismaClient(c);
    const calorieIntakes = await prisma.userCalorieIntake.findMany({
        where: {
            id: userId,
        },
    });

    return c.json(calorieIntakes.map((calorieIntake) => ({
        date: calorieIntake.date,
        calorie: calorieIntake.calorie,
        food: calorieIntake.food,
    })));
});

app.onError((err, c) => {
    if (err instanceof HTTPException) {
        return err.getResponse()
    }

    return c.json({
        message: "Internal Server Error",
    }, {
        status: 500,
    });
});

export default app;

