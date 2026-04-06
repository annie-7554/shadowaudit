import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { validate } from '../middleware/validate';
import { targetsRepository } from '../db/targets';
import { addScanJob } from '../queue/producer';
import { AppError } from '../middleware/errorHandler';
import type { ApiResponse, Target, ScanResult } from '../types';

const execFileAsync = promisify(execFile);

const router = Router();

const ALLOWED_FILES = new Set([
  // Node.js
  'package.json', 'package-lock.json', 'yarn.lock',
  // Python
  'requirements.txt', 'Pipfile.lock', 'Pipfile',
  // Go
  'go.sum', 'go.mod',
  // Java
  'pom.xml', 'build.gradle', 'build.gradle.kts',
  // Ruby
  'Gemfile.lock', 'Gemfile',
  // PHP
  'composer.lock', 'composer.json',
  // Rust
  'Cargo.lock', 'Cargo.toml',
]);

const upload = multer({
  dest: '/tmp/shadowaudit-uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_FILES.has(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file. Allowed: ${[...ALLOWED_FILES].join(', ')}`));
    }
  },
});

const createTargetSchema = z.object({
  name: z.string().min(1).max(255),
  type: z.enum(['npm', 'docker', 'filesystem']),
  value: z.string().min(1).max(1024),
});

// Upload dependency file(s) to scan the user's own project
router.post(
  '/upload',
  upload.array('packageFile', 2),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) throw new AppError(400, 'No file uploaded');

      const firstName = files[0].originalname;
      const name = (req.body.name as string)?.trim() || path.basename(firstName, path.extname(firstName));

      // Save all uploaded files — scanner will handle lock file generation
      const destDir = `/tmp/shadowaudit-projects/${Date.now()}`;
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of files) {
        fs.copyFileSync(file.path, path.join(destDir, file.originalname));
        fs.unlinkSync(file.path);
      }

      const target = await targetsRepository.create({
        name,
        type: 'filesystem',
        value: destDir,
      });
      await addScanJob(target.id, 'filesystem', destDir);

      const body: ApiResponse<Target> = { success: true, data: target };
      res.status(201).json(body);
    } catch (err) {
      next(err);
    }
  },
);

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
