export function LCARSHeader() {
  return (
    <header className="relative" style={{ backgroundColor: 'var(--lcars-purple)' }}>
      <div
        className="flex items-center justify-center px-4 py-2 sm:py-4"
        style={{ borderRadius: '0 0 0 50px' }}
      >
        <h1
          className="font-bold tracking-wider uppercase text-center leading-tight"
          style={{
            color: '#000',
            fontSize: 'clamp(0.75rem, 4vw, 2.25rem)',
          }}
        >
          United Federation of BSides
        </h1>
      </div>
    </header>
  );
}
