import { Router } from 'express';
import {
  createOrUpdateSpend,
  getSpends,
  deleteSpend,
} from '../controllers/spendController.js';

const router = Router();

router.post('/', createOrUpdateSpend);
router.get('/', getSpends);
router.delete('/:spendId', deleteSpend);

export default router;

