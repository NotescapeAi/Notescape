import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import React from "react";

const PrivacyPolicy: React.FC = () => {
  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-purple-700 mb-6">Privacy Policy</h1>
        <p className="text-gray-700 mb-4">
          Your privacy is important to us. This Privacy Policy explains how we
          collect, use, and protect your personal information when you use our
          services.
        </p>
        <h2 className="text-xl font-semibold mt-6 mb-2">Information We Collect</h2>
        <p className="text-gray-700 mb-4">
          We may collect information such as your name, email, and usage data to
          provide a better experience.
        </p>
        <h2 className="text-xl font-semibold mt-6 mb-2">How We Use Data</h2>
        <p className="text-gray-700 mb-4">
          Data is used for improving services, providing support, and ensuring
          security of our platform.
        </p>
        <p className="text-gray-700 mt-6">
          If you have questions, please contact us through our{" "}
          <a href="/contact" className="text-purple-600 underline">
            Contact Page
          </a>.
        </p>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;
