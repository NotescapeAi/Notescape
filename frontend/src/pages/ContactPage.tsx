import { useState } from "react";
import { motion } from "framer-motion";
import MarketingLayout from "../components/MarketingLayout";
import { postContact } from "../lib/api";

const ContactPage = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    message: "",
  });

  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");

    try {
      await postContact(formData);
      setStatus("success");
      setFormData({ name: "", email: "", message: "" });
    } catch (error) {
      console.error("Contact error:", error);
      setStatus("error");
    }
  };

  return (
    <MarketingLayout className="support-root min-h-screen flex flex-col bg-[var(--bg-page)] text-[var(--text)]">
      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-16 pb-28">
        {/* Animated Heading */}
        <motion.div
          className="max-w-4xl mx-auto text-center mb-12"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h1 className="text-[clamp(2rem,5vw,2.625rem)] font-bold text-[var(--text-main)] mb-6">
            Support
          </h1>

          <motion.p
            className="text-[var(--text-muted)] text-lg max-w-2xl mx-auto leading-relaxed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
          >
            Need help? Fill out the form below and our team will get back to you as soon as possible.
          </motion.p>
        </motion.div>

        {/* Animated Form */}
        <motion.div
          className="max-w-2xl mx-auto"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
        >
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-[var(--shadow-soft)] sm:p-10 space-y-6 dark:shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,var(--shadow-soft)]"
          >
            <div>
              <label className="block text-sm font-semibold text-[var(--text-main)] mb-2">Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-main)] placeholder:text-[var(--placeholder)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--text-main)] mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-main)] placeholder:text-[var(--placeholder)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-[var(--text-main)] mb-2">Message</label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                className="h-40 w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3 text-[var(--text-main)] placeholder:text-[var(--placeholder)] outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--ring)]"
                placeholder="Write your message here..."
              />
            </div>

            <motion.button
              type="submit"
              disabled={status === "loading"}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="w-full rounded-xl bg-[var(--primary)] px-8 py-3 text-lg font-semibold text-[var(--text-inverse)] shadow-[0_8px_22px_rgba(123,95,239,0.28)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 dark:shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            >
              {status === "loading" ? "Sending..." : "Send Message"}
            </motion.button>

            {/* Animated feedback messages */}
            {status === "success" && (
              <motion.p
                className="mt-4 text-center font-medium text-emerald-600 dark:text-emerald-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
              >
                Your message has been sent successfully.
              </motion.p>
            )}
            {status === "error" && (
              <motion.p
                className="mt-4 text-center font-medium text-rose-600 dark:text-rose-400"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
              >
                Something went wrong. Please try again.
              </motion.p>
            )}
          </form>
        </motion.div>
      </main>
    </MarketingLayout>
  );
};

export default ContactPage;
