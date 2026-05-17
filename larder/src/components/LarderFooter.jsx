// ============================================================
// LarderFooter — quiet brand sign-off at the bottom of every page
// ============================================================
// Verbatim port of canonical index.html L4961–4970.
// Stateless, no props, no context. Italicised Georgia serif
// matches the LarderBrand wordmark above.
// ============================================================

export default function LarderFooter() {
  return (
    <footer className="mt-3 pb-6 text-center">
      <p className="text-stone-400 text-sm tracking-wide"
         style={{ fontFamily: "Georgia, 'Times New Roman', serif", fontStyle: "italic" }}>
        What's in your kitchen?
      </p>
    </footer>
  );
}
