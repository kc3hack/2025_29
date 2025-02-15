import type { Context } from "hono";
import type { Bindings } from "./bindings";
import { verify } from "hono/jwt";

export async function auth(c: Context<{ Bindings: Bindings }>) {
    const header = c.req.header("Authorization");
    if (!header) return null;
    if (!header.startsWith("Bearer ")) return null;
    const token = header.split(" ")[1];
    const payload = await verify(token, c.env.JWT_SECRET as string);
    return payload.uid as string;
}