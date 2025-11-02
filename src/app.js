import express from 'express';
import cors from 'cors';
import paymentRoutes from './routes/paymentRoutes.js';
import appRoutes from './routes/appRoutes.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import spendRoutes from './routes/spendRoutes.js';
import pdfRoutes from './routes/pdfRoutes.js';
import collectionRoutes from './routes/collectionRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// All routes (authentication disabled for now)
app.use('/auth', authRoutes);
app.use('/coinCollect', paymentRoutes);
app.use('/apps', appRoutes);
app.use('/users', userRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/spends', spendRoutes);
app.use('/pdf', pdfRoutes);
app.use('/collections', collectionRoutes);

export default app;