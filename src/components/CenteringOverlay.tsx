import type { Centering } from '../domain/centering';

/** Draws the measured card outline and inner frame on top of the photo, in image coordinates. */
export function CenteringOverlay({ c, w, h, compact = false }: { c: Centering; w: number; h: number; compact?: boolean }) {
  const { card, inner, borders } = c;
  const midY = (inner.top + inner.bottom) / 2;
  const midX = (inner.left + inner.right) / 2;
  const fs = Math.max(10, w * 0.022);
  return (
    <svg className="overlay" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <rect x={card.left} y={card.top} width={card.right - card.left} height={card.bottom - card.top} className="ov-card" />
      <rect x={inner.left} y={inner.top} width={inner.right - inner.left} height={inner.bottom - inner.top} className="ov-inner" />
      {!compact && (
        <g className="ov-dims" fontSize={fs}>
          <line x1={card.left} x2={inner.left} y1={midY} y2={midY} />
          <line x1={inner.right} x2={card.right} y1={midY} y2={midY} />
          <line y1={card.top} y2={inner.top} x1={midX} x2={midX} />
          <line y1={inner.bottom} y2={card.bottom} x1={midX} x2={midX} />
          <text x={card.left + 4} y={midY - 8}>{borders.left}px</text>
          <text x={card.right - 4} y={midY - 8} textAnchor="end">{borders.right}px</text>
          <text x={midX + 6} y={card.top + fs}>{borders.top}px</text>
          <text x={midX + 6} y={card.bottom - 6}>{borders.bottom}px</text>
        </g>
      )}
    </svg>
  );
}
