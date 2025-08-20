import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import path from 'path';
import fs from 'fs';
import config from './config';
import apiRoutes from './api/routes';
import { setupWebSocket } from './services/websocket';
import tradingService from './services/tradingInstance';

// Initialize Express app
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// API Routes
app.use('/api', apiRoutes);

// Use shared Trading Service instance

// Serve static status page (prefer dist/public when compiled)
const distPublic = path.resolve(__dirname, 'public');
const projectPublic = path.resolve(__dirname, '../public');
const staticDir = fs.existsSync(distPublic) ? distPublic : projectPublic;
app.use(express.static(staticDir));

// SSE endpoint for live status
app.get('/status/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (data: unknown) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial snapshot
  send(tradingService.getStatus());

  // Subscribe to updates
  const off = tradingService.onStatus((status) => send(status));

  // Cleanup on client disconnect
  req.on('close', () => {
    off();
    res.end();
  });
});

export const startServer = async () => {
  try {
    // Initialize trading service (loads balances, starts polling)
    await tradingService.initialize();
    // Start WebSocket connection
    await setupWebSocket(tradingService);

    // Start HTTP server
    const server = app.listen(config.server.port, () => {
      console.log(`Server is running on port ${config.server.port}`);
      console.log(`Environment: ${config.server.env}`);
      console.log(`Trading pair: ${config.trading.pair}`);
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down gracefully...');
      await tradingService.cleanup();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();
