"use client";

import { useEffect, useState } from "react";
import {
  Container, Box, Card, CardContent, CardActions, Button, Typography, Chip,
  Snackbar, Alert, Link as MuiLink, Stack, CircularProgress,
} from "@mui/material";
import NavBar from "../NavBar";

export default function Drafts() {
  const [drafts, setDrafts] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  async function load() {
    const res = await fetch("/api/drafts", { cache: "no-store" });
    const data = await res.json();
    setDrafts(data.drafts || []);
  }
  useEffect(() => { load(); }, []);

  async function act(id, action) {
    setBusy(id);
    try {
      const res = await fetch(`/api/drafts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      if (data.posted) setToast({ ok: true, msg: "Posted ✓", url: data.url });
      else if (data.queued) setToast({ ok: true, msg: "Added to queue ✓" });
      else setToast({ ok: true, msg: "Rejected" });
      await load();
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    } finally {
      setBusy(null);
    }
  }

  const chip = (type, mode) => {
    const color = type === "news" ? "warning" : type === "reply" ? "primary" : "success";
    return (
      <Stack direction="row" spacing={1}>
        <Chip label={type} size="small" color={color} variant="outlined" />
        <Chip label={mode === "now" ? "posts now" : "→ queued"} size="small" variant="outlined" />
      </Stack>
    );
  };

  return (
    <>
      <NavBar />
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
        <Typography variant="h5" sx={{ mb: 3 }}>Approval Queue</Typography>

        {drafts === null && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
        )}

        {drafts !== null && drafts.length === 0 && (
          <Alert severity="info" variant="outlined">
            No pending drafts. Generate some with{" "}
            <code>node --env-file=.env generate.mjs</code> or <code>news.mjs</code>.
          </Alert>
        )}

        <Stack spacing={2}>
          {(drafts || []).map((d) => (
            <Card key={d.id} elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent>
                <Box sx={{ mb: 1.5 }}>{chip(d.type, d.mode)}</Box>
                <Typography sx={{ fontSize: 17, whiteSpace: "pre-wrap" }}>{d.text}</Typography>
                {d.source && (
                  <MuiLink href={d.source} target="_blank" rel="noreferrer" variant="body2" color="text.secondary" sx={{ display: "inline-block", mt: 1 }}>
                    source ↗
                  </MuiLink>
                )}
              </CardContent>
              <CardActions sx={{ px: 2, pb: 2, gap: 1 }}>
                <Button
                  variant="contained" color="success" disabled={busy === d.id}
                  onClick={() => act(d.id, "approve")} sx={{ borderRadius: 9999, color: "#000" }}
                >
                  {busy === d.id ? "…" : d.mode === "now" ? "Approve & post" : "Approve → queue"}
                </Button>
                <Button
                  variant="outlined" color="error" disabled={busy === d.id}
                  onClick={() => act(d.id, "reject")} sx={{ borderRadius: 9999 }}
                >
                  Reject
                </Button>
              </CardActions>
            </Card>
          ))}
        </Stack>
      </Container>

      <Snackbar
        open={!!toast}
        autoHideDuration={5000}
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
