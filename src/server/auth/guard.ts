import type { RequestHandler } from "express";
import { unauthorised } from "../http/errors";

declare module "express-session" {
  interface SessionData {
    userId?: string;
  }
}

/**
 * The single gate for every protected route. Attached once at the router level
 * rather than checked inside handlers, so a new endpoint is private by default
 * and forgetting the check is not possible.
 */
export const requireUser: RequestHandler = (request, _response, next) => {
  const userId = request.session?.userId;
  if (!userId) {
    next(unauthorised());
    return;
  }

  request.userId = userId;
  next();
};

declare global {
  namespace Express {
    interface Request {
      /** Set by requireUser; present on every protected route. */
      userId: string;
    }
  }
}
