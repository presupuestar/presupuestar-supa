import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405)

  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!url || !anonKey || !serviceKey || !authorization) {
    return json({ error: 'La función no está configurada o falta la sesión.' }, 500)
  }

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: authData, error: authError } = await callerClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'La sesión no es válida.' }, 401)

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('company_id, role')
    .eq('user_id', authData.user.id)
    .single()
  if (profileError || profile?.role !== 'admin' || !profile.company_id) {
    return json({ error: 'Solo el administrador de la empresa puede gestionar el equipo.' }, 403)
  }

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, 400)
  }

  const action = payload.action
  const userId = typeof payload.userId === 'string' ? payload.userId : ''
  if (action === 'create') {
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const password = typeof payload.password === 'string' ? payload.password : ''
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72 || !name) {
      return json({ error: 'Revisá el nombre, correo y contraseña (8 a 72 caracteres).' }, 400)
    }

    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { company_id: profile.company_id, role: 'member' },
      user_metadata: { name },
    })
    if (error) return json({ error: error.message }, 400)
    return json({ id: data.user.id })
  }

  if (!userId) return json({ error: 'Falta el identificador del usuario.' }, 400)
  const { data: target, error: targetError } = await adminClient
    .from('profiles')
    .select('company_id,role')
    .eq('user_id', userId)
    .single()
  if (targetError || target.company_id !== profile.company_id || target.role !== 'member') {
    return json({ error: 'No se encontró un empleado de esta empresa.' }, 404)
  }

  if (action === 'delete') {
    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (action === 'reset-password') {
    const password = typeof payload.password === 'string' ? payload.password : ''
    if (password.length < 8 || password.length > 72) {
      return json({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' }, 400)
    }
    const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  return json({ error: 'Acción desconocida.' }, 400)
})
