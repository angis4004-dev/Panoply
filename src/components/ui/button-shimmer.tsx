export default function ButtonShimmer() {
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden rounded-lg">
      <span className="absolute inset-y-0 left-0 w-1/3 animate-shimmer-sweep bg-gradient-to-r from-transparent via-white/35 to-transparent motion-reduce:hidden" />
    </span>
  );
}
