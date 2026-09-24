import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type TransferPayload = {
  transfer_id?: string
  status?: string
}

type Subscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

const statusTitles: Record<string, string> = {
  DRAFT: 'Transfer baru',
  REQUESTED: 'Transfer menunggu persetujuan',
  APPROVED: 'Transfer disetujui',
  SHIPPED: 'Transfer sedang dikirim',
  RECEIVED: 'Transfer sudah diterima',
  COMPLETED: 'Transfer selesai',
}

const statusMessages: Record<string, string> = {
  DRAFT: 'Transfer baru dibuat dan menunggu dikirim.',
  REQUESTED: 'Transfer menunggu persetujuan.',
  APPROVED: 'Transfer sudah disetujui dan siap diproses.',
  SHIPPED: 'Transfer sedang dikirim ke lokasi tujuan.',
  RECEIVED: 'Transfer sudah diterima dan menunggu finalisasi.',
  COMPLETED: 'Transfer sudah selesai.',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !vapidSubject || !vapidPublicKey || !vapidPrivateKey) {
    return new Response(JSON.stringify({ error: 'Push service is not configured.' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const caller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: userData, error: userError } = await caller.auth.getUser()
  if (userError || !userData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const body = await request.json() as TransferPayload
  if (!body.transfer_id || !body.status || !statusTitles[body.status]) return new Response(JSON.stringify({ error: 'transfer_id and a valid status are required.' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: transfer, error: transferError } = await admin.from('stock_transfers').select('id, source_location_id, destination_location_id').eq('id', body.transfer_id).maybeSingle()
  if (transferError || !transfer) return new Response(JSON.stringify({ error: 'Transfer not found.' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const { data: callerProfile } = await admin.from('profiles').select('role, location_id, active').eq('id', userData.user.id).maybeSingle()
  const canNotify = callerProfile?.active && (callerProfile.role === 'MASTER' || callerProfile.role === 'OWNER' || callerProfile.location_id === transfer.source_location_id || callerProfile.location_id === transfer.destination_location_id)
  if (!canNotify) return new Response(JSON.stringify({ error: 'User is not associated with this transfer.' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const { data: targetProfiles } = await admin.from('profiles').select('id').eq('active', true).or(`location_id.eq.${transfer.source_location_id},location_id.eq.${transfer.destination_location_id},role.in.(MASTER,OWNER)`)
  const targetIds = [...new Set((targetProfiles ?? []).map((profile) => profile.id))]
  if (!targetIds.length) return new Response(JSON.stringify({ sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const { data: subscriptions, error: subscriptionError } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', targetIds)
  if (subscriptionError) return new Response(JSON.stringify({ error: subscriptionError.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)
  const payload = JSON.stringify({ title: statusTitles[body.status], body: statusMessages[body.status], transfer_id: body.transfer_id, status: body.status, url: '/' })
  let sent = 0
  await Promise.all((subscriptions as Subscription[]).map(async (subscription) => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, payload)
      sent += 1
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) await admin.from('push_subscriptions').delete().eq('id', subscription.id)
    }
  }))

  return new Response(JSON.stringify({ sent }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
