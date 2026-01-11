import { useState } from "react";
import { motion } from "framer-motion";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
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
    <div className="min-h-screen flex flex-col bg-[var(--bg)]">
      <Navbar />

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-16 pb-32">
        {/* Animated Heading */}
        <motion.div
          className="max-w-4xl mx-auto text-center mb-12"
          initial={{ opacity: 0, y: -30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        >
          <h1 className="text-[42px] font-bold text-main mb-6">
            Contact & Support
          </h1>

          <motion.p
            className="text-muted text-lg max-w-2xl mx-auto"
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
            className="surface-80 backdrop-blur-md shadow-2xl rounded-2xl p-8 sm:p-10 space-y-6 border border-token"
          >
            <div>
              <label className="block text-muted font-semibold mb-2">Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full border border-token surface text-main placeholder:text-muted rounded-lg px-4 py-3 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] outline-none transition"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-muted font-semibold mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full border border-token surface text-main placeholder:text-muted rounded-lg px-4 py-3 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] outline-none transition"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-muted font-semibold mb-2">Message</label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                className="w-full border border-token surface text-main placeholder:text-muted rounded-lg px-4 py-3 h-40 focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] outline-none transition resize-none"
                placeholder="Write your message here..."
              />
            </div>

            <motion.button
              type="submit"
              disabled={status === "loading"}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="w-full bg-[var(--primary)] text-inverse px-8 py-3 rounded-lg font-semibold text-lg shadow-md hover:opacity-90 hover:shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {status === "loading" ? "Sending..." : "Send Message"}
            </motion.button>

            {/* Animated feedback messages */}
            {status === "success" && (
              <motion.p
                className="text-emerald-500 font-medium mt-4 text-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}
              >
                Your message has been sent successfully.
              </motion.p>
            )}
            {status === "error" && (
              <motion.p
                className="text-rose-500 font-medium mt-4 text-center"
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

      <Footer />
    </div>
  );
};

export default ContactPage;
