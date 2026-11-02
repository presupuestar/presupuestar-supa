# Preparación de Supabase

El proyecto todavía usa PocketBase en tiempo de ejecución. Esta carpeta contiene el esquema destino para hacer el cambio con aislamiento por empresa y conservar el panel `/propietario`.

## Crear el proyecto

1. Crear el proyecto Supabase `presupuestar-supa` desde el panel de Supabase.
2. Instalar la CLI de Supabase y autenticarla con la cuenta del propietario.
3. En esta carpeta de trabajo, ejecutar:

   ```powershell
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_REF
   npx supabase db push
   ```

4. En Auth, mantener desactivado el registro público. Las cuentas se crearán desde el panel propietario o el administrador de empresa.
5. Crear/invitar la cuenta inicial del propietario desde Auth. Después, desde el SQL Editor, otorgarle el rol de plataforma:

   ```sql
   insert into public.platform_owners (user_id)
   select id from auth.users where email = 'CORREO_DEL_PROPIETARIO';
   ```

   El correo debe identificar exactamente una cuenta Auth.

## Variables locales

- La app usará `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` en `app/.env.local`.
- Los scripts de administración usarán `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en un `.env` local ignorado por Git. La clave `service_role` nunca debe llevar el prefijo `VITE_`, compartirse por chat ni publicarse.

Los archivos `.env`, `.env.*` locales y `migration_data/` están excluidos de Git.

## Datos de PocketBase

La migración de esquema ya está preparada en `migrations/20261102100000_initial_schema.sql`. Los datos reales todavía no se importaron: hay que conectar el proyecto Supabase, probar una copia de PocketBase y revisar los enlaces de recuperación de las cuentas importadas antes de cambiar la app en producción. Los hashes de contraseña de PocketBase no se pueden reutilizar en Supabase.
