import { useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { postContact } from "../lib/api"; // ✅ import EmailJS wrapper

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
      await postContact(formData); // ✅ use EmailJS wrapper
      setStatus("success");
      setFormData({ name: "", email: "", message: "" });
    } catch (error) {
      console.error("Contact error:", error);
      setStatus("error");
    }
  };

  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-purple-700 mb-4">Contact & Support</h1>
          <p className="text-gray-700 mb-10 text-lg">
            Need help? Reach out to us and we’ll get back as soon as possible.
          </p>

          <form
            onSubmit={handleSubmit}
            className="bg-white shadow-lg rounded-2xl p-8 space-y-6"
          >
            <div>
              <label className="block text-gray-700 font-medium mb-2">Name</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full border rounded-lg px-4 py-3 focus:ring focus:ring-purple-200"
                placeholder="Enter your name"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-2">Email</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                className="w-full border rounded-lg px-4 py-3 focus:ring focus:ring-purple-200"
                placeholder="Enter your email"
              />
            </div>

            <div>
              <label className="block text-gray-700 font-medium mb-2"></label>
              <textarea
                name="message"
                value={formData.message}
                onChange={handleChange}
                required
                className="w-full border rounded-lg px-4 py-3 h-40 focus:ring focus:ring-purple-200"
                placeholder="Write your message here..."
              />
            </div>

            <button
              type="submit"
              disabled={status === "loading"}
              className="bg-purple-600 text-white px-8 py-3 rounded-lg hover:bg-purple-700 transition disabled:opacity-50 text-lg font-semibold"
            >
              {status === "loading" ? "Sending..." : "Send Message"}
            </button>

            {status === "success" && (
              <p className="text-green-600 mt-4">✅ Your message has been sent!</p>
            )}
            {status === "error" && (
              <p className="text-red-600 mt-4">❌ Something went wrong. Try again.</p>
            )}
          </form>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ContactPage;
