import { randomUUID } from 'node:crypto';

export type CommsChannel = 'inapp' | 'sms' | 'whatsapp';

export interface SendResult {
  ok: boolean;
  providerMessageId?: string | null;
  error?: string | null;
}

function stubResult(prefix = 'stub'): SendResult {
  return { ok: true, providerMessageId: `${prefix}-${randomUUID()}`, error: null };
}

/** Real SMS via Twilio when TWILIO_* env is present, else console-stub (sent). */
export async function sendSMS(to: string, body: string): Promise<SendResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM ?? process.env.TWILIO_PHONE_NUMBER;
  if (sid && token && from) {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!res.ok) return { ok: false, providerMessageId: null, error: json.message ?? `Twilio SMS failed (${res.status}).` };
      return { ok: true, providerMessageId: json.sid ?? `twilio-${randomUUID()}`, error: null };
    } catch (e) {
      return { ok: false, providerMessageId: null, error: e instanceof Error ? e.message : 'SMS provider error.' };
    }
  }
  console.log(`[comms-stub] SMS to ${to}: ${body.slice(0, 160)}`);
  return stubResult();
}

/** Real WhatsApp via Meta Cloud API when WHATSAPP_* env is present, else console-stub (sent). */
export async function sendWhatsApp(to: string, body: string): Promise<SendResult> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (token && phoneNumberId) {
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        messages?: Array<{ id?: string }>;
        error?: { message?: string };
      };
      if (!res.ok) return { ok: false, providerMessageId: null, error: json.error?.message ?? `WhatsApp send failed (${res.status}).` };
      return { ok: true, providerMessageId: json.messages?.[0]?.id ?? `wa-${randomUUID()}`, error: null };
    } catch (e) {
      return { ok: false, providerMessageId: null, error: e instanceof Error ? e.message : 'WhatsApp provider error.' };
    }
  }
  // Twilio WhatsApp fallback when only TWILIO_* is configured.
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const twToken = process.env.TWILIO_AUTH_TOKEN;
  const waFrom = process.env.TWILIO_WHATSAPP_FROM ?? process.env.WHATSAPP_FROM;
  if (sid && twToken && waFrom) {
    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${twToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: `whatsapp:${to}`, From: `whatsapp:${waFrom}`, Body: body }).toString(),
      });
      const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string };
      if (!res.ok) return { ok: false, providerMessageId: null, error: json.message ?? `Twilio WhatsApp failed (${res.status}).` };
      return { ok: true, providerMessageId: json.sid ?? `twilio-wa-${randomUUID()}`, error: null };
    } catch (e) {
      return { ok: false, providerMessageId: null, error: e instanceof Error ? e.message : 'WhatsApp provider error.' };
    }
  }
  console.log(`[comms-stub] WhatsApp to ${to}: ${body.slice(0, 160)}`);
  return stubResult();
}

/** Channel dispatcher. `inapp` never leaves the server — stub-marked sent. */
export async function deliver(channel: CommsChannel, recipient: string, body: string): Promise<SendResult> {
  if (channel === 'inapp') {
    console.log(`[comms-stub] inapp to ${recipient}: ${body.slice(0, 160)}`);
    return stubResult();
  }
  if (channel === 'whatsapp') return sendWhatsApp(recipient, body);
  return sendSMS(recipient, body);
}
