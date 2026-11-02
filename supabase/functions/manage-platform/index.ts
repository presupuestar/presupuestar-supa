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
  if (payload.action === 'update-company') {
    const companyId = typeof payload.companyId === 'string' ? payload.companyId : ''
    const changes = payload.changes && typeof payload.changes === 'object'
      ? payload.changes as Record<string, unknown>
      : {}
    if (!companyId || !Object.keys(changes).length) return json({ error: 'Faltan datos de la empresa.' }, 400)
    const allowed = [
      'name', 'document', 'email', 'phone', 'logo_path', 'title_font_path', 'text_font_path',
      'primary_color', 'accent_color', 'title_font', 'text_font', 'validity_days', 'terms', 'show_seal',
    ]
    const safeChanges = Object.fromEntries(Object.entries(changes).filter(([key]) => allowed.includes(key)))
    if (!Object.keys(safeChanges).length) return json({ error: 'No hay campos válidos para actualizar.' }, 400)
    const { data: updated, error } = await adminClient.from('companies').update(safeChanges)
      .eq('id', companyId).select('id').maybeSingle()
    if (error) return json({ error: error.message }, 400)
    if (!updated) return json({ error: 'No se encontró la empresa.' }, 404)
    return json({ ok: true })
  }

  if (payload.action === 'create-company-user') {
    const companyId = typeof payload.companyId === 'string' ? payload.companyId : ''
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : ''
    const password = typeof payload.password === 'string' ? payload.password : ''
    const name = typeof payload.name === 'string' ? payload.name.trim() : ''
    const role = payload.role === 'admin' ? 'admin' : payload.role === 'member' ? 'member' : ''
    if (!companyId || !name || !role || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 72) {
      return json({ error: 'Revisá los datos del usuario.' }, 400)
    }
    const { data: company, error: companyError } = await adminClient.from('companies')
      .select('id').eq('id', companyId).maybeSingle()
    if (companyError || !company) return json({ error: 'No se encontró la empresa.' }, 404)
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { company_id: companyId, role },
      user_metadata: { name },
    })
    if (error) return json({ error: error.message }, 400)
    return json({ userId: data.user.id }, 201)
  }

  if (payload.action === 'update-role' || payload.action === 'reset-password' || payload.action === 'delete-user') {
    const userId = typeof payload.userId === 'string' ? payload.userId : ''
    if (!userId) return json({ error: 'Falta el identificador del usuario.' }, 400)
    const { data: target, error: targetError } = await adminClient.from('profiles')
      .select('role').eq('user_id', userId).single()
    if (targetError || target.role === 'owner') return json({ error: 'No se encontró el usuario.' }, 404)
    const { data: platformOwner, error: ownerLookupError } = await adminClient.from('platform_owners')
      .select('user_id').eq('user_id', userId).maybeSingle()
    if (ownerLookupError) return json({ error: ownerLookupError.message }, 400)
    if (platformOwner) return json({ error: 'No se puede modificar una cuenta propietaria de la plataforma.' }, 403)

    if (payload.action === 'update-role') {
      if (payload.role !== 'admin' && payload.role !== 'member') return json({ error: 'Rol no válido.' }, 400)
      const { error } = await adminClient.from('profiles').update({ role: payload.role }).eq('user_id', userId)
      if (error) return json({ error: error.message }, 400)
      const { data: authUser, error: authGetError } = await adminClient.auth.admin.getUserById(userId)
      if (authGetError) return json({ error: authGetError.message }, 400)
      const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(userId, {
        app_metadata: { ...authUser.user.app_metadata, role: payload.role },
      })
      if (authUpdateError) return json({ error: authUpdateError.message }, 400)
      return json({ ok: true })
    }

    if (payload.action === 'reset-password') {
      const password = typeof payload.password === 'string' ? payload.password : ''
      if (password.length < 8 || password.length > 72) return json({ error: 'La contraseña debe tener entre 8 y 72 caracteres.' }, 400)
      const { error } = await adminClient.auth.admin.updateUserById(userId, { password })
      if (error) return json({ error: error.message }, 400)
      return json({ ok: true })
    }

    const { error } = await adminClient.auth.admin.deleteUser(userId)
    if (error) return json({ error: error.message }, 400)
    return json({ ok: true })
  }

  if (payload.action === 'delete-company') {
    const companyId = typeof payload.companyId === 'string' ? payload.companyId : ''
    if (!companyId) return json({ error: 'Falta el identificador de la empresa.' }, 400)
    const { data: company, error: companyError } = await adminClient.from('companies')
      .select('id').eq('id', companyId).maybeSingle()
    if (companyError || !company) return json({ error: 'No se encontró la empresa.' }, 404)
    const { data: members, error: membersError } = await adminClient.from('profiles')
      .select('user_id,email').eq('company_id', companyId)
    if (membersError) return json({ error: membersError.message }, 400)
    const bucket = adminClient.storage.from('company-assets')
    const paths: string[] = []
    const collectFiles = async (directory: string): Promise<void> => {
      const pageSize = 100
      let offset = 0
      while (true) {
        const { data: entries, error } = await bucket.list(directory, { limit: pageSize, offset })
        if (error) throw new Error(`No se pudieron revisar los archivos de ${directory}: ${error.message}`)
        for (const entry of entries) {
          const path = `${directory}/${entry.name}`
          if (entry.id) paths.push(path)
          else await collectFiles(path)
        }
        if (entries.length < pageSize) return
        offset += entries.length
      }
    }
    try {
      await collectFiles(companyId)
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'No se pudieron revisar los archivos de la empresa.' }, 400)
    }
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await bucket.remove(paths.slice(offset, offset + 100))
      if (error) return json({ error: `No se pudieron eliminar los archivos de la empresa: ${error.message}` }, 400)
    }
    // Remove company quotes first: their seller_id FK would otherwise update quotes
    // while Auth deletes a user, invoking prepare_quote during the cascade.
    const { error: quotesDeleteError } = await adminClient.from('quotes').delete().eq('company_id', companyId)
    if (quotesDeleteError) return json({ error: `No se pudieron eliminar los presupuestos de la empresa: ${quotesDeleteError.message}` }, 400)

    for (const member of members) {
      const { data: owner, error: ownerLookupError } = await adminClient.from('platform_owners')
        .select('user_id').eq('user_id', member.user_id).maybeSingle()
      if (ownerLookupError) return json({ error: `No se pudo verificar el tipo de cuenta ${member.user_id}: ${ownerLookupError.message}` }, 400)
      if (!owner) {
        const { error } = await adminClient.auth.admin.deleteUser(member.user_id)
        if (error) return json({
          error: `No se pudo eliminar la cuenta ${member.email || member.user_id}: ${error.message}`,
        }, 400)
      }
    }

    const { error: deleteError } = await adminClient.from('companies').delete().eq('id', companyId)
    if (deleteError) return json({ error: deleteError.message }, 400)
    return json({ ok: true })
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
