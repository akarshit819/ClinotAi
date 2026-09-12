import { getEnv } from "@/lib/env"

const FROM_EMAIL = process.env.FROM_EMAIL || "billing@clinot.ai"
const APP_URL = getEnv("NEXT_PUBLIC_APP_URL", "https://clinot.ai")

function baseHtml(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f5f6fa">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px">
    <div style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08)">
      <div style="padding:32px 32px 0">
        <img src="${APP_URL}/brand/clinot-logo.png" alt="Clinot" width="72" style="margin-bottom:24px;border-radius:16px" />
        ${content}
      </div>
      <div style="padding:24px 32px;background:#f8f9fb;border-top:1px solid #e8eaee;margin-top:24px">
        <p style="margin:0;font-size:12px;color:#6e7687">Clinot · Healthcare AI Receptionist</p>
        <p style="margin:4px 0 0;font-size:12px;color:#9ca3af">
          <a href="${APP_URL}" style="color:#2463eb;text-decoration:none">${APP_URL}</a>
        </p>
      </div>
    </div>
  </td></tr></table>
</body>
</html>`
}

export function subscriptionStartedEmail(planName: string, clinicName: string): { subject: string; html: string } {
  return {
    subject: `Welcome to Clinot ${planName} — Your subscription is active`,
    html: baseHtml(`
      <h2 style="color:#07090d;font-size:20px;margin:0 0 8px">Welcome to Clinot, ${clinicName}!</h2>
      <p style="color:#55617a;line-height:1.6;margin:0 0 16px">Your <strong>${planName}</strong> subscription is now active. Your AI receptionist is ready to help patients 24/7.</p>
      <a href="${APP_URL}/dashboard" style="display:inline-block;padding:12px 24px;background:#2463eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Go to Dashboard</a>
    `),
  }
}

export function paymentSucceededEmail(amount: number, currency: string, date: string): { subject: string; html: string } {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100)
  return {
    subject: `Payment received — ${formatted}`,
    html: baseHtml(`
      <h2 style="color:#07090d;font-size:20px;margin:0 0 8px">Payment Successful</h2>
      <p style="color:#55617a;line-height:1.6;margin:0 0 8px">We received your payment of <strong>${formatted}</strong> on ${date}.</p>
      <p style="color:#6e7687;font-size:14px;margin:0">Your subscription remains active. No action needed.</p>
    `),
  }
}

export function paymentFailedEmail(amount: number, currency: string): { subject: string; html: string } {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100)
  return {
    subject: `Payment failed — ${formatted}`,
    html: baseHtml(`
      <h2 style="color:#07090d;font-size:20px;margin:0 0 8px">Payment Failed</h2>
      <p style="color:#55617a;line-height:1.6;margin:0 0 16px">We tried to charge <strong>${formatted}</strong> but the payment failed. Stripe will retry automatically.</p>
      <p style="color:#6e7687;font-size:14px;margin:0 0 16px">To avoid interruption, update your payment method:</p>
      <a href="${APP_URL}/dashboard/billing" style="display:inline-block;padding:12px 24px;background:#2463eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">Update Payment Method</a>
    `),
  }
}

export function subscriptionCancelledEmail(planName: string, endDate: string): { subject: string; html: string } {
  return {
    subject: `Your Clinot ${planName} subscription has been cancelled`,
    html: baseHtml(`
      <h2 style="color:#07090d;font-size:20px;margin:0 0 8px">Subscription Cancelled</h2>
      <p style="color:#55617a;line-height:1.6;margin:0 0 16px">Your <strong>${planName}</strong> subscription has been cancelled. You will continue to have access until <strong>${endDate}</strong>.</p>
      <p style="color:#6e7687;font-size:14px;margin:0">If you change your mind, you can reactivate anytime before the end date.</p>
    `),
  }
}

export function subscriptionReactivatedEmail(planName: string): { subject: string; html: string } {
  return {
    subject: `Your Clinot ${planName} subscription has been reactivated`,
    html: baseHtml(`
      <h2 style="color:#07090d;font-size:20px;margin:0 0 8px">Subscription Reactivated</h2>
      <p style="color:#55617a;line-height:1.6;margin:0">Your <strong>${planName}</strong> subscription is active again. Your AI receptionist will continue without interruption.</p>
    `),
  }
}

export function planChangedEmail(oldPlan: string, newPlan: string): { subject: string; html: string } {
  return {
    subject: `Your Clinot plan has changed — ${oldPlan} → ${newPlan}`,
    html: baseHtml(`
      <h2 style="color:#07090d;font-size:20px;margin:0 0 8px">Plan Updated</h2>
      <p style="color:#55617a;line-height:1.6;margin:0">Your plan has been changed from <strong>${oldPlan}</strong> to <strong>${newPlan}</strong>. Your new features and limits are active now.</p>
    `),
  }
}

export function invoiceAvailableEmail(amount: number, currency: string, invoiceUrl: string): { subject: string; html: string } {
  const formatted = new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(amount / 100)
  return {
    subject: `New invoice available — ${formatted}`,
    html: baseHtml(`
      <h2 style="color:#07090d;font-size:20px;margin:0 0 8px">Invoice Available</h2>
      <p style="color:#55617a;line-height:1.6;margin:0 0 16px">Your invoice for <strong>${formatted}</strong> is ready.</p>
      <a href="${invoiceUrl}" style="display:inline-block;padding:12px 24px;background:#2463eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px">View Invoice</a>
    `),
  }
}

export async function sendBillingEmail(
  to: string,
  template: { subject: string; html: string },
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return false

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject: template.subject,
        html: template.html,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
