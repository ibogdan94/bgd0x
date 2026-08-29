import ThemeRegistry from "./ThemeRegistry";

export const metadata = {
  title: "bgd0x · autoposter",
  description: "Crypto content autoposter for X",
};

export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning>
        <ThemeRegistry>{children}</ThemeRegistry>
      </body>
    </html>
  );
}
