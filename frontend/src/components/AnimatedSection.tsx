import { type ComponentPropsWithoutRef, type ElementType, type ReactNode, useMemo } from "react";
import { motion, useReducedMotion, type Variants } from "framer-motion";

/*
 * AnimatedSection — reusable, premium-feel viewport reveal.
 *
 * Behaviour:
 *  - Replays the entrance animation EVERY time the section enters the viewport
 *    (scroll up & down both trigger), via `viewport={{ once: false }}`.
 *  - Honours `prefers-reduced-motion`: renders static, no transforms, no opacity dance.
 *  - Optional staggered children for grids / lists.
 *  - Compositional: render any HTML tag via the `as` prop.
 *
 * Animation styles:
 *  - "fade-up"  (default)  — opacity + 24px slide
 *  - "fade"               — opacity only
 *  - "scale-in"           — soft zoom + fade
 *  - "slide-left"         — from -32px x
 *  - "slide-right"        — from +32px x
 */

type Animation = "fade-up" | "fade" | "scale-in" | "slide-left" | "slide-right";

const VARIANTS: Record<Animation, Variants> = {
  "fade-up": {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0 },
  },
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  "scale-in": {
    hidden: { opacity: 0, scale: 0.96 },
    visible: { opacity: 1, scale: 1 },
  },
  "slide-left": {
    hidden: { opacity: 0, x: -32 },
    visible: { opacity: 1, x: 0 },
  },
  "slide-right": {
    hidden: { opacity: 0, x: 32 },
    visible: { opacity: 1, x: 0 },
  },
};

const EASING = [0.2, 0.8, 0.2, 1] as const;

type AnimatedSectionBaseProps = {
  /** Animation style. Defaults to "fade-up". */
  animation?: Animation;
  /** Children to render inside. */
  children: ReactNode;
  /** Optional className passed to the rendered element. */
  className?: string;
  /** Per-element entry delay, in seconds. */
  delay?: number;
  /** Animation duration, in seconds. Default 0.7. */
  duration?: number;
  /** How much of the section must be visible before reveal. 0–1. Default 0.2. */
  amount?: number;
  /**
   * Replay every time it enters the viewport. Default true (matches the
   * project requirement: animations should re-trigger on scroll-up).
   */
  replay?: boolean;
  /** When true, children animate as a stagger group. */
  staggerChildren?: boolean;
  /** Delay between staggered children, in seconds. Default 0.08. */
  staggerDelay?: number;
};

type AnimatedSectionProps<T extends ElementType = "div"> = AnimatedSectionBaseProps &
  Omit<ComponentPropsWithoutRef<T>, keyof AnimatedSectionBaseProps | "as"> & {
    /** HTML tag to render. Defaults to "div". */
    as?: T;
  };

export default function AnimatedSection<T extends ElementType = "div">({
  as,
  animation = "fade-up",
  children,
  className,
  delay = 0,
  duration = 0.7,
  amount = 0.2,
  replay = true,
  staggerChildren = false,
  staggerDelay = 0.08,
  ...rest
}: AnimatedSectionProps<T>) {
  const prefersReducedMotion = useReducedMotion();
  const Tag: ElementType = as || "div";
  const MotionTag = useMemo(() => motion(Tag as ElementType), [Tag]);

  if (prefersReducedMotion) {
    // Render static — no motion, no will-change cost, no transforms.
    return (
      <Tag className={className} {...(rest as Record<string, unknown>)}>
        {children}
      </Tag>
    );
  }

  if (staggerChildren) {
    const containerVariants: Variants = {
      hidden: {},
      visible: {
        transition: {
          staggerChildren: staggerDelay,
          delayChildren: delay,
        },
      },
    };

    return (
      <MotionTag
        className={className}
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: !replay, amount, margin: "0px 0px -40px 0px" }}
        {...(rest as Record<string, unknown>)}
      >
        {children}
      </MotionTag>
    );
  }

  return (
    <MotionTag
      className={className}
      variants={VARIANTS[animation]}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: !replay, amount, margin: "0px 0px -40px 0px" }}
      transition={{ duration, ease: EASING, delay }}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </MotionTag>
  );
}

/**
 * AnimatedItem — child element for use inside <AnimatedSection staggerChildren>.
 * Inherits stagger timing from its parent's variants.
 */
export function AnimatedItem({
  as,
  animation = "fade-up",
  children,
  className,
  duration = 0.6,
  ...rest
}: AnimatedSectionBaseProps & {
  as?: ElementType;
  className?: string;
  children: ReactNode;
} & Omit<ComponentPropsWithoutRef<"div">, keyof AnimatedSectionBaseProps>) {
  const prefersReducedMotion = useReducedMotion();
  const Tag: ElementType = as || "div";
  const MotionTag = useMemo(() => motion(Tag as ElementType), [Tag]);

  if (prefersReducedMotion) {
    return (
      <Tag className={className} {...(rest as Record<string, unknown>)}>
        {children}
      </Tag>
    );
  }

  return (
    <MotionTag
      className={className}
      variants={VARIANTS[animation]}
      transition={{ duration, ease: EASING }}
      {...(rest as Record<string, unknown>)}
    >
      {children}
    </MotionTag>
  );
}
