// ============================================================================
// FILE: public/js/modules/events.js
// ============================================================================
/**
 * Event Monitoring Module
 * Handles Server-Sent Events (SSE) for real-time updates
 */
class EventMonitor {
  constructor() {
    this.events = [];
    this.eventSource = null;
    this.reconnectTimeout = null;
    this.heartbeatInterval = null;
  }

  /**
   * Start the event monitor
   */
  start() {
    this.connect();
    this.startHeartbeat();
  }

  /**
   * Connect to the event stream
   * @private
   */
  connect() {
    if (this.eventSource) {
      this.eventSource.close();
    }

    console.log('🔌 Connecting to Event Stream...');
    this.eventSource = new EventSource(AppConfig.endpoints.events);

    this.eventSource.onopen = () => this.handleOpen();
    this.eventSource.onmessage = (event) => this.handleMessage(event);
    this.eventSource.onerror = () => this.handleError();
  }

  /**
   * Handle connection opened
   * @private
   */
  handleOpen() {
    console.log('✅ Event stream connected');
    this.addEvent({
      type: 'connection',
      timestamp: new Date().toISOString(),
      payload: { message: '✅ Event stream connected' }
    });
  }

  /**
   * Handle incoming message
   * @private
   */
  handleMessage(event) {
    try {
      const data = JSON.parse(event.data);
      this.addEvent(data);
    } catch (err) {
      console.warn('⚠️ Invalid SSE event:', event.data);
    }
  }

  /**
   * Handle connection error
   * @private
   */
  handleError() {
    console.warn('⚠️ Event stream error, will reconnect in 5s...');
    this.addEvent({
      type: 'error',
      timestamp: new Date().toISOString(),
      payload: { message: '⚠️ Event stream disconnected' }
    });

    this.eventSource.close();
    clearTimeout(this.reconnectTimeout);
    
    this.reconnectTimeout = setTimeout(
      () => this.connect(), 
      AppConfig.events.reconnectDelay
    );
  }

  /**
   * Add an event to the list and render
   * @private
   */
addEvent(event) {
  this.events.push(event);
  
  // Limit to last 100 events
  if (this.events.length > 100) {
    this.events.shift();
  }
  
  this.render();
}

  /**
   * Render all events
   */
  render() {
  const monitor = document.getElementById('event-monitor');
  if (!monitor) return;

  const fragment = document.createDocumentFragment();
  
  this.events.forEach(event => {
    const element = this.createEventElement(event);
    fragment.appendChild(element);
  });
  
  monitor.innerHTML = '';
  monitor.appendChild(fragment);
  monitor.scrollTop = monitor.scrollHeight;
}

  /**
   * Create a DOM element for an event
   * @private
   */
  createEventElement(data) {
    const wrapper = document.createElement('div');
    wrapper.classList.add('event-line');

    // Apply color based on type
    const colorMap = {
      error: 'red',
      success: 'green',
      connection: 'blue',
      heartbeat: 'gray'
    };
    
    if (colorMap[data.type]) {
      wrapper.style.color = colorMap[data.type];
    }

    const icon = AppConfig.eventIcons[data.type] || AppConfig.eventIcons.default;
    const timestamp = data.timestamp 
      ? new Date(data.timestamp).toLocaleTimeString()
      : new Date().toLocaleTimeString();
    
    const topic = data.topic || data.agent || '';
    const payload = JSON.stringify(data.payload || {});
    
    wrapper.textContent = 
      `[${timestamp}] ${icon} ${data.type.toUpperCase()} | ${topic} | ${payload}`;

    return wrapper;
  }

  /**
   * Clear all events
   */
  clear() {
    this.events = [];
    this.render();
  }

  /**
   * Start heartbeat mechanism
   * @private
   */
  startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.addEvent({
        type: 'heartbeat',
        timestamp: new Date().toISOString(),
        payload: { message: '💓 Connection alive' }
      });
    }, AppConfig.events.heartbeatInterval);
  }

  /**
   * Stop the event monitor
   */
  stop() {
    if (this.eventSource) {
      this.eventSource.close();
    }
    
    clearTimeout(this.reconnectTimeout);
    clearInterval(this.heartbeatInterval);
  }
}
