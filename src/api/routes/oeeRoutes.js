import express from "express";

export function createOEERoutes(dataManager, eventBusManager) {
  const router = express.Router();

  /**
   * GET /api/oee - OEE Dashboard Data
   */
  router.get("/", async (req, res) => {
    try {
      const oeeData = await dataManager.getCachedData("oee", true);
      const oeeStats = eventBusManager.getOEEStatistics();
      
      res.json({
        success: true,
        metrics: oeeData,
        statistics: oeeStats,
        dashboard: {
          totalEquipment: Array.isArray(oeeData) ? oeeData.length : 0,
          activeEvents: oeeStats?.totalOEEEvents || 0,
          subscribers: oeeStats?.oeeSubscriberCount || 0
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/oee/history - Historical OEE Data (Ihr gesuchter Endpunkt!)
   */
  router.get("/history", async (req, res) => {
    try {
      const {
        limit = 100,
        lineId,
        startDate,
        endDate,
        format = 'detailed'
      } = req.query;

      console.log(`OEE History request: limit=${limit}, lineId=${lineId}, format=${format}`);

      let historyData;
      
      // Versuche aus EventBus Manager
      if (eventBusManager && typeof eventBusManager.getOEEEventHistory === 'function') {
        historyData = eventBusManager.getOEEEventHistory(parseInt(limit));
        console.log(`Loaded ${historyData.length} OEE events from EventBus`);
      } else {
        // Fallback: Generiere aus aktuellen Daten
        const oeeData = await dataManager.getCachedData("oee", true);
        historyData = generateOEEHistory(oeeData, parseInt(limit), lineId);
        console.log(`Generated ${historyData.length} OEE history records`);
      }

      // Filter anwenden
      if (lineId && historyData) {
        historyData = historyData.filter(item => 
          item.lineId === lineId || item.lineId?.includes(lineId)
        );
      }

      if (startDate && historyData) {
        const start = new Date(startDate);
        historyData = historyData.filter(item => 
          new Date(item.timestamp) >= start
        );
      }

      if (endDate && historyData) {
        const end = new Date(endDate);
        historyData = historyData.filter(item => 
          new Date(item.timestamp) <= end
        );
      }

      // Response formatieren
      const response = {
        success: true,
        history: historyData || [],
        count: historyData?.length || 0,
        parameters: {
          limit: parseInt(limit),
          lineId,
          startDate,
          endDate,
          format
        },
        summary: historyData?.length > 0 ? {
          avgOEE: calculateAverage(historyData, 'oee'),
          avgAvailability: calculateAverage(historyData, 'availability'),
          avgPerformance: calculateAverage(historyData, 'performance'),
          avgQuality: calculateAverage(historyData, 'quality'),
          timeRange: {
            from: historyData[historyData.length - 1]?.timestamp,
            to: historyData[0]?.timestamp
          }
        } : null,
        timestamp: new Date().toISOString()
      };

      res.json(response);

    } catch (error) {
      console.error("OEE History endpoint error:", error);
      res.status(500).json({
        success: false,
        error: error.message,
        endpoint: '/api/oee/history',
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/oee/refresh - Force Cache Refresh
   */
  router.post("/refresh", (req, res) => {
    try {
      if (typeof dataManager.refreshOEECache === 'function') {
        dataManager.refreshOEECache();
      }
      
      eventBusManager.publishOEEEvent('cache_refreshed', {
        triggeredBy: 'api',
        timestamp: new Date().toISOString()
      }, 'system');
      
      res.json({
        success: true,
        message: "OEE cache refresh triggered",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * GET /api/oee/lines/:lineId/realtime - Real-time Line Data
   */
  router.get("/lines/:lineId/realtime", async (req, res) => {
    const { lineId } = req.params;
    
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    try {
      const initialData = await dataManager.getCachedData("oee", true);
      const lineData = Array.isArray(initialData) ? 
        initialData.find(item => item.lineId === lineId) : null;
      
      res.write(`data: ${JSON.stringify({
        type: 'initial',
        lineId,
        data: lineData,
        timestamp: new Date().toISOString()
      })}\n\n`);
    } catch (error) {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: error.message,
        timestamp: new Date().toISOString()
      })}\n\n`);
    }

    const lineUpdateHandler = (eventData) => {
      if (eventData.lineId === lineId) {
        res.write(`data: ${JSON.stringify({
          type: 'update',
          lineId,
          data: eventData,
          timestamp: new Date().toISOString()
        })}\n\n`);
      }
    };

    eventBusManager.on('oee:line:update', lineUpdateHandler);

    req.on('close', () => {
      eventBusManager.removeListener('oee:line:update', lineUpdateHandler);
      console.log(`OEE real-time stream disconnected for line: ${lineId}`);
    });
  });

  return router;
}

/**
 * Helper Functions für OEE Routes
 */
function generateOEEHistory(currentData, limit, lineId) {
  const mockData = [];
  const lines = lineId ? [lineId] : ['LINE-01', 'LINE-02', 'LINE-03'];
  
  for (let i = 0; i < limit; i++) {
    const selectedLine = lines[i % lines.length];
    const minutesAgo = i * 3;
    
    mockData.push({
      timestamp: new Date(Date.now() - (minutesAgo * 60000)).toISOString(),
      lineId: selectedLine,
      lineName: `Production Line ${selectedLine.split('-')[1]}`,
      oee: Math.round((85 + Math.random() * 10) * 100) / 100,
      availability: Math.round((90 + Math.random() * 8) * 100) / 100,
      performance: Math.round((88 + Math.random() * 10) * 100) / 100,
      quality: Math.round((95 + Math.random() * 4) * 100) / 100,
      status: Math.random() > 0.9 ? 'maintenance' : 'running',
      eventType: 'oee_update',
      source: 'mock_generator'
    });
  }
  
  return mockData.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function calculateAverage(data, field) {
  if (!data || data.length === 0) return 0;
  const values = data.map(item => item[field]).filter(val => typeof val === 'number');
  return values.length > 0 ? Math.round((values.reduce((sum, val) => sum + val, 0) / values.length) * 100) / 100 : 0;
}