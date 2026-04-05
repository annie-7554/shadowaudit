import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import type { ApiResponse } from '../types';

export function validate<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const formatted = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      const body: ApiResponse<never> = {
        success: false,
        error: 'Validation failed',
        message: formatted.map((f) => `${f.field}: ${f.message}`).join('; '),
      };
      res.status(400).json(body);
      return;
    }
    req.body = result.data;
    next();
  };
}
