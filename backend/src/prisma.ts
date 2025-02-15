import type { Context } from "hono";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

export function createPrismaClient(c: Context<{ Bindings: Env }>) {
    const adapter = new PrismaD1(c.env.DB);
    return new PrismaClient({ adapter });
}