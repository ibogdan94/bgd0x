"use client";

import { AppBar, Toolbar, Typography, Tabs, Tab, IconButton, Box, Tooltip } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { usePathname, useRouter } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();
  const value = pathname.startsWith("/drafts")
    ? "/drafts"
    : pathname.startsWith("/sources")
    ? "/sources"
    : "/";

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <AppBar
      position="sticky"
      color="transparent"
      elevation={0}
      sx={{ borderBottom: "1px solid", borderColor: "divider", backdropFilter: "blur(10px)", background: "rgba(0,0,0,0.6)" }}
    >
      <Toolbar sx={{ gap: { xs: 0.5, sm: 2 } }}>
        <Typography variant="h6" sx={{ fontWeight: 800, letterSpacing: -0.5 }}>
          bgd0x<Box component="span" sx={{ color: "primary.main" }}>.</Box>
        </Typography>
        <Tabs value={value} sx={{ flexGrow: 1, ml: { xs: 0, sm: 1 } }} indicatorColor="primary" textColor="inherit">
          <Tab label="Compose" value="/" href="/" component="a" />
          <Tab label="Sources" value="/sources" href="/sources" component="a" />
          <Tab label="Queue" value="/drafts" href="/drafts" component="a" />
        </Tabs>
        <Tooltip title="Log out">
          <IconButton onClick={logout} color="inherit" edge="end">
            <LogoutIcon />
          </IconButton>
        </Tooltip>
      </Toolbar>
    </AppBar>
  );
}
