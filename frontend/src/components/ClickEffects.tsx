import React, { useEffect, useState, useRef } from 'react';
import { getClickEffectsEnabled } from '../lib/ui-settings';

interface ClickEffect {
  id: number;
  x: number;
  y: number;
}

export default function ClickEffects() {
  const [enabled, setEnabled] = useState(getClickEffectsEnabled());
  const [effects, setEffects] = useState<ClickEffect[]>([]);
  const nextId = useRef(0);

  useEffect(() => {
    // Listen for settings changes
    const onSettingsChange = () => {
      setEnabled(getClickEffectsEnabled());
    };
    window.addEventListener('click-effects-changed', onSettingsChange);
    return () => {
      window.removeEventListener('click-effects-changed', onSettingsChange);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleMouseDown = (e: MouseEvent) => {
      // Trigger effect on mouse down for instant feedback
      const id = nextId.current++;
      const newEffect = { id, x: e.clientX, y: e.clientY };

      setEffects((prev) => [...prev, newEffect]);

      // Auto-remove after animation duration (e.g., 600ms)
      setTimeout(() => {
        setEffects((prev) => prev.filter((eff) => eff.id !== id));
      }, 600);
    };

    window.addEventListener('mousedown', handleMouseDown, true);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 9999,
        overflow: 'hidden',
      }}
    >
      {effects.map((effect) => (
        <div
          key={effect.id}
          className="ns-click-ripple"
          style={{
            position: 'absolute',
            left: effect.x,
            top: effect.y,
          }}
        />
      ))}
      <style>{`
        .ns-click-ripple {
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background-color: var(--primary); /* Use theme primary color */
          transform: translate(-50%, -50%) scale(0);
          animation: ns-ripple-anim 0.6s ease-out forwards;
          pointer-events: none;
          opacity: 0.4;
        }
        @keyframes ns-ripple-anim {
          0% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0.6;
          }
          100% {
            transform: translate(-50%, -50%) scale(4);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
