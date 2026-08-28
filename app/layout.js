export const metadata = {
  title: "Twitter Poster",
  description: "Post to X via the API",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          background: "#0f1419",
          color: "#e7e9ea",
        }}
      >
        {children}
      </body>
    </html>
  );
}
