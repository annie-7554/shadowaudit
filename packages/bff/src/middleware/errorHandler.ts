import { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '../types';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const isProd = process.env.NODE_ENV === 'production';

  if (err instanceof AppError) {
    const body: ApiResponse<never> = { success: false, error: err.message };
    res.status(err.statusCode).json(body);
    return;
  }

  if (err instanceof Error) {
    console.error('[error]', err.message, isProd ? '' : err.stack);
    const body: ApiResponse<never> = {
      success: false,
      error: isProd ? 'Internal server error' : err.message,
    };
    res.status(500).json(body);
    return;
  }

  res.status(500).json({ success: false, error: 'Unknown error' } satisfies ApiResponse<never>);
}
