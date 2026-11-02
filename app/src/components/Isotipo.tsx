interface Props { size?: number; tile?: string; letter?: string; fold?: string; title?: string }

/** Isotipo de PresupuestAR: la P hecha papel, con la esquina doblada. */
export function Isotipo({ size = 36, tile = '#0B2545', letter = '#fff', fold = '#5BB5F0', title }: Props) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" role={title ? 'img' : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <rect width="48" height="48" rx="12" fill={tile} />
      <g transform="translate(24 24) scale(1.14) translate(-25 -24.5)">
        <path d="M14 9H28L36 17V23C36 27.4 32.6 31 28 31H23V40H14Z" fill={letter} stroke={letter} strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M23 19H28C31 19 31 25 28 25H23Z" fill={tile} />
        <path d="M28 9V17H36Z" fill={fold} stroke={fold} strokeWidth="1" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

export function SelloPresupuestar() {
  return (
    <span className="sello"><Isotipo size={16} /><span>Hecho con Presupuest<b>AR</b></span></span>
  )
}
