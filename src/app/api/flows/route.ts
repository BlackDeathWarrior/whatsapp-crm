import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/flows/admin-client'
import { isFlowsEnabled } from '@/lib/flows/feature-flag'

/**
 * GET /api/flows — list the caller's flows.
 * POST /api/flows — create a new (draft) flow.
 *
 * Both endpoints gate on the per-account Flows beta flag. Non-beta
 * accounts get a 404 so the UI / a curious user can't discover the
 * surface ahead of GA.
 */

async function requireFlowsBeta(): Promise<
  | { ok: true; userId: string; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false; status: number; body: { error: string } }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } }
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('beta_features')
    .eq('user_id', user.id)
    .maybeSingle()
  if (
    !isFlowsEnabled(profile as { beta_features?: string[] | null } | null)
  ) {
    // 404 (not 403) so the route looks like it doesn't exist to
    // non-beta accounts — keeps the UI invisible.
    return { ok: false, status: 404, body: { error: 'Not found' } }
  }
  return { ok: true, userId: user.id, supabase }
}

export async function GET() {
  const guard = await requireFlowsBeta()
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status })
  }
  const { supabase } = guard

  const { data, error } = await supabase
    .from('flows')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ flows: data ?? [] })
}

export async function POST(request: Request) {
  const guard = await requireFlowsBeta()
  if (!guard.ok) {
    return NextResponse.json(guard.body, { status: guard.status })
  }
  const { userId } = guard

  const body = (await request.json().catch(() => null)) as
    | {
        name?: string
        description?: string | null
        trigger_type?: 'keyword' | 'first_inbound_message' | 'manual'
        trigger_config?: Record<string, unknown>
      }
    | null
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  const trigger_type = body.trigger_type ?? 'keyword'

  const admin = supabaseAdmin()
  const { data, error } = await admin
    .from('flows')
    .insert({
      user_id: userId,
      name: body.name.trim(),
      description: body.description ?? null,
      status: 'draft',
      trigger_type,
      trigger_config: body.trigger_config ?? {},
    })
    .select()
    .single()
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'insert failed' },
      { status: 500 },
    )
  }
  return NextResponse.json({ flow: data }, { status: 201 })
}
