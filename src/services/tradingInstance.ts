import { TradingService } from './trading';

// Single shared instance of TradingService across the app
const tradingService = new TradingService();

export default tradingService;
