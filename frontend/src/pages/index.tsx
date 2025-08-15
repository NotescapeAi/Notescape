import React from "react";
import { Link } from "react-router-dom";

export default function IndexPage() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-violet-50 via-white to-mint-50 text-center px-4">
      <h1 className="text-5xl font-bold text-gray-900 mb-4">
        Welcome to Notescape
      </h1>
      <p className="text-lg text-gray-600 max-w-xl mb-6">
        Your all-in-one learning companion — from digitizing notes to AI-generated flashcards.
      </p>
      <div className="flex gap-4">
        <Link
          to="/pricing"
          className="px-6 py-3 rounded-lg bg-violet-600 text-white font-semibold shadow hover:bg-violet-500 transition"
        >
          View Pricing
        </Link>
        <a
          href="#features"
          className="px-6 py-3 rounded-lg bg-gray-200 text-gray-700 font-semibold shadow hover:bg-gray-300 transition"
        >
          Learn More
        </a>
      </div>
    </main>
  );
}
