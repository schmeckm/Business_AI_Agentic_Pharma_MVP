export function extendWithOEE(dataManager) {
  dataManager.getRealtimeOEEData = function() {
    const oeeSource = this.dataSources.get('oee');
    if (oeeSource && oeeSource.data && oeeSource.client?.connected) {
      return Array.from(oeeSource.data.values());
    }
    return [];
  };

  dataManager.getOEEConnectionStatus = function() {
    const oeeSource = this.dataSources.get('oee');
    if (oeeSource && oeeSource.getConnectionStatus) {
      return oeeSource.getConnectionStatus();
    }
    return {
      connected: false,
      reconnectAttempts: 0,
      dataPoints: 0,
      brokerUrl: 'Not configured'
    };
  };
}
