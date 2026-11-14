import { forwardRef, useId } from 'react'

interface Props {
  etiqueta: string
  ayuda?: string
  accept?: string
  archivo: File | null
  textoBoton?: string
  sinArchivo?: string
  actual?: string
  disabled?: boolean
  onChange: (archivo: File | null) => void
}

/**
 * Selector de archivo en castellano y con el estilo de la app. El control nativo
 * («Choose File / No file chosen») depende del idioma del navegador y no se puede
 * traducir, así que queda oculto y se muestra este botón en su lugar.
 */
export const SelectorArchivo = forwardRef<HTMLInputElement, Props>(function SelectorArchivo(
  { etiqueta, ayuda, accept, archivo, textoBoton = 'Elegir archivo', sinArchivo = 'Ningún archivo elegido', actual, disabled, onChange },
  ref,
) {
  const id = useId()
  return (
    <div className="campo selector-archivo">
      <label htmlFor={id}>{etiqueta}{ayuda && <> <small>{ayuda}</small></>}</label>
      <div className={`selector-archivo-caja${archivo ? ' con-archivo' : ''}`}>
        <label htmlFor={id} className={`btn sec chico${disabled ? ' deshabilitado' : ''}`}>{archivo ? 'Cambiar' : textoBoton}</label>
        <span className="selector-archivo-nombre" title={archivo?.name}>{archivo ? archivo.name : actual || sinArchivo}</span>
        <input
          id={id}
          ref={ref}
          className="sr"
          type="file"
          accept={accept}
          disabled={disabled}
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  )
})
