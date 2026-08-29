"use client";

import { useState } from "react";
import {
  Container, Box, TextField, Button, Typography, Snackbar, Alert, LinearProgress, Link as MuiLink,
} from "@mui/material";
import NavBar from "./NavBar";

const MAX = 280;

export default function Compose() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const remaining = MAX - text.length;
  const pct = Math.min(100, (text.length / MAX) * 100);
  const over = remaining < 0;

  async function post() {
    setLoading(true);
    try {
      const res = await fetch("/api/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setToast({ ok: true, msg: "Posted!", url: data.url });
      setText("");
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <NavBar />
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
        <Typography variant="h5" sx={{ mb: 3 }}>Compose</Typography>

        <TextField
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What's happening?"
          multiline minRows={5} fullWidth
          error={over}
          sx={{ "& .MuiInputBase-input": { fontSize: 18 } }}
        />

        <LinearProgress
          variant="determinate"
          value={pct}
          color={over ? "error" : pct > 90 ? "warning" : "primary"}
          sx={{ mt: 1.5, borderRadius: 2, height: 6 }}
        />

        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 1.5 }}>
          <Typography variant="body2" color={over ? "error" : "text.secondary"}>
            {remaining} characters left
          </Typography>
          <Button
            variant="contained" size="large"
            onClick={post}
            disabled={loading || !text.trim() || over}
            sx={{ borderRadius: 9999, px: 4 }}
          >
            {loading ? "Posting…" : "Post"}
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 4 }}>
          AI-drafted posts and news reactions land in the{" "}
          <MuiLink href="/drafts" color="primary">approval queue</MuiLink>.
        </Typography>
      </Container>

      <Snackbar
        open={!!toast}
        autoHideDuration={6000}
        onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast && (
          <Alert severity={toast.ok ? "success" : "error"} onClose={() => setToast(null)} variant="filled">
            {toast.msg}{" "}
            {toast.url && (
              <MuiLink href={toast.url} target="_blank" rel="noreferrer" color="inherit" sx={{ textDecoration: "underline" }}>
                view
              </MuiLink>
            )}
          </Alert>
        )}
      </Snackbar>
    </>
  );
}
