import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isFlowsEnabled } from '@/lib/flows/feature-flag'
import { listFlowTemplates } from '@/lib/flows/templates'

/**
 * GET /api/flows/templates
 *
 * Returns the static template gallery (slug + name + description +
 * icon hint + node_count) so the New-flow dialog can render cards
 * without bundling the full template payloads client-side. Bodies
 * are fetched only on actual clone via POST /api/flows.
 *
 * 404 to non-beta accounts (matches the rest of the /api/flows
 * surface).
 */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from('profiles')
    .select('beta_features')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!isFlowsEnabled(profile as { beta_features?: string[] | null } | null)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  // Shallow shape so the client gallery doesn't have to know about
  // the full node tree.
  const templates = listFlowTemplates().map((t) => ({
    slug: t.slug,
    name: t.name,
    description: t.description,
    icon: t.icon,
    trigger_type: t.trigger_type,
    node_count: t.nodes.length,
  }))
  return NextResponse.json({ templates })
}
