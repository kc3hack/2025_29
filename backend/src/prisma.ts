import type { Context } from "hono";
import type { Bindings } from "./bindings";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

export function createPrismaClient(c: Context<{ Bindings: Bindings }>) {
    const adapter = new PrismaD1(c.env.DB);
    return new PrismaClient({ adapter });
}