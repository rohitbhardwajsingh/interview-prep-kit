import type { Request } from "express";
import { badRequest } from "./errors";

/**
 * Express types a route parameter as string | string[], because a repeated
 * name collapses into an array. Every parameter here is a single path segment,
 * so an array means the request was malformed and is refused rather than
 * coerced into something that would silently address the wrong record.
 */
export function param(request: Request, name: string): string {
  const value = request.params[name];
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`Missing ${name} in the request path`);
  }
  return value;
}
