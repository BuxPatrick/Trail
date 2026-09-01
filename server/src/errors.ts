import type { NextFunction, Request, Response } from 'express'

export class AppError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (code: string, message: string) =>
  new AppError(code, message, 404)

export const badRequest = (code: string, message: string) =>
  new AppError(code, message, 400)

export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } })
    return
  }
  // Never surface an unexpected error's message: it may carry connection
  // strings, SQL, or file paths. Log it, return something generic.
  console.error('[unhandled]', err)
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Something went wrong.' },
  })
}
