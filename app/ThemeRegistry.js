"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v15-appRouter";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#1d9bf0" },
    success: { main: "#00ba7c" },
    warning: { main: "#f7931a" },
    background: { default: "#000000", paper: "#16181c" },
    divider: "#2f3336",
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    h5: { fontWeight: 800, letterSpacing: -0.5 },
    button: { textTransform: "none", fontWeight: 700 },
  },
});

export default function ThemeRegistry({ children }) {
  return (
    <AppRouterCacheProvider options={{ key: "mui" }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
