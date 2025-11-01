import { Router } from 'express';
import { generatePaymentsPDF } from '../controllers/pdfController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// All routes require authentication
router.use(authenticate);

router.get('/payments', generatePaymentsPDF);

export default router;

