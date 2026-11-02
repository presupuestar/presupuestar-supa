# PresupuestAR

Sistema de presupuestos: la empresa carga su catálogo una vez y arma cada presupuesto con los datos del cliente.
App en **React + Vite + TypeScript**. PocketBase se conserva como copia de seguridad y origen de datos; la app está pasando a **Supabase**.

```
presupuestar/
├── pb/       PocketBase: origen local y respaldo; no borrar durante la transición
├── supabase/ Esquema, funciones y pasos para Supabase
└── app/      App React: login, tema por empresa, presupuestos y catálogo
```

> **Estado de migración:** los datos ya se importaron a Supabase. Antes de usar la app nueva, aplica las migraciones pendientes de `supabase/migrations/` y despliega las funciones documentadas en [supabase/README.md](./supabase/README.md). Mantén `pb/pb_data` respaldado hasta validar el inicio de sesión y las operaciones en Supabase.

## Primera vez

Necesitás Node 20 o superior.

### 1. PocketBase
1. **En Windows ya viene incluido:** `pb/pocketbase.exe` (v0.40.4, la versión con la que se probó todo). No hace falta descargar nada.
   En Mac o Linux, bajá PocketBase desde https://github.com/pocketbase/pocketbase/releases (v0.40.4) y copiá el ejecutable dentro de `pb/`.
   PocketBase todavía no es 1.0, así que conviene no actualizarlo a mitad de proyecto.
2. (Un solo paso en Mac o Linux) dale permiso de ejecución: `chmod +x pocketbase`.
3. Desde `pb/`, creá tu superusuario (la clave debe tener al menos 10 caracteres) y arrancá el servidor:

```bash
cd pb
./pocketbase superuser upsert tu@correo.com TuClaveSegura
./pocketbase serve
```

En Windows: `.\pocketbase.exe ...`. Al iniciar aplica solo las migraciones. El panel queda en http://127.0.0.1:8090/_/

### 2. Usuario de la app
Cada usuario pertenece a **una empresa**. La forma más rápida es el script (con PocketBase corriendo y desde la carpeta `pb`):

```powershell
$env:PB_SUPER_EMAIL = 'tu-superusuario@correo.com'
$env:PB_SUPER_PASS  = 'TuClaveDeSuperusuario'
node scripts/nueva-empresa.mjs "Nombre de la empresa" usuario@empresa.com "ClaveDelUsuario"
```

Crea la empresa y su primer usuario administrador. También se puede hacer a mano en el panel: **Collections → users → New record**, con correo, contraseña, *verified* tildado, **empresa** y **rol** (`admin` o `miembro`).

La base trae una empresa de ejemplo, "Tu Empresa S.R.L.", con cuatro ítems; si ya tenías datos de antes, quedan asignados a la primera empresa registrada.

### 3. La app
```bash
cd app
npm install
npm run dev
```
Abrí http://localhost:5173 e ingresá con ese usuario.

## Personalizar para una empresa
En el panel, colección **empresa** (un registro por empresa):
- `logo`: imagen SVG, PNG, JPG o WebP.
- `colorPrimario` y `colorAcento`: en formato `#RRGGBB`.
- `fuenteTitulos` y `fuenteTexto`: nombre de una fuente de Google Fonts (por ejemplo `Montserrat`) para la app.
- `fuenteTitulosArchivo` y `fuenteTextoArchivo`: archivo de fuente propio (`.ttf`). **El PDF solo usa esta tipografía si subís el archivo**; si no, usa Poppins, que viene incluida en `app/public/fonts`.
- `validezDias`, `condiciones`, `mostrarSello`.

Los cambios se ven al recargar la app, sin tocar código.

## Varias empresas en un mismo sistema
- **Datos separados:** cada empresa ve solo sus propios usuarios, clientes, ítems y presupuestos. La separación la hace PocketBase en el servidor (reglas de acceso de cada colección), no solo la app: una empresa no puede leer, editar ni borrar datos de otra, ni crear registros a nombre de otra.
- **Numeración propia:** cada empresa tiene su serie de presupuestos (N° 0001, 0002…).
- **Altas:** las empresas las crea solo el propietario (superusuario). Cada empresa tiene un **administrador** que crea a sus propios empleados desde la pantalla **Equipo**. No hay registro público.
- **Roles:** `admin` gestiona el equipo de su empresa (crea empleados, cambia sus contraseñas, los elimina); `miembro` (empleado) arma presupuestos. Los administradores los crea solo el propietario. Nadie puede cambiarse de empresa ni de rol. Los datos y la marca de la empresa los cambia solo el propietario.
- **Marca:** el login es general (aspecto de PresupuestAR). Al ingresar, la app toma el logo, los colores y las tipografías de la empresa del usuario.

## Equipo (administrador de cada empresa)
En el menú **Equipo** (solo lo ve el administrador): crea un empleado con nombre, correo y contraseña inicial (se puede generar una), y la pantalla arma el mensaje con los datos de acceso para copiarlo y mandarlo por WhatsApp. También permite cambiar la contraseña de un empleado y eliminarlo. Cada empleado ingresa desde su computadora y ve solo los datos de su empresa, con su marca.

## Panel del propietario (`/propietario`)
Solo para el superusuario (vos y tu socio): entrá a `http://127.0.0.1:8090/propietario` (o la dirección donde publiques el sistema) con el correo y la clave del superusuario. Muestra todas las empresas con su cantidad de usuarios, clientes, ítems y presupuestos; al abrir una ves todos sus datos por pestañas (**Datos y marca, Usuarios, Clientes, Ítems, Presupuestos**), podés descargar cualquier PDF, cambiar su marca (logo, colores, tipografías, condiciones), crear usuarios, cambiar contraseñas y crear empresas nuevas con su primer administrador. La sesión del propietario es independiente de la de los usuarios de las empresas.

## Publicar para que los empleados ingresen desde sus oficinas
Hoy el sistema corre en tu computadora. Para que cada empleado ingrese desde la suya, hay que ponerlo en un servidor con dirección propia (por ejemplo un VPS con Linux):
1. En `app`, compilá y copiá la app dentro de PocketBase: `npm run build:pb`. PocketBase sirve la app y la API juntas desde `pb/pb_public`.
2. Copiá la carpeta `pb` al servidor con el ejecutable de **Linux** de PocketBase (v0.40.4, desde su página de Releases) en lugar del `.exe`. Incluí `pb_data` si querés llevar tus datos actuales.
3. Apuntá un dominio al servidor y arrancá con HTTPS automático: `./pocketbase serve tudominio.com.ar` (necesita los puertos 80 y 443 abiertos).
4. Dejalo corriendo como servicio (systemd) para que se reinicie solo, y hacé copias de seguridad periódicas de `pb_data`.
5. Al actualizar, copiá también `pb/pb_migrations` al servidor y reiniciá PocketBase para que aplique las migraciones pendientes. La versión actual incluye una migración que asegura el campo `items.moneda`; si el campo no existe, el servidor no puede guardar USD/EUR y la app dejará el ítem pendiente con un error explícito en vez de darlo por aprobado.
6. Opcional: limitá el acceso al panel de PocketBase (`/_/`) desde el servidor web o el firewall, para que solo lo abran vos y tu socio.

Los empleados entran a `https://tudominio.com.ar`; el propietario, a `https://tudominio.com.ar/propietario`.

## Qué incluye cada parte
- **Colecciones:** `empresa`, `items` (catálogo), `clientes`, `presupuestos` y `users`; cada registro lleva el campo `empresa`. Las líneas de cada presupuesto van en un campo JSON `lineas` con ítem, descripción, cantidad, precio unitario y moneda; las líneas convertidas desde USD conservan también el importe y moneda de origen. `itemId: null` = ítem personalizado. El presupuesto guarda la tasa blue y fecha aplicadas cuando corresponde.
- **Hook** (`pb/pb_hooks`): asigna el número correlativo al crear un presupuesto, recalcula el total en el servidor y registra `fechaRespuesta` al aceptar o rechazar.
- **Datos del cliente:** nombre completo, correo electrónico y teléfono son obligatorios para emitir; DNI/CUIT/CUIL y dirección son opcionales y se incluyen en el PDF. El hook descarta campos no admitidos.
- **Catálogo:** cada ítem puede asociarse a un proveedor/mayorista para agrupar y filtrar materiales en el panel interno; el mayorista también se muestra en cada fila. El listado consulta PocketBase en páginas de hasta 30 ítems, con búsqueda y filtros del lado del servidor, sin descargar todo el catálogo para mostrar la pantalla. Se pueden seleccionar varios resultados de distintas páginas para asignarles un proveedor, activarlos, desactivarlos o borrarlos en lote; cada ítem también mantiene sus acciones individuales. El proveedor no se incluye en el PDF. Al armar presupuestos, se puede buscar un ítem del catálogo por nombre; los resultados indican mayorista, precio y moneda. Al seleccionar un ítem USD, el presupuesto ofrece explícitamente mantenerlo en USD o convertirlo a ARS con dólar blue; esto no cambia el precio ni la moneda original guardados en el catálogo, y el presupuesto no permite mezclar monedas en sus líneas. Se pueden importar ítems desde PDF con texto seleccionable; hay que indicar el mayorista y el lector usa encabezados de columnas cuando están disponibles, ignora identificadores/fechas y permite revisar nombre, precio unitario y moneda antes de aprobar la sincronización. La moneda explícita junto al precio prevalece; las filas sin precio se descartan. Los productos con el mismo nombre normalizado pero distinto precio o moneda se agregan como registros separados. Al reimportar, se consultan en páginas de hasta 30 únicamente las coincidencias potenciales del mayorista y nombres importados; una coincidencia de nombre, mayorista e importe corrige también la moneda de registros existentes, incluso si quedó guardada incorrectamente. Los duplicados de igual importe se sincronizan con la moneda del PDF. Los errores muestran el detalle por ítem; los fallidos quedan desmarcados para revisar y se pueden seleccionar todos juntos para reintentarlos. Sin moneda explícita, el precio se interpreta como ARS.
- **Ganancia interna:** cada presupuesto permite anotar una ganancia estimada; el resumen mensual suma la ganancia de presupuestos aceptados. La cifra no aparece en el PDF.
- **Incremento por inflación:** al crear o editar un presupuesto se puede agregar un porcentaje como ítem separado. Se calcula sobre el subtotal actual y se incluye en el total y el PDF; los incrementos adicionales se calculan sobre el subtotal actualizado.
- **Datos de ejemplo:** una empresa y cuatro ítems de catálogo. Borralos o editalos cuando quieras.
- **PDF A4** (`app/src/lib/pdf`): al guardar un presupuesto se genera con la plantilla de la empresa (logo, colores, tipografía, datos del cliente, ítems, total, condiciones y pie con numeración). Si hay muchos ítems sigue en otras hojas repitiendo el encabezado de la tabla. El logo puede ser SVG, PNG, JPG o WebP: se convierte solo.
- **Forma de pago:** se elige en cada presupuesto (50% y 50%, contra entrega, 100% por adelantado, a convenir, etc.) o se escribe una propia con "Otra…". Las opciones de la lista están en `app/src/lib/pagos.ts`. Las condiciones generales que se repiten en todos los PDF (por ejemplo "Precios en pesos argentinos") se editan en la colección *empresa*, campo `condiciones`.
- **Historial** (`/historial`): todos los presupuestos con búsqueda y filtro por estado; descarga del PDF; cambio de estado (borrador → pendiente → aceptado o rechazado, y de vuelta a pendiente si te equivocaste); edición de los borradores y pendientes; y borrado de borradores. Los pendientes que superan su fecha de validez se identifican como caducados. Arriba, el **resumen mensual** (presupuestado, aceptado, ganancia, rechazado, pendiente y conversión); tocar un mes filtra la lista. Los aceptados y rechazados quedan como registro y no se editan.
- **Importes:** se pueden escribir con punto de miles y coma decimal (`150.000`, `1.250,50`). Cada presupuesto usa una sola moneda y la muestra junto a sus importes. Al incorporar un ítem USD a un presupuesto en ARS se consulta el dólar blue venta en DolarApi; cualquier precio se convierte sin excluirlo por su valor y se guarda la cotización y fecha exactas en el presupuesto. Se rechazan cotizaciones inválidas. Si no se puede validar la cotización, el ítem no se agrega. Los presupuestos USD ya existentes no se reconvierten.
- **Capa de datos** (`app/src/lib/repositorio.ts`): las pantallas solo hablan con este archivo.
- **Resumen mensual:** calculado en `repositorio.resumenMensual()`. Conversión = aceptados / enviados del mes (sin borradores).

## Antes de publicar
- No subas `pb/pb_data` ni el ejecutable al repositorio (ya están en `.gitignore`).
- Hacé copia de seguridad de `pb/pb_data`: ahí vive toda la base.
- Para producción, PocketBase necesita un servidor propio; la app se compila con `npm run build`.

## Publicar cambios en PocketHost (Windows)
El proyecto incluye `npm run deploy:pockethost` en `app`, que compila la app y publica hooks, migraciones y archivos web por SFTP con OpenSSH. No copia ni modifica `pb_data`. El `index.html` se envía al final para que no apunte a bundles que todavía no llegaron; al finalizar, reiniciá PocketBase desde PocketHost para cargar hooks y ejecutar migraciones.

1. Guardá en `%USERPROFILE%\.ssh\config` un alias para la conexión SFTP. Usá el host, usuario, puerto y método de autenticación que proporciona PocketHost; no guardes la contraseña en este proyecto. Ejemplo de estructura:
   ```
   Host presupuestar-pockethost
     HostName HOST_SFTP_DE_POCKETHOST
     User USUARIO_SFTP
     Port PUERTO_SFTP
     IdentityFile ~/.ssh/CLAVE_PRIVADA
   ```
   Si la cuenta usa contraseña en vez de clave SSH, OpenSSH puede pedirla en la terminal durante la publicación.
2. Comprobá el alias con `sftp presupuestar-pockethost` y que la carpeta inicial contenga `presupuestar-sy`; salí con `exit`.
3. Desde la carpeta `app`, ejecutá:
   ```
   npm run deploy:pockethost -- presupuestar-pockethost presupuestar-sy
   ```
   El segundo argumento es la carpeta de la instancia dentro de la carpeta inicial SFTP. Si ya iniciás SFTP directamente en la instancia, usá `.` como segundo argumento.

El script conserva en el servidor archivos estáticos antiguos con nombres hash (no los borra) para no afectar despliegues previos ni eliminar contenido ajeno. Los nuevos archivos se transfieren antes del índice. Si SFTP informa un error, el script devuelve el código de fallo y no debe considerarse publicada la versión.

## Migrar los datos locales a PocketHost
Si PocketHost ya tiene las migraciones del proyecto y sus colecciones están vacías, se pueden copiar las empresas, usuarios, ítems, clientes, presupuestos y adjuntos desde la base local sin reemplazar `pb_data`. En Windows, primero podés verificar el inventario sin conectarte al servidor con `node app/scripts/importar-local-a-pockethost.mjs --dry-run`. Después, desde `pb`, ejecutá `.\scripts\migrar-local-a-pockethost.ps1`; pedirá las credenciales del superusuario sin escribir la contraseña en el historial de PowerShell. El importador se detiene si el destino no está vacío o detecta una importación parcial. Los usuarios reciben claves temporales únicas, guardadas en un CSV dentro de Documentos para distribuirlas de forma privada. Conservá ese archivo hasta que todos hayan recibido su clave.

## Próximos pasos
Hecho: login, varias empresas con datos separados, tema por empresa, catálogo y nuevo presupuesto (ítems del catálogo e ítems personalizados con su propio importe).
Hecho también: historial con resumen mensual.
Hecho también: equipo por empresa y panel del propietario.
Queda: publicar el sistema en un servidor.
