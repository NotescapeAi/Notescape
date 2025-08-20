import emailjs from "@emailjs/browser";

const API = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function getHealth() {
  const r = await fetch(`${API}/health`);
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}

export async function getHello() {
  const r = await fetch(`${API}/hello`);
  if (!r.ok) throw new Error(`API error ${r.status}`);
  return r.json();
}

// ---- New: Contact form via EmailJS ----
const SERVICE_ID = "service_wmj4khq";    // ✅ your actual Service ID
const TEMPLATE_ID = "template_i25p8sl";  // ✅ your template ID
const PUBLIC_KEY = "htKmLSqT2hZ5wCAeQ";  // ✅ your EmailJS public key

export async function postContact({
  name,
  email,
  message,
}: {
  name: string;
  email: string;
  message: string;
}) {
  console.log("📨 Sending with:", {
    service: SERVICE_ID,
    template: TEMPLATE_ID,
    publicKey: PUBLIC_KEY,
    params: {
      from_name: name,
      from_email: email,
      message,
    },
  });

  try {
    const res = await emailjs.send(
      SERVICE_ID,
      TEMPLATE_ID,
      {
        from_name: name,
        from_email: email,
        message: message,
        to_email: "notescapeai@gmail.com",
      },
      PUBLIC_KEY
    );

    console.log("✅ EmailJS Success:", res);
    return res;
  } catch (err) {
    console.error("❌ EmailJS Error:", err);
    throw err;
  }
}
