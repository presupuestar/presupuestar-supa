# Supabase

Supabase es el backend activo de PresupuestAR: Auth, Postgres con RLS, Storage y Edge Functions. El esquema base está en `migrations/20261102100000_initial_schema.sql`; los perfiles y la secuencia de presupuestos se completan en `migrations/20261102110000_profile_emails.sql`; los roles personalizados y sus permisos por función se definen en `migrations/20261102120000_custom_company_roles.sql`.

## Proyecto y configuración local

La app usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` desde `app/.env.local`. Las funciones usan los secretos de entorno que Supabase provee al runtime, incluida `SUPABASE_SERVICE_ROLE_KEY`; esa clave nunca debe copiarse al navegador, al repositorio ni al chat.

El proyecto ya tiene las migraciones iniciales y los datos importados. No vuelvas a ejecutar manualmente las migraciones iniciales ni `migrate-pocketbase-a-supabase` sobre la base poblada. Aplicá las migraciones pendientes con el flujo de Supabase CLI (`supabase db push`) después de vincular el proyecto correcto y revisar el SQL. PocketBase se conserva como respaldo histórico.

Si una base existente no tiene historial de migraciones, no ejecutes `db push` sin revisar primero `npx supabase migration list --remote=eqsxzfhpsfaxazzqvnyo`: podría intentar recrear el esquema inicial sobre datos existentes. Verificá en el SQL Editor que las migraciones base ya estén aplicadas; solo entonces registralas con `npx supabase migration repair 20261102100000 20261102110000 --status applied --remote=eqsxzfhpsfaxazzqvnyo` y aplicá las pendientes con `npx supabase db push --remote=eqsxzfhpsfaxazzqvnyo`.

## Edge Functions

- `manage-team`: el administrador de empresa crea empleados, restablece sus contraseñas y los elimina.
- `manage-platform`: el propietario crea empresas y usuarios, actualiza datos e identidad visual, administra cuentas de empresa y elimina empresas junto con sus archivos.

Los administradores de empresa pueden crear roles personalizados con permisos para catálogo, clientes y presupuestos. La gestión del equipo y de los roles queda reservada al administrador; las políticas RLS aplican los permisos sobre los datos.

Para desplegar una función modificada desde la raíz del repositorio:

```powershell
npx supabase functions deploy manage-platform --project-ref eqsxzfhpsfaxazzqvnyo
npx supabase functions deploy manage-team --project-ref eqsxzfhpsfaxazzqvnyo
```

Volvé a desplegar `manage-team` al cambiar esa función, incluida la asignación de roles de empresa. No despliegues la función con una clave de servicio en el frontend.

La versión local de `manage-platform` debe desplegarse para activar las operaciones nuevas del panel del propietario. El código verifica la sesión y el registro en `platform_owners` antes de cualquier operación privilegiada.

## Migración histórica

`app/scripts/migrar-pocketbase-a-supabase.mjs` se conserva para referencia y recuperación excepcional. La importación original se completó y verificó; no volver a ejecutarla contra el proyecto actual. Si en el futuro se prepara otro destino vacío, primero revisar su documentación y usar `--dry-run`; las claves temporales generadas deben distribuirse de forma privada.
