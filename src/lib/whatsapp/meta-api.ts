const META_API_VERSION = 'v21.0'
const META_API_BASE = `https://graph.facebook.com/${META_API_VERSION}`

export interface MetaSendResult {
  messageId: string
}

export interface MetaPhoneInfo {
  id: string
  display_phone_number: string
  verified_name?: string
  quality_rating?: string
}

/**
 * Verify phone number ID with Meta Graph API
 */
export async function verifyPhoneNumber(phoneNumberId: string, accessToken: string): Promise<MetaPhoneInfo> {
  const url = `${META_API_BASE}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error?.message || `Meta API error: ${response.status}`)
  }
  return response.json()
}

/**
 * Send a text message via Meta WhatsApp API
 */
export async function sendTextMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<MetaSendResult> {
  const url = `${META_API_BASE}/${phoneNumberId}/messages`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error?.message || `Meta API error: ${response.status}`)
  }
  const data = await response.json()
  return { messageId: data.messages[0].id }
}

/**
 * Send a template message via Meta WhatsApp API
 */
export async function sendTemplateMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  templateName: string,
  language: string = 'en_US',
  params?: string[]
): Promise<MetaSendResult> {
  const url = `${META_API_BASE}/${phoneNumberId}/messages`

  const template: Record<string, unknown> = {
    name: templateName,
    language: { code: language },
  }

  if (params && params.length > 0) {
    template.components = [{
      type: 'body',
      parameters: params.map(p => ({ type: 'text', text: String(p) })),
    }]
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template,
    }),
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error?.message || `Meta API error: ${response.status}`)
  }
  const data = await response.json()
  return { messageId: data.messages[0].id }
}

/**
 * Get media download URL from Meta
 */
export async function getMediaUrl(mediaId: string, accessToken: string): Promise<{ url: string; mimeType: string }> {
  const response = await fetch(`${META_API_BASE}/${mediaId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    const data = await response.json()
    throw new Error(data.error?.message || `Media fetch failed: ${response.status}`)
  }
  const data = await response.json()
  if (!data.url) throw new Error('Media URL not found')
  return { url: data.url, mimeType: data.mime_type || 'application/octet-stream' }
}

/**
 * Download media binary from Meta CDN
 */
export async function downloadMedia(downloadUrl: string, accessToken: string): Promise<{ buffer: Buffer; contentType: string }> {
  const response = await fetch(downloadUrl, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })
  if (!response.ok) {
    throw new Error(`Media download failed: ${response.status}`)
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream'
  const buffer = Buffer.from(await response.arrayBuffer())
  return { buffer, contentType }
}
