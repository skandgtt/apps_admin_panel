import { Router } from 'express';
import { generatePaymentsPDF } from '../controllers/pdfController.js';

const router = Router();

router.get('/payments', generatePaymentsPDF);

export default router;

