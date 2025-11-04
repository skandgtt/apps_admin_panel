import { Router } from 'express';
import {
  getDashboard,
  getTransactions,
  getDailySales,
  getPerformance,
  getPerformanceHourly,
} from '../controllers/dashboardController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

router.get('/overview', getDashboard);
router.get('/transactions', getTransactions);
router.get('/daily-sales', getDailySales);
router.get('/performance', getPerformance);
router.get('/performance/hourly', getPerformanceHourly);

export default router;