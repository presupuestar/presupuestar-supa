import type { MouseEvent, PointerEvent } from 'react'

const empezoEnFondo = new WeakSet<EventTarget>()

/**
 * Cierra una ventana (<dialog>) al tocar el fondo oscuro, pero solo si el clic empieza
 * y termina ahí. Si la persona selecciona texto dentro de la ventana (por ejemplo una
 * contraseña) y suelta el mouse afuera, el navegador lo registra como un clic en el
 * fondo: sin este control, la ventana se cerraba y se perdía lo que estaba haciendo.
 */
export function cerrarConFondo(cerrar: () => void) {
  return {
    onPointerDown: (e: PointerEvent<HTMLDialogElement>) => {
      if (e.target === e.currentTarget) empezoEnFondo.add(e.currentTarget)
      else empezoEnFondo.delete(e.currentTarget)
    },
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      const enFondo = e.target === e.currentTarget && empezoEnFondo.has(e.currentTarget)
      empezoEnFondo.delete(e.currentTarget)
      if (enFondo) cerrar()
    },
  }
}
