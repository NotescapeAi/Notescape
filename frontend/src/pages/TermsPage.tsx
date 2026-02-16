import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import "./TermsPage.css";

const TermsPage = () => {
  return (
    <div className="terms-page">
      <Navbar />
      <main className="terms-content">
        {/* Main Heading */}
        <h1 className="terms-title">Terms & Conditions</h1>

        {/* Intro */}
        <p className="terms-text">
          By using Notescape, you agree to the following terms.
        </p>

        {/* Section: Usage */}
        <h3 className="terms-section-title">Use of the Service</h3>
        <ul className="terms-list">
          <li>Do not misuse or disrupt the platform.</li>
          <li>You are responsible for maintaining your account security.</li>
        </ul>

        {/* Section: Content */}
        <h3 className="terms-section-title">Content</h3>
        <ul className="terms-list">
          <li>You retain ownership of content you upload.</li>
          <li>
            You grant us a license to process it to provide features you request.
          </li>
        </ul>

        {/* Closing */}
        <p className="terms-text">
          These terms may change over time; continued use means you accept any
          updates.
        </p>
      </main>
      <Footer />
    </div>
  );
};

export default TermsPage;
