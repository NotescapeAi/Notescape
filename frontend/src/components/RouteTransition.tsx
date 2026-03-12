import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

type RouteTransitionProps = {
  routeKey: string;
  children: React.ReactNode;
};

export default function RouteTransition({ routeKey, children }: RouteTransitionProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className="route-transition-stage">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={routeKey}
          className="route-transition-page"
          initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 8, scale: 0.997 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 6, scale: 0.998 }}
          transition={{
            duration: reduceMotion ? 0 : 0.22,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
