import { z } from "zod";

export const registerSchema = z.object({
    userData: z.object({
        name: z.string(),
        nameKana: z.string(),
        bodyData: z.object({
            age: z.number(),
            weight: z.number(),
            height: z.number(),
            bodyFatPercentage: z.number(),
            gender: z.number(),
        }),
        lifeCycle: z.object({
            wakeUpTime: z.string()
                .transform((v) => {
                    const a = v.split(":");
                    const h = Number.parseInt(a[0]);
                    const m = Number.parseInt(a[1]);
                    return new Date(0, 0, 0, h, m).toISOString();
                }),
            sleepTime: z.string()
                .transform((v) => {
                    const a = v.split(":");
                    const h = Number.parseInt(a[0]);
                    const m = Number.parseInt(a[1]);
                    return new Date(0, 0, 0, h, m).toISOString();
                }),
        }),
        likes: z.object({
            likeFoods: z.array(z.string()),
            likeHobbies: z.array(z.string()),
        }),
    }),
    deviceData: z.object({
        cpuSerialNumber: z.string(),
    }),
});
