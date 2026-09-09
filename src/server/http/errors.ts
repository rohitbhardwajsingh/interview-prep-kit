import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { LlmError } from "../../core/llm/types";
import { PipelineError } from "../../core/pipeline/errors";

/**
 * A fault the client is allowed to see. Anything else is logged and reported as
 * a bare 500, so an internal message never leaks through the API.
 */
export class HttpError extends Error {
  override name = "HttpError";

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new HttpError(400, "BAD_REQUEST", message, details);

export const unauthorised = (message = "Sign in to continue") =>
  new HttpError(401, "UNAUTHORISED", message);

export const forbidden = (message = "Not yours") =>
  new HttpError(403, "FORBIDDEN", message);

export const notFound = (message = "Not found") =>
  new HttpError(404, "NOT_FOUND", message);

export const conflict = (message: string, details?: unknown) =>
  new HttpError(409, "CONFLICT", message, details);

/** Lets a route be written as a plain async function. */
export function route(handler: RequestHandler): RequestHandler {
  return (request, response, next) => {
    void Promise.resolve(handler(request, response, next)).catch(next);
  };
}

function describe(cause: unknown): HttpError {
  if (cause instanceof HttpError) return cause;

  if (cause instanceof ZodError) {
    return badRequest(
      "That request did not match what this endpoint expects",
      cause.issues.map((issue) => ({
        path: issue.path.join(".") || "<root>",
        message: issue.message,
      })),
    );
  }

  // A model that is rate limited or misconfigured is not the client's fault,
  // but the reason is safe and actionable, so it is passed through.
  if (cause instanceof LlmError) {
    const status = cause.code === "RATE_LIMITED" ? 429 : 502;
    return new HttpError(status, `LLM_${cause.code}`, cause.message);
  }

  if (cause instanceof PipelineError) {
    return new HttpError(502, cause.code, cause.message);
  }

  return new HttpError(500, "INTERNAL", "Something went wrong");
}

export function errorHandler(
  cause: unknown,
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (response.headersSent) {
    next(cause);
    return;
  }

  const error = describe(cause);

  if (error.status >= 500) {
    console.error("[api]", cause instanceof Error ? cause.stack : cause);
  }

  response.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });
}

export function notFoundHandler(_request: Request, response: Response): void {
  response.status(404).json({
    error: { code: "NOT_FOUND", message: "No such endpoint" },
  });
}
