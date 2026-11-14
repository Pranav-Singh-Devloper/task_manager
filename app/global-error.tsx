'use client';

const WORDS = {
  title: 'Something went wrong',
  body: "We couldn't show this page. Your meetings are safe. Please try again.",
  again: 'Try again',
};

/** The last safety net: it replaces the whole page, so it cannot rely on anything else loading. */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{ fontFamily: 'system-ui, sans-serif', fontSize: 18, padding: 24, maxWidth: 560 }}
      >
        <h1>{WORDS.title}</h1>
        <p>{WORDS.body}</p>
        <button
          type="button"
          onClick={() => reset()}
          style={{ minHeight: 48, padding: '0 20px', fontSize: 18, fontWeight: 600 }}
        >
          {WORDS.again}
        </button>
      </body>
    </html>
  );
}
