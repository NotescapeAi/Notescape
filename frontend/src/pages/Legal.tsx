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

