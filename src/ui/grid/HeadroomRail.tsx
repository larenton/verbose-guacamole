import { RAIL_BREACH, RAIL_CENTRE, RAIL_DEFICIT, RAIL_SURPLUS } from '../scale';

// The headroom rail: a thin band under each person's row, full 30-month width,
// surplus above the centreline and deficit below — a seismograph of the year.

interface RailCellProps {
  headroom: number;
  capacity: number;
  toleranceCeiling: number;
  height: number;
}

function RailCell({ headroom, capacity, toleranceCeiling, height }: RailCellProps) {
  const half = height / 2;
  // Scale magnitude against capacity; a full half-bar = 100% of capacity.
  const ratio = capacity > 0 ? Math.max(-1, Math.min(1, headroom / capacity)) : 0;
  const mag = Math.abs(ratio) * half;

  let colour = RAIL_SURPLUS;
  if (headroom < 0) {
    const overRatio = capacity > 0 ? -headroom / capacity : 0;
    colour = overRatio > toleranceCeiling - 1 + 1e-9 ? RAIL_BREACH : RAIL_DEFICIT;
  }

  const title =
    headroom === 0
      ? 'Exactly full'
      : headroom > 0
        ? `+${round(headroom)} days free`
        : `${round(headroom)} days over`;

  return (
    <td className="border-r border-slate-100 p-0 align-middle" title={title}>
      <div className="relative mx-auto" style={{ height, width: '100%' }}>
        <div
          className="absolute inset-x-0"
          style={{ top: half, height: 1, background: RAIL_CENTRE }}
        />
        {mag > 0.5 && (
          <div
            className="absolute inset-x-[2px] rounded-[1px]"
            style={
              headroom >= 0
                ? { bottom: half, height: mag, background: colour }
                : { top: half, height: mag, background: colour }
            }
          />
        )}
      </div>
    </td>
  );
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

interface HeadroomRailProps {
  cells: { headroom: number; capacity: number }[];
  toleranceCeiling: number;
  height?: number;
  labelColSpan?: number;
}

export function HeadroomRail({
  cells,
  toleranceCeiling,
  height = 18,
}: HeadroomRailProps) {
  return (
    <>
      {cells.map((c, i) => (
        <RailCell
          key={i}
          headroom={c.headroom}
          capacity={c.capacity}
          toleranceCeiling={toleranceCeiling}
          height={height}
        />
      ))}
    </>
  );
}
