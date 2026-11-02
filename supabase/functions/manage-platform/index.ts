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

  const { data: owner, error: ownerError } = await adminClient
    .from('platform_owners')
    .select('user_id')
    .eq('user_id', authData.user.id)
    .maybeSingle()
  if (ownerError || !owner) return json({ error: 'Acceso exclusivo del propietario de la plataforma.' }, 403)

  let payload: Record<string, unknown>
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'El cuerpo de la solicitud no es JSON válido.' }, 400)
  }
  if (payload.action !== 'create-company') return json({ error: 'Acción desconocida.' }, 400)

  const company = payload.company && typeof payload.company === 'object'
    ? payload.company as Record<string, unknown>
    : {}
  const admin = payload.admin && typeof payload.admin === 'object'
    ? payload.admin as Record<string, unknown>
    : {}
  const name = typeof company.name === 'string' ? company.name.trim() : ''
  const email = typeof admin.email === 'string' ? admin.email.trim().toLowerCase() : ''
  const password = typeof admin.password === 'string' ? admin.password : ''
  const adminName = typeof admin.name === 'string' ? admin.name.trim() : ''
  if (!name || !adminName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72) {
    return json({ error: 'Revisá los datos de la empresa y del administrador.' }, 400)
  }

  const { data: companyRow, error: companyError } = await adminClient.from('companies')
    .insert({
      name,
      primary_color: typeof company.primary_color === 'string' ? company.primary_color : '#0B2545',
      accent_color: typeof company.accent_color === 'string' ? company.accent_color : '#5BB5F0',
      show_seal: company.show_seal !== false,
      terms: 'Precios expresados en pesos argentinos.',
      validity_days: 15,
    })
    .select('id')
    .single()
  if (companyError) return json({ error: companyError.message }, 400)

  const { data: userData, error: userError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { company_id: companyRow.id, role: 'admin' },
    user_metadata: { name: adminName },
  })
  if (userError) {
    const { error: rollbackError } = await adminClient.from('companies').delete().eq('id', companyRow.id)
    return json({
      error: userError.message,
      ...(rollbackError ? { warning: `La empresa quedó creada sin administrador: ${rollbackError.message}` } : {}),
    }, 400)
  }
  return json({ companyId: companyRow.id, userId: userData.user.id }, 201)
})
