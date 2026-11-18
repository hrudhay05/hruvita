import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { initDatabase, getDbStatus } from './store/repository.js';
import { sanitizeNoSqlInput } from './middleware/auth.js';
import { startAutomationJobs } from './jobs/scheduler.js';
import authRoutes from './routes/auth.js';
import profileRoutes from './routes/profile.js';
import addressRoutes from './routes/addresses.js';
import catalogRoutes from './routes/catalog.js';
import orderRoutes from './routes/orders.js';
import extrasRoutes from './routes/extras.js';
import assistantRoutes from './routes/assistant.js';
import adminRoutes from './routes/admin.js';

dotenv.config();
if (!process.env.MONGODB_URI) {
  dotenv.config({ path: '.env.example' });
}

const app = express();
const PORT = Number(process.env.PORT) || 5000;

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const isProd = process.env.NODE_ENV === 'production';

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (
        !origin ||
        !isProd ||
        allowedOrigins.includes(origin) ||
        /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(
          origin
        ) ||
        origin.endsWith('.vercel.app')
      ) {
        return callback(null, true);
      }
      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeNoSqlInput);

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', apiLimiter);

// Health & keep-awake endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'hruvita-api',
    db: getDbStatus(),
    timestamp: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', profileRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/addresses', addressRoutes);
app.use('/api/profile/addresses', addressRoutes);
app.use('/api', catalogRoutes);
app.use('/api', orderRoutes);
app.use('/api', extrasRoutes);
app.use('/api/assistant', assistantRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'API route not found' });
});

app.use((err, _req, res, _next) => {
  console.error('[API Error]', err.message);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

async function start() {
  await initDatabase();
  startAutomationJobs();
  const server = app.listen(PORT, () => {
    console.log(`[HRUVITA API] Listening on http://localhost:${PORT}`);
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(
        `[HRUVITA API] Port ${PORT} is already in use by another running instance. Stop the other terminal or change PORT in .env.`
      );
      process.exit(1);
    }
    throw err;
  });
}

start();
