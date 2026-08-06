/**
 * Types for the vendored ColorBends WebGL background.
 *
 * The implementation is plain JSX with no annotations, so under strict mode
 * TypeScript infers its array props as `never[]` and rejects every colour
 * passed in. Declaring the surface here types the call sites without
 * modifying the shader component itself.
 */
declare const ColorBends: React.FC<{
  colors?: string[];
  rotation?: number;
  speed?: number;
  scale?: number;
  frequency?: number;
  warpStrength?: number;
  mouseInfluence?: number;
  noise?: number;
  parallax?: number;
  iterations?: number;
  intensity?: number;
  bandWidth?: number;
  transparent?: boolean;
  className?: string;
}>;

export default ColorBends;
