import { Hono } from "hono";
import { zValidator } from '@hono/zod-validator'
import type { Bindings } from "./bindings";
import { createPrismaClient } from "./prisma";
import { registerSchema } from "./schema";

const app = new Hono<{ Bindings: Bindings }>();
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
        userId: user.id
    });
});

export default app;