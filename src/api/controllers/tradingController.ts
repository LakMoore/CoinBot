import type { Request, Response } from 'express';
import { TradingService } from '../../services/trading';
import config from '../../config';

// Initialize trading service
const tradingService = new TradingService();

/**
 * Get the current trading status
 */
export const getStatus = async (req: Request, res: Response) => {
  try {
    const status = tradingService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
};

/**
 * Execute a buy order
 */
export const executeBuy = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const tradeAmount = amount || config.trading.amount;
    const result = await tradingService.executeBuy(tradeAmount);
    res.json(result);
  } catch (error) {
    console.error('Error executing buy order:', error);
    res.status(500).json({ error: 'Failed to execute buy order' });
  }
};

/**
 * Execute a sell order
 */
export const executeSell = async (req: Request, res: Response) => {
  try {
    const { amount } = req.body;
    const tradeAmount = amount || config.trading.amount;
    const result = await tradingService.executeSell(tradeAmount);
    res.json(result);
  } catch (error) {
    console.error('Error executing sell order:', error);
    res.status(500).json({ error: 'Failed to execute sell order' });
  }
};

/**
 * Get historical market data for backtesting
 */
export const getHistoricalData = async (req: Request, res: Response) => {
  try {
    const { start, end, granularity } = req.query;

    // This would fetch historical data for backtesting
    // For now, return a placeholder
    res.json({
      message: 'Historical data endpoint',
      start,
      end,
      granularity,
      // Add actual implementation here
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    res.status(500).json({ error: 'Failed to fetch historical data' });
  }
};
