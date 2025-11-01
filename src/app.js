import express from 'express';
import cors from 'cors';
import paymentRoutes from './routes/paymentRoutes.js';
import appRoutes from './routes/appRoutes.js';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.use('/coinCollect', paymentRoutes);
app.use('/apps', appRoutes);

export default app;