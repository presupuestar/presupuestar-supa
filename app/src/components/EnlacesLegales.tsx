import { useEffect, useRef, useState } from 'react'
import { LEYENDA_FISCAL } from '../lib/legal'

type Documento = 'terminos' | 'privacidad'

export function EnlacesLegales() {
  const [documento, setDocumento] = useState<Documento | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    if (documento && dialog.current && !dialog.current.open) dialog.current.showModal()
  }, [documento])

  return (
    <>
      <p className="enlaces-legales">
        <button type="button" className="link" onClick={() => setDocumento('terminos')}>Términos y condiciones</button>
        <span aria-hidden="true"> · </span>
        <button type="button" className="link" onClick={() => setDocumento('privacidad')}>Política de privacidad</button>
      </p>
      {documento && (
        <dialog
          ref={dialog}
          className="ventana legal"
          aria-labelledby="titulo-legal"
          onClose={() => setDocumento(null)}
          onClick={(event) => { if (event.target === dialog.current) dialog.current?.close() }}
        >
          <div className="form">
            {documento === 'terminos' ? <Terminos /> : <Privacidad />}
            <div className="botones">
              <button type="button" className="btn chico" onClick={() => dialog.current?.close()}>Cerrar</button>
            </div>
          </div>
        </dialog>
      )}
    </>
  )
}

function Terminos() {
  return (
    <>
      <h2 id="titulo-legal">Términos y condiciones</h2>
      <div className="texto-legal">
        <p>PresupuestAR se ofrece <strong>tal como está («as is»)</strong> y según disponibilidad. No garantizamos que el servicio sea ininterrumpido, libre de errores ni apto para un resultado comercial determinado. Cada empresa usuaria es responsable de revisar los importes, plazos y condiciones antes de enviar un presupuesto a su cliente.</p>
        <h3>Deslinde fiscal</h3>
        <p>{LEYENDA_FISCAL}. PresupuestAR no emite facturas ni comprobantes de ARCA (ex AFIP) y no reemplaza las obligaciones de facturación, registración ni conservación documental de la empresa usuaria.</p>
        <h3>Contenido subido por la empresa</h3>
        <p>Los logos, tipografías, nombres comerciales y demás marcas que la empresa carga en su cuenta son contenido suyo. La empresa declara que tiene derecho a usarlos y se obliga a mantener indemne a PresupuestAR frente a reclamos de terceros por infracción de marcas, derechos de autor u otros derechos derivados de ese contenido.</p>
        <p>El propietario de la plataforma administra la cuenta (alta, plan, estado y usuarios). No accede a presupuestos, clientes, catálogo ni montos de las empresas usuarias.</p>
      </div>
    </>
  )
}

function Privacidad() {
  return (
    <>
      <h2 id="titulo-legal">Política de privacidad</h2>
      <div className="texto-legal">
        <p>PresupuestAR trata datos personales conforme a la Ley 25.326 de Protección de Datos Personales. La empresa usuaria es responsable del tratamiento de los datos de sus propios clientes (nombre, contacto, documento y domicilio) que carga para cotizar.</p>
        <p>Esos registros se vinculan solo a la empresa que los creó. El propietario de la plataforma no consulta presupuestos, carteras de clientes ni métricas de negocio de los inquilinos.</p>
        <h3>Supresión y portabilidad</h3>
        <p>La eliminación de un cliente es lógica: el registro deja de mostrarse y no puede usarse en presupuestos nuevos, pero se conserva el vínculo con los presupuestos ya emitidos. Desde Clientes se puede descargar una copia de la cartera y de los presupuestos de la empresa para ejercer la portabilidad de los datos.</p>
        <p>Los datos de cuenta (correo de acceso, plan y estado del servicio) se usan para operar y facturar el servicio. No se venden a terceros.</p>
      </div>
    </>
  )
}
