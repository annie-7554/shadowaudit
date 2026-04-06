import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { targetsRepository } from '../db/targets';
import { addScanJob } from '../queue/producer';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse, Target, ScanResult } from '../types';

const router = Router();

const createTargetSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['npm', 'docker', 'filesystem']),
  value: z.string().min(1).max(1024),
});

router.post(
  '/',
  validate(createTargetSchema),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const target = await targetsRepository.create(req.body);
      await addScanJob(target.id, target.type, target.value);
      const body: ApiResponse<Target> = { success: true, data: target };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/',
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targets = await targetsRepository.findAll();
      const body: ApiResponse<Target[]> = { success: true, data: targets };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const target = await targetsRepository.findById(req.params.id);
      if (!target) {
        throw new AppError(404, `Target ${req.params.id} not found`);
      }
      const body: ApiResponse<Target> = { success: true, data: target };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get(
  '/:id/scans',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const target = await targetsRepository.findById(req.params.id);
      if (!target) {
        throw new AppError(404, `Target ${req.params.id} not found`);
      }
      const { limit } = paginationSchema.parse(req.query);
      const scans = await targetsRepository.getScanHistory(req.params.id, limit);
      const body: ApiResponse<ScanResult[]> = { success: true, data: scans };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  '/:id',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await targetsRepository.deleteById(req.params.id);
      if (!deleted) {
        throw new AppError(404, `Target ${req.params.id} not found`);
      }
      const body: ApiResponse<null> = {
        success: true,
        message: 'Target deleted successfully',
      };
      res.json(body);
    } catch (err) {
      next(err);
    }
  },
);

export default router;
