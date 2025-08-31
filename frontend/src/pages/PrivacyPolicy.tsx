import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { motion } from "framer-motion";

const PrivacyPolicy: React.FC = () => {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white text-gray-800">
        <motion.section
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="max-w-4xl mx-auto px-6 py-16"
        >
          {/* Animated Title */}
          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-5xl font-bold mb-8 text-center bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent"
          >
            Privacy Policy
          </motion.h1>

          {/* Paragraphs */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="text-lg leading-relaxed mb-6"
          >
            Your privacy is very important to us. This Privacy Policy explains how we
            collect, use and protect your personal information when you use our
            services.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="text-lg leading-relaxed mb-6"
          >
            We may collect data such as your name, email address, and browsing activity
            to improve your experience. Your information is never sold or shared with
            unauthorized parties.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.6 }}
            className="text-lg leading-relaxed"
          >
            By using our website, you agree to the terms outlined in this Privacy
            Policy. For any questions, feel free to contact our support team.
          </motion.p>
        </motion.section>
      </main>
      <Footer />
    </>
  );
};

export default PrivacyPolicy;
