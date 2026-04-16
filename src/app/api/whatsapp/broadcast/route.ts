import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTemplateMessage } from '@/lib/whatsapp/meta-api'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sanitizePhoneForMeta, isValidE164 } from '@/lib/whatsapp/phone-utils'

interface BroadcastResult {
  phone: string
  status: 'sent' | 'failed'
  whatsapp_message_id?: string
  error?: string
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { phone_numbers, template_name, template_language, template_params } = body

    if (!phone_numbers || !Array.isArray(phone_numbers) || phone_numbers.length === 0) {
      return NextResponse.json(
        { error: 'phone_numbers array is required and must not be empty' },
        { status: 400 }
      )
    }

    if (!template_name) {
      return NextResponse.json(
        { error: 'template_name is required' },
        { status: 400 }
      )
    }

    // Fetch and decrypt WhatsApp config
    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Please set up your WhatsApp integration first.' },
        { status: 400 }
      )
    }

    const accessToken = decrypt(config.access_token)

    const results: BroadcastResult[] = []
    let sentCount = 0
    let failedCount = 0

    for (const phone of phone_numbers) {
      const sanitized = sanitizePhoneForMeta(phone)

      if (!isValidE164(sanitized)) {
        results.push({
          phone,
          status: 'failed',
          error: 'Invalid phone number format',
        })
        failedCount++
        continue
      }

      try {
        const result = await sendTemplateMessage(
          accessToken,
          config.phone_number_id,
          sanitized,
          template_name,
          template_params || [],
          template_language || 'en_US'
        )

        results.push({
          phone,
          status: 'sent',
          whatsapp_message_id: result.messageId,
        })
        sentCount++
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        console.error(`Failed to send broadcast to ${phone}:`, error)
        results.push({
          phone,
          status: 'failed',
          error: errorMessage,
        })
        failedCount++
      }
    }

    return NextResponse.json({
      success: true,
      total: phone_numbers.length,
      sent: sentCount,
      failed: failedCount,
      results,
    })
  } catch (error) {
    console.error('Error in WhatsApp broadcast POST:', error)
    return NextResponse.json(
      { error: 'Failed to process broadcast' },
      { status: 500 }
    )
  }
}
