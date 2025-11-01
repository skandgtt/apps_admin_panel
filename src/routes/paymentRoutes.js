import { Router } from 'express';
import { createOrUpdatePayment, listPayments, getPaymentByUuid } from '../controllers/paymentController.js';

const router = Router();

router.post('/', createOrUpdatePayment);
router.get('/', listPayments);
router.get('/:uuid', getPaymentByUuid);

export default router;


