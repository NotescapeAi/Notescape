
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const PrivacyPolicy: React.FC = () => {
  return (
    <>
      <Navbar />
      <main className="max-w-4xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>
        <p>Your privacy policy content here...</p>
      </main>
      <Footer />
    </>
  );
};

export default PrivacyPolicy;
