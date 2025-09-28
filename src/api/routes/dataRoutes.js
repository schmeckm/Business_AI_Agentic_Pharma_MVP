import express from "express";

export function createDataRoutes(dataManager, eventBusManager) {
  const router = express.Router();

  /**
   * GET /api/data - Data Overview
   */
  router.get("/", (req, res) => {
    try {
      const includeFullData = req.query.full === 'true';
      const overview = dataManager.getDataOverview(includeFullData);
      res.json(overview);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/data/stats - Data Statistics
   */
  router.get("/stats", (req, res) => {
    try {
      res.json({
        stats: dataManager.getDataStats(),
        loaded: dataManager.getLoadedDataKeys(),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/data/oee - Current OEE Data
   */
  router.get("/oee", async (req, res) => {
    try {
      const data = await dataManager.getCachedData("oee", true);
      res.json({ 
        success: true, 
        data, 
        count: Array.isArray(data) ? data.length : 0,
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
   * GET /api/data/oee_history - Alias für /api/oee/history (Backward Compatibility)
   */
  router.get("/oee_history", (req, res) => {
    // Redirect zu dem neuen OEE History Endpunkt
    const queryString = new URLSearchParams(req.query).toString();
    const redirectUrl = `/api/oee/history${queryString ? '?' + queryString : ''}`;
    
    console.log(`Redirecting /api/data/oee_history to ${redirectUrl}`);
    res.redirect(redirectUrl);
  });

  /**
   * GET /api/data/orders-oee - Production Orders mit OEE
   */
  router.get("/orders-oee", async (req, res) => {
    try {
      const data = await dataManager.getOrdersWithOEE();
      res.json({
        success: true,
        orders: data,
        count: data.length,
        enhanced: true,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error("Orders+OEE endpoint error:", error.message);
      res.status(500).json({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  /**
   * POST /api/data/reload - Reload Data Sources
   */
  router.post("/reload", (req, res) => {
    try {
      console.log('Reloading data sources...');
      const success = dataManager.reloadData();
      res.json({
        status: success ? "success" : "failed",
        loaded: dataManager.getLoadedDataKeys(),
        message: success ? "Data reloaded successfully" : "Failed to reload data",
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        message: error.message,
        timestamp: new Date().toISOString()
      });
    }
  });

  return router;
}