# Supabase

Supabase es el backend activo de PresupuestAR: Auth, Postgres con RLS, Storage y Edge Functions. El esquema base está en `migrations/20261102100000_initial_schema.sql`; los perfiles y la secuencia de presupuestos se completan en `migrations/20261102110000_profile_emails.sql`.

## Proyecto y configuración local

La app usa `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` desde `app/.env.local`. Las funciones usan los secretos de entorno que Supabase provee al runtime, incluida `SUPABASE_SERVICE_ROLE_KEY`; esa clave nunca debe copiarse al navegador, al repositorio ni al chat.

El proyecto ya tiene las migraciones, los datos importados y las funciones iniciales desplegadas. No ejecutes de nuevo las migraciones SQL ni `migrate-pocketbase-a-supabase` sobre la base poblada. PocketBase se conserva como respaldo histórico.

## Edge Functions

- `manage-team`: el administrador de empresa crea empleados, restablece sus contraseñas y los elimina.
- `manage-platform`: el propietario crea empresas y usuarios, actualiza datos e identidad visual, administra cuentas de empresa y elimina empresas junto con sus archivos.

Para desplegar una función modificada desde la raíz del repositorio:

```powershell
npx supabase functions deploy manage-platform --project-ref eqsxzfhpsfaxazzqvnyo
npx supabase functions deploy manage-team --project-ref eqsxzfhpsfaxazzqvnyo
```

La versión local de `manage-platform` debe desplegarse para activar las operaciones nuevas del panel del propietario. El código verifica la sesión y el registro en `platform_owners` antes de cualquier operación privilegiada.

## Migración histórica

`app/scripts/migrar-pocketbase-a-supabase.mjs` se conserva para referencia y recuperación excepcional. La importación original se completó y verificó; no volver a ejecutarla contra el proyecto actual. Si en el futuro se prepara otro destino vacío, primero revisar su documentación y usar `--dry-run`; las claves temporales generadas deben distribuirse de forma privada.
