import { Router, Request, Response, NextFunction } from 'express';
import { targetsRepository } from '../db/targets';
import type { ApiResponse, DashboardStats } from '../types';

const router = Router();

router.get(
  '/stats',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await targetsRepository.getDashboardStats();
      const body: ApiResponse<DashboardStats> = { success: true, data: stats };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const stats = await targetsRepository.getDashboardStats();
      const body: ApiResponse<DashboardStats> = { success: true, data: stats };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
