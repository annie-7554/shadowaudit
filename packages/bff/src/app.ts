import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import targetsRouter from './routes/targets';
import dashboardRouter from './routes/dashboard';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[http] ${req.method} ${req.path}`);
  next();
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/ready', (_req: Request, res: Response) => {
  res.json({ status: 'ready', timestamp: new Date().toISOString() });
});

app.use('/api/targets', targetsRouter);
app.use('/api/dashboard', dashboardRouter);

app.use(errorHandler);

export default app;
