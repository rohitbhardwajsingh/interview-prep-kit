/**
 * The light the whole app sits in.
 *
 * Flat black reads as "off". A couple of slow, heavily-blurred colour fields
 * drifting behind the content give the surface depth and life without ever
 * competing with it — they are pinned, non-interactive, and pushed far enough
 * down in opacity that text contrast is untouched. The drift is pure CSS so
 * it costs nothing on the main thread, and it stops entirely for anyone who
 * has asked for less motion.
 */
export function Ambient() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-void"
    >
      <div className="ambient-blob ambient-blob-a" />
      <div className="ambient-blob ambient-blob-b" />
      <div className="ambient-blob ambient-blob-c" />
      {/* A faint grid grounds the colour so it reads as a designed surface
          rather than a lava lamp. */}
      <div className="ambient-grid" />
    </div>
  );
}
