# PresupuestAR

Aplicación web de presupuestos hecha con React, Vite y TypeScript. La app en ejecución usa **Supabase** para autenticación, base de datos, funciones administrativas y archivos de marca.

```text
app/       Frontend React
supabase/  Migraciones SQL, Edge Functions y guía de administración
pb/        PocketBase anterior, conservado como respaldo y origen histórico
```

## Estado de la migración

Los datos de PocketBase ya se importaron a Supabase. La verificación registrada fue de 5 empresas, 10 perfiles (incluido el propietario), 6.279 ítems, 9 clientes, 16 presupuestos, 10 cuentas Auth y 5 logos. PocketBase se conserva intacto como respaldo; no hace falta iniciarlo para desarrollar ni usar la app migrada.

La app usa Supabase en todas sus pantallas activas: inicio de sesión y recuperación de contraseña, catálogo, equipo, clientes y presupuestos; el propietario puede gestionar empresas, marca, usuarios y consultar sus datos. Los roles personalizados permiten asignar permisos por función y las políticas RLS los aplican a los datos por empresa. Las acciones privilegiadas se ejecutan en Edge Functions; la clave de servicio no se expone al navegador.

## Ejecutar localmente

Requisitos: Node.js 20 o superior.

1. Copiá `app/.env.example` a `app/.env.local` y configurá `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. La publishable key puede estar en el frontend; nunca uses la secret/service-role key en variables `VITE_*`.
2. Desde `app/`:

   ```powershell
   npm install
   npm run dev
   ```

3. Abrí `http://localhost:5173`. La raíz muestra el acceso de usuarios; el acceso del propietario está únicamente en `/propietario`.

Para comprobar la versión de producción localmente, ejecutá `npm run build` y luego `npm run preview` dentro de `app/`.

## Supabase

Las migraciones, funciones y pasos de configuración están en [supabase/README.md](./supabase/README.md). La base y los datos ya están en el proyecto Supabase. Si se cambia una Edge Function, hay que desplegarla de nuevo; por ejemplo:

```powershell
npx supabase functions deploy manage-platform --project-ref eqsxzfhpsfaxazzqvnyo
```

No vuelvas a ejecutar el importador PocketBase→Supabase sobre datos existentes. `app/scripts/migrar-pocketbase-a-supabase.mjs` queda como herramienta de migración y puede crear cuentas temporales; no es parte del arranque normal de la app.

## Publicar el frontend

Vercel puede alojar el frontend estático:

1. Subí los cambios del repositorio a GitHub.
2. Importá el repositorio en Vercel y configurá el directorio raíz del proyecto como `app`.
3. Configurá en Vercel `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Después del primer despliegue, agregá el dominio de Vercel a las URLs permitidas de Supabase Auth (Site URL y Redirect URLs), incluyendo el flujo `/restablecer`.
5. Volvé a desplegar y probá el acceso normal y `/propietario`.

El frontend publicado seguirá conectándose al mismo proyecto Supabase. PocketBase no necesita desplegarse para la aplicación migrada; conservá su carpeta y sus datos de respaldo hasta que hayas validado el nuevo sistema.

## Respaldo y secretos

- No borres `pb/pb_data` ni los respaldos hasta validar los flujos principales en producción.
- Los archivos `.env.local` y las credenciales de administración deben permanecer locales e ignorados por Git.
- Las contraseñas temporales de cuentas importadas deben entregarse por un canal privado y cambiarse después del primer acceso.
