// src/pages/Landing.tsx
export default function Landing() {
  return (
    <section style={{padding:32}}>
      <h1>Notescape</h1>
      <p>Turn notes into flashcards and quizzes. Upload PDFs/images and study smarter.</p>
      <a href="/signup">Get Started</a>
    </section>
  );
}

// src/pages/Pricing.tsx
export default function Pricing() {
  return (
    <section style={{padding:32}}>
      <h2>Pricing — Coming Soon</h2>
      <form onSubmit={(e)=>{e.preventDefault(); alert("Added to waitlist (stub)");}}>
        <input type="email" placeholder="Email" required />
        <button type="submit">Join Waitlist</button>
      </form>
    </section>
  );
}

// src/pages/Legal.tsx
export default function Legal({ type }: { type:"privacy"|"terms" }) {
  return (
    <section style={{padding:32}}>
      <h2>{type === "privacy" ? "Privacy Policy" : "Terms of Service"}</h2>
      <p>Placeholder legal copy. Replace with real content.</p>
    </section>
  );
}
