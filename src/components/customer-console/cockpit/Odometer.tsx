/**
 * Cockpit odometer — the "Total AI Actions · Cumulative" rolling-digit counter.
 * Port of the report's styled digit cells (`.digits/.digit/.comma`). `mini` = the
 * compact cockpit-waist variant.
 */
export type OdometerProps = {
  value: number
  caption?: string
  mini?: boolean
}

export function Odometer({
  value,
  caption = 'Total AI Actions · Cumulative',
  mini = false,
}: OdometerProps) {
  const chars = Math.max(0, Math.round(value)).toLocaleString('en-US').split('')
  return (
    <div className={mini ? 'wodo' : 'odo'}>
      <div className={mini ? 'digits mini' : 'digits'}>
        {chars.map((c, i) =>
          c === ',' ? (
            <div key={i} className="comma">
              ,
            </div>
          ) : (
            <div key={i} className="digit">
              {c}
            </div>
          ),
        )}
      </div>
      <div className="odo-cap">{caption}</div>
    </div>
  )
}
