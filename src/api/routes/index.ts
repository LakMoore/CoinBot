import { Router } from 'express';
import { getStatus, executeBuy, executeSell, getHistoricalData } from '../controllers/tradingController';

const router = Router();

// Trading endpoints
router.get('/status', getStatus);
router.post('/buy', executeBuy);
router.post('/sell', executeSell);
router.get('/history', getHistoricalData);

export default router;
