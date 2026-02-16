import emailjs from "@emailjs/browser";

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

function ensureNewsletterConfig() {
  if (!SERVICE_ID || !TEMPLATE_ID || !PUBLIC_KEY) {
    throw new Error("EmailJS newsletter configuration is missing (service/template/public key).");
  }
  return { SERVICE_ID, TEMPLATE_ID, PUBLIC_KEY };
}

export async function sendNewsletterSubscription(email: string, source?: string) {
  const trimmed = email.trim();
  if (!trimmed) {
    throw new Error("Please provide a valid email.");
  }

  const { SERVICE_ID, TEMPLATE_ID, PUBLIC_KEY } = ensureNewsletterConfig();
  const templateParams = {
    email: trimmed,
    subscriber_email: trimmed,
    user_email: trimmed,
    source: source ?? "newsletter",
    timestamp: new Date().toISOString(),
  };
  await emailjs.send(SERVICE_ID, TEMPLATE_ID, templateParams, PUBLIC_KEY);
}
