import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AGENT_BRIDGE_ENABLED_KEY,
  AGENT_BRIDGE_RECONNECT_MS,
  AGENT_BRIDGE_URL,
  buildAgentBridgeHello,
  createAgentBridgeProtocol,
  createAgentBridgeRequestHandler,
  type AgentBridgeStatus,
} from './agentBridgeClient';
import { getAgentBridge } from './debugBridge';

function readEnabled(): boolean {
  try {
    return localStorage.getItem(AGENT_BRIDGE_ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

export interface UseAgentBridgeResult {
  enabled: boolean;
  status: AgentBridgeStatus;
  /** Human-readable reason the last attempt failed (null while connected). */
  error: string | null;
  enable: () => void;
  disable: () => void;
}

/**
 * React glue for the local agent bridge. Disabled by default; the user opts in
 * from File → Connect agent bridge (the menu toggle is the consent). While
 * enabled it keeps a WebSocket to the helper alive, reconnecting every 2s.
 */
export function useAgentBridge(): UseAgentBridgeResult {
  const [enabled, setEnabled] = useState(readEnabled);
  const [status, setStatus] = useState<AgentBridgeStatus>('off');
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      setError(null);
      return;
    }
    let cancelled = false;
    let firstAttempt = true;
    let connect: () => void;

    const scheduleRetry = () => {
      if (cancelled) return;
      timerRef.current = window.setTimeout(() => connect(), AGENT_BRIDGE_RECONNECT_MS);
    };

    connect = function connectNow() {
      if (cancelled) return;
      const bridge = getAgentBridge();
      if (!bridge) {
        // Provider hasn't mounted yet — not an error, just wait and retry.
        setStatus('connecting');
        scheduleRetry();
        return;
      }
      if (firstAttempt) {
        setStatus('connecting');
        firstAttempt = false;
      }
      let ws: WebSocket;
      try {
        ws = new WebSocket(AGENT_BRIDGE_URL);
      } catch (err) {
        setStatus('error');
        setError(err instanceof Error ? err.message : String(err));
        scheduleRetry();
        return;
      }
      wsRef.current = ws;
      const send = (message: unknown) => {
        try {
          ws.send(JSON.stringify(message));
        } catch {
          // socket already closed
        }
      };
      const onMessage = createAgentBridgeProtocol(createAgentBridgeRequestHandler(bridge), send);

      ws.onopen = () => {
        if (cancelled) {
          ws.close();
          return;
        }
        setStatus('connected');
        setError(null);
        send(buildAgentBridgeHello(bridge));
      };
      ws.onmessage = (event) => {
        void onMessage(event.data);
      };
      ws.onclose = (event) => {
        if (wsRef.current === ws) wsRef.current = null;
        if (cancelled) return;
        setStatus('error');
        if (event.code === 1008) {
          // Policy close (another tab took over, bad origin, …). Retrying would
          // fight the other tab forever — wait for the user to toggle.
          setError(event.reason || 'The local helper refused the connection.');
          return;
        }
        setError(
          event.reason
            ? `Helper closed the connection: ${event.reason}`
            : 'Can’t reach the local helper. Start your AI client (or run “npm run mcp”), then leave this on to retry.',
        );
        scheduleRetry();
      };
      ws.onerror = () => {
        // onclose follows and owns the retry + message
      };
    };

    connect();
    return () => {
      cancelled = true;
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {
          // already closed
        }
      }
    };
  }, [enabled]);

  const enable = useCallback(() => {
    setError(null);
    setEnabled(true);
    try {
      localStorage.setItem(AGENT_BRIDGE_ENABLED_KEY, '1');
    } catch {
      // storage unavailable — session-only toggle
    }
  }, []);

  const disable = useCallback(() => {
    setEnabled(false);
    try {
      localStorage.setItem(AGENT_BRIDGE_ENABLED_KEY, '0');
    } catch {
      // storage unavailable — session-only toggle
    }
  }, []);

  return { enabled, status, error, enable, disable };
}
