import React, { useEffect, useRef } from 'react';
import { useActivity } from '../contexts/ActivityContext';

interface SessionManagerProps {
  mode?: string;
  classId?: number;
  autoStart?: boolean;
  endOnUnmount?: boolean;
}

/**
 * SessionManager Component
 * 
 * Responsible for managing the lifecycle of a study session.
 * - Starts a session on mount (if autoStart is true)
 * - Ends the session on unmount
 * - Provides a declarative way to manage session scope
 */
export function SessionManager({ 
  mode = "app_usage", 
  classId, 
  autoStart = true,
  endOnUnmount = true,
}: SessionManagerProps) {
  const { startSession, endSession, isReady } = useActivity();

  useEffect(() => {
    if (!isReady) return;

    let startedSessionId: string | null = null;

    if (autoStart) {
      startSession(mode, classId).then((id) => {
        startedSessionId = id;
      }).catch(console.error);
    }

    return () => {
      // Cleanup: End session when this component unmounts
      if (autoStart && endOnUnmount) {
        endSession(startedSessionId || undefined).catch(console.error);
      }
    };
  }, [mode, classId, autoStart, endOnUnmount, startSession, endSession, isReady]);

  return null; // Logic-only component
}
