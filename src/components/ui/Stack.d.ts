/**
 * Types for the vendored Stack card component.
 *
 * Same reason as ColorBends.d.ts: the implementation is untyped JSX, so
 * `cards` infers as `never[]` under strict mode and rejects its own contents.
 */
export interface StackCard {
  id: number | string;
  img?: string;
  content?: React.ReactNode;
}

declare const Stack: React.FC<{
  cards?: StackCard[] | React.ReactNode[];
  randomRotation?: boolean;
  sensitivity?: number;
  sendToBackOnClick?: boolean;
  autoplay?: boolean;
  autoplayDelay?: number;
  cardDimensions?: { width: number; height: number };
  animationConfig?: { stiffness: number; damping: number };
  className?: string;
}>;

export default Stack;
