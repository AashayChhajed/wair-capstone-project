import type { NextFunction, Request, Response } from "express";
import { verifyToken } from "../lib/auth.js";

/**
 * Attaches req.user when a valid Bearer token is present. Does NOT reject
 * unauthenticated requests (public routes need that); combine with
 * requireAuth / requireRole for protection.
 */
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    try {
      const payload = verifyToken(header.slice(7));
      req.user = { id: payload.sub, name: payload.name, role: payload.role };
    } catch {
      // Invalid token on a public route: treat as anonymous.
    }
  }
  next();
}
