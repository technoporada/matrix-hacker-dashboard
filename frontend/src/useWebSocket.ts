import { useEffect, useRef, useState, useCallback } from 'react';

const API = import.meta.env.VITE_API_URL || '';

const useWebSocket = () => {
  const [messages, setMessages] = useState([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  const addMessage = useCallback((msg) => {
    setMessages(prev => [msg, ...prev].slice(0, 200));
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  useEffect(() => {
    let wsUrl;
    if (API) {
      wsUrl = API.replace(/^http/, 'ws') + '/ws';
    } else {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${proto}//${window.location.host}/ws`;
    }

    let reconnectTimer;
    let closed = false;

    const connect = () => {
      if (closed) return;
      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[WS] Connected');
          setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'progress') {
              addMessage(parsed.data);
            }
          } catch (e) {
            console.error('[WS] Parse error:', e);
          }
        };

        ws.onclose = () => {
          console.log('[WS] Disconnected');
          setConnected(false);
          wsRef.current = null;
          if (!closed) {
            reconnectTimer = setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (e) {
        console.error('[WS] Connection error:', e);
        if (!closed) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      }
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [addMessage]);

  return { messages, connected, clearMessages };
};

export default useWebSocket;
