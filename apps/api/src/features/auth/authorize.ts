import type { Request, Response } from "express";
import type { Pool } from "pg";
import { HttpError } from "../../http-error.js";
import type { Session } from "./contracts.js";
import { readSession } from "./session.js";

type Handler = (request: Request, response: Response, session: Session & { expiresAt: number }) => Promise<void>;

export function authorize(pool: Pool, sessionKey: Uint8Array) {
  return (handler: Handler, roles?: Session["role"][]) => async (request: Request, response: Response) => {
    const session = await readSession(pool, sessionKey, request.get("cookie"));
    if (!session) throw new HttpError(401, "Sign in to open the workspace");
    if (roles && !roles.includes(session.role)) throw new HttpError(403, "This role cannot perform that action");
    await handler(request, response, session);
  };
}
