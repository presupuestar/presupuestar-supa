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

- La app usará `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en `app/.env.local`.
- Los scripts de administración usarán `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en `supabase/.env.local`, ignorado por Git. La clave `service_role`/`secret` nunca debe llevar el prefijo `VITE_`, compartirse por chat ni publicarse.

Los archivos `.env`, `.env.*` locales y `migration_data/` están excluidos de Git.

## Datos de PocketBase

La migración de esquema está en `migrations/20261102100000_initial_schema.sql`. Con PocketBase local ejecutándose y el respaldo de `pb/pb_data` hecho:

1. Ejecutá una vista previa: `cd app; npm run migrate:supabase -- --dry-run`.
2. Solo si los conteos de destino y origen son correctos, confirmá la transferencia: `npm run migrate:supabase -- --apply`.
3. Las cuentas migradas reciben contraseñas temporales aleatorias; se guardan en un CSV local dentro de `Documents`. Entregalas de forma privada y pedí a cada usuario que cambie su contraseña. No se pueden reutilizar los hashes de PocketBase.

Antes de usar la app nueva, aplica también `migrations/20261102110000_profile_emails.sql` desde SQL Editor y despliega las funciones administrativas:

```powershell
npx supabase functions deploy manage-team --project-ref TU_PROJECT_REF
npx supabase functions deploy manage-platform --project-ref TU_PROJECT_REF
```

El importador conserva los datos y archivos originales de PocketBase, verifica que el destino esté vacío antes de empezar y guarda el estado local para poder reanudar una ejecución interrumpida de forma segura.
