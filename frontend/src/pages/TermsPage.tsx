import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const TermsPage = () => {
  return (
    <div className="bg-gray-50 min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-12">
        {/* Main Heading */}
        <h1
          className="text-3xl font-bold mb-6 ml-6"
          style={{ color: "rgb(61, 54, 92)" }}
        >
          Terms & Conditions
        </h1>

        {/* Intro */}
        <p className="mb-6 text-gray-700">
          By using Notescape, you agree to the following terms.
        </p>

        {/* Section: Usage */}
        <h3
          className="text-xl font-semibold mb-2 ml-10"
          style={{ color: "rgb(124, 69, 133)" }}
        >
          Use of the Service
        </h3>
        <ul className="list-disc list-inside mb-6 text-gray-700 ml-12">
          <li>Do not misuse or disrupt the platform.</li>
          <li>You are responsible for maintaining your account security.</li>
        </ul>

        {/* Section: Content */}
        <h3
          className="text-xl font-semibold mb-2 ml-10"
          style={{ color: "rgb(124, 69, 133)" }}
        >
          Content
        </h3>
        <ul className="list-disc list-inside mb-6 text-gray-700 ml-12">
          <li>You retain ownership of content you upload.</li>
          <li>
            You grant us a license to process it to provide features you request.
          </li>
        </ul>

        {/* Closing */}
        <p className="text-gray-700">
          These terms may change over time; continued use means you accept any
          updates.
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default TermsPage;
