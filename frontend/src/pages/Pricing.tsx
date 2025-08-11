const palette = { purple:"#7B5FEF", pink:"#EF5F8B", lime:"#D3EF5F", mint:"#5FEFC3" };

export default function Pricing() {
  return (
    <div style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <header style={{ padding: "64px 24px", background: "#fff" }}>
        <h1 style={{ fontSize: 48, margin: 0, color: "#111" }}>Pricing</h1>
        <p style={{ color: "#555", marginTop: 8 }}>
          Plans are in the oven. Join the waitlist and we’ll ping you.
        </p>
      </header>

      <section style={{
        background: `linear-gradient(90deg, ${palette.purple}, ${palette.pink}, ${palette.lime}, ${palette.mint})`,
        padding: 2
      }}>
        <div style={{ background: "#fff", padding: 32 }}>
          <div style={{
            border: `1px solid ${palette.purple}22`,
            borderRadius: 16, padding: 24, maxWidth: 720, margin: "0 auto"
          }}>
            <h2 style={{ marginTop: 0, color: "#111" }}>Coming Soon</h2>
            
            <form onSubmit={(e)=>e.preventDefault()} style={{ marginTop: 16, display: "flex", gap: 8 }}>
              <input placeholder="your@email.com"
                     style={{ flex: 1, padding: 12, borderRadius: 12, border: "1px solid #ddd" }}/>
              <button style={{
                padding: "12px 16px", borderRadius: 12, border: "none",
                background: palette.purple, color: "#fff", fontWeight: 600, cursor: "pointer"
              }}>Join waitlist</button>
            </form>
            <p style={{ fontSize: 12, color: "#666", marginTop: 8 }}>
              No spam. We’ll only email when pricing goes live.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
