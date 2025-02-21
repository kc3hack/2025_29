import type { Context } from "hono";
import { verify } from "hono/jwt";

export async function auth(c: Context<{ Bindings: Env }>) {
    // const header = c.req.header("Authorization");
    // if (!header) return null;
    // if (!header.startsWith("Bearer ")) return null;
    // const token = header.split(" ")[1];
    // const payload = await verify(token, c.env.JWT_SECRET as string);
    // return payload.uid as string;

    // デモの時はユーザーIDを固定で返す
    return "a1225c7b-851c-4861-8b3e-2900091a2084";
}