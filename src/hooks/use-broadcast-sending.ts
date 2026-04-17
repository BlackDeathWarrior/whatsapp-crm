'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Contact, MessageTemplate } from '@/types';

interface AudienceConfig {
  type: 'all' | 'tags' | 'csv';
  tagIds?: string[];
  csvContacts?: { phone: string; name?: string }[];
}

interface BroadcastPayload {
  name: string;
  template: MessageTemplate;
  audience: AudienceConfig;
  variables: Record<string, { type: 'static' | 'field'; value: string }>;
}

interface UseBroadcastSendingReturn {
  createAndSendBroadcast: (payload: BroadcastPayload) => Promise<string>;
  isProcessing: boolean;
  progress: number;
}

/**
 * Meta rate-limit buffer. 10 per batch with a 1 s pause matches the
 * spec and keeps us well below Meta's per-phone-number messaging rate
 * so a large broadcast never trips the upstream limiter.
 */
const SEND_BATCH_SIZE = 10;
const SEND_BATCH_DELAY_MS = 1000;

/**
 * `broadcast_recipients` inserts are independent of the send rate —
 * we batch them purely to keep individual Supabase requests small.
 */
const INSERT_BATCH_SIZE = 200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BroadcastApiResult {
  phone: string;
  status: 'sent' | 'failed';
  whatsapp_message_id?: string;
  error?: string;
}

export function useBroadcastSending(): UseBroadcastSendingReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  async function resolveAudience(audience: AudienceConfig): Promise<Contact[]> {
    const supabase = createClient();

    if (audience.type === 'all') {
      const { data, error } = await supabase.from('contacts').select('*');
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      return data ?? [];
    }

    if (audience.type === 'tags' && audience.tagIds && audience.tagIds.length > 0) {
      const { data: contactTags, error: tagError } = await supabase
        .from('contact_tags')
        .select('contact_id')
        .in('tag_id', audience.tagIds);

      if (tagError) throw new Error(`Failed to fetch contact tags: ${tagError.message}`);
      if (!contactTags || contactTags.length === 0) return [];

      const uniqueContactIds = [...new Set(contactTags.map((ct) => ct.contact_id))];

      const { data: contacts, error: contactError } = await supabase
        .from('contacts')
        .select('*')
        .in('id', uniqueContactIds);

      if (contactError) throw new Error(`Failed to fetch contacts: ${contactError.message}`);
      return contacts ?? [];
    }

    if (audience.type === 'csv' && audience.csvContacts) {
      return audience.csvContacts.map((c, i) => ({
        id: `csv-${i}`,
        user_id: '',
        phone: c.phone,
        name: c.name,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));
    }

    return [];
  }

  function resolveVariables(
    variables: Record<string, { type: 'static' | 'field'; value: string }>,
    contact: Contact
  ): string[] {
    // Keys typically are "1","2",... so a numeric-aware sort keeps {{1}}
    // before {{10}}.
    const keys = Object.keys(variables).sort((a, b) => {
      const an = Number(a);
      const bn = Number(b);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return a.localeCompare(b);
    });

    return keys.map((key) => {
      const v = variables[key];
      if (v.type === 'static') return v.value;
      const fieldMap: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      };
      return fieldMap[v.value] ?? '';
    });
  }

  async function createAndSendBroadcast(payload: BroadcastPayload): Promise<string> {
    setIsProcessing(true);
    setProgress(0);

    const supabase = createClient();

    try {
      // ── Step 1: Resolve audience contacts ─────────────────────────
      setProgress(5);
      const contacts = await resolveAudience(payload.audience);

      if (contacts.length === 0) {
        throw new Error('No contacts found for this audience.');
      }

      // ── Step 2: Create broadcast row ──────────────────────────────
      setProgress(10);
      const { data: broadcast, error: broadcastError } = await supabase
        .from('broadcasts')
        .insert({
          name: payload.name,
          template_name: payload.template.name,
          template_language: payload.template.language ?? 'en_US',
          template_variables: payload.variables,
          audience_filter: {
            type: payload.audience.type,
            tagIds: payload.audience.tagIds,
          },
          status: 'sending',
          total_recipients: contacts.length,
          sent_count: 0,
          delivered_count: 0,
          read_count: 0,
          replied_count: 0,
          failed_count: 0,
        })
        .select()
        .single();

      if (broadcastError || !broadcast) {
        throw new Error(`Failed to create broadcast: ${broadcastError?.message}`);
      }

      // ── Step 3: Insert recipient rows (batched for request size) ──
      setProgress(20);
      const recipientRows = contacts.map((contact) => ({
        broadcast_id: broadcast.id,
        contact_id: contact.id,
        status: 'pending' as const,
      }));

      for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
        const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE);
        const { error: recipientError } = await supabase
          .from('broadcast_recipients')
          .insert(batch);

        if (recipientError) {
          console.error('Failed to insert recipient batch:', recipientError);
        }
      }

      // ── Step 4: Fetch recipients (with joined contact) and send ───
      setProgress(30);
      const { data: recipients, error: recipientsFetchError } = await supabase
        .from('broadcast_recipients')
        .select('*, contact:contacts(*)')
        .eq('broadcast_id', broadcast.id);

      if (recipientsFetchError || !recipients) {
        throw new Error('Failed to fetch broadcast recipients');
      }

      let sentCount = 0;
      let failedCount = 0;
      const totalRecipients = recipients.length;

      for (let i = 0; i < recipients.length; i += SEND_BATCH_SIZE) {
        const batch = recipients.slice(i, i + SEND_BATCH_SIZE);

        // Build per-recipient payload so each contact gets *their own*
        // personalization. Previous impl shipped templateParams[0] for
        // the whole batch which was a correctness bug.
        const apiRecipients = batch
          .filter((r) => r.contact?.phone)
          .map((r) => ({
            phone: r.contact!.phone as string,
            params: r.contact ? resolveVariables(payload.variables, r.contact) : [],
          }));

        if (apiRecipients.length === 0) continue;

        try {
          const res = await fetch('/api/whatsapp/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              recipients: apiRecipients,
              template_name: payload.template.name,
              template_language: payload.template.language ?? 'en_US',
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            throw new Error(data.error || 'Broadcast API request failed');
          }

          // The API returns one entry per input recipient in order.
          // Map by phone to be defensive against any reordering.
          const resultsByPhone = new Map<string, BroadcastApiResult>();
          for (const r of (data.results ?? []) as BroadcastApiResult[]) {
            resultsByPhone.set(r.phone, r);
          }

          for (const recipient of batch) {
            const phone = recipient.contact?.phone;
            const result = phone ? resultsByPhone.get(phone) : undefined;

            if (!result) {
              // No result for this phone — the API skipped it (most
              // likely because contact.phone was missing). Mark failed.
              failedCount++;
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'failed',
                  error_message: 'No phone number on contact',
                })
                .eq('id', recipient.id);
              continue;
            }

            if (result.status === 'sent') {
              sentCount++;
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'sent',
                  sent_at: new Date().toISOString(),
                  whatsapp_message_id: result.whatsapp_message_id ?? null,
                  error_message: null,
                })
                .eq('id', recipient.id);
            } else {
              failedCount++;
              await supabase
                .from('broadcast_recipients')
                .update({
                  status: 'failed',
                  error_message: result.error ?? 'Unknown error',
                })
                .eq('id', recipient.id);
            }
          }
        } catch (err) {
          // Network / 500 — mark the whole batch failed. Trigger
          // re-aggregates counts on the parent broadcast.
          for (const recipient of batch) {
            failedCount++;
            await supabase
              .from('broadcast_recipients')
              .update({
                status: 'failed',
                error_message: err instanceof Error ? err.message : 'Unknown error',
              })
              .eq('id', recipient.id);
          }
        }

        // Progress reflects the send phase (30% → 95%).
        const progressPct =
          30 + Math.round(((i + batch.length) / totalRecipients) * 60);
        setProgress(progressPct);

        // Space successive batches by 1 s to stay under Meta's rate
        // limit. Skip the delay after the last batch so we don't pad
        // the tail of the run.
        if (i + SEND_BATCH_SIZE < recipients.length) {
          await sleep(SEND_BATCH_DELAY_MS);
        }
      }

      // ── Step 5: Finalize broadcast status ─────────────────────────
      // Aggregate counts are maintained by the DB trigger (migration
      // 003), so we only update `status` here. sent_count etc. are
      // already accurate.
      setProgress(95);
      const finalStatus = failedCount === totalRecipients ? 'failed' : 'sent';
      await supabase
        .from('broadcasts')
        .update({ status: finalStatus })
        .eq('id', broadcast.id);

      setProgress(100);
      // Unused locals intentionally kept for clarity at return site:
      void sentCount;

      return broadcast.id;
    } finally {
      setIsProcessing(false);
    }
  }

  return { createAndSendBroadcast, isProcessing, progress };
}
