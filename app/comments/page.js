"use client";

import { useEffect, useState } from "react";
import {
  Container, Box, Card, CardContent, CardActions, Button, Typography, Chip,
  Snackbar, Alert, Link as MuiLink, Stack, CircularProgress, TextField, Divider,
} from "@mui/material";
import NavBar from "../NavBar";

export default function Comments() {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const [newHandle, setNewHandle] = useState("");

  async function load() {
    const res = await fetch("/api/comments", { cache: "no-store" });
    setData(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function act(id, action) {
    setBusy(id);
    try {
      const res = await fetch(`/api/comments/${id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      setToast({ ok: true, msg: d.posted ? "Posted ✓" : "Skipped", url: d.url });
      await load();
    } catch (e) { setToast({ ok: false, msg: e.message }); }
    finally { setBusy(null); }
  }

  async function target(payload) {
    try {
      const res = await fetch("/api/comments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setNewHandle("");
      await load();
    } catch (e) { setToast({ ok: false, msg: e.message }); }
  }

  const planned = (data?.comments || []).filter((c) => c.status === "planned");
  const posted = (data?.comments || []).filter((c) => c.status === "posted");

  return (
    <>
      <NavBar />
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 2 }}>
          <Typography variant="h5">Comments</Typography>
          {data && (
            <Typography variant="body2" color="text.secondary">
              {data.postedToday}/{data.cap} posted today (auto)
            </Typography>
          )}
        </Box>

        {!data && <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>}

        {data && (
          <>
            {/* Watchlist */}
            <Typography variant="overline" color="text.secondary">Watching these profiles</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1, mb: 1.5 }}>
              {data.targets.map((t) => (
                <Chip key={t.id} label={`@${t.handle}`} onDelete={() => target({ removeTarget: t.id })} size="small" variant="outlined" />
              ))}
            </Box>
            <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
              <TextField size="small" placeholder="add @handle" value={newHandle}
                onChange={(e) => setNewHandle(e.target.value)} sx={{ flexGrow: 1 }} />
              <Button variant="outlined" disabled={!newHandle.trim()}
                onClick={() => target({ addTarget: { handle: newHandle } })}>Add</Button>
            </Box>

            <Divider sx={{ mb: 2 }} />

            {/* Planned queue */}
            <Typography variant="overline" color="text.secondary">Planned ({planned.length})</Typography>
            {planned.length === 0 && (
              <Alert severity="info" variant="outlined" sx={{ mt: 1, mb: 2 }}>
                No planned comments yet — the reactor drafts them from the watchlist on its schedule.
              </Alert>
            )}
            <Stack spacing={2} sx={{ mt: 1, mb: 3 }}>
              {planned.map((c) => (
                <Card key={c.id} elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
                  <CardContent>
                    <Chip label={`@${c.handle}`} size="small" color="primary" variant="outlined" sx={{ mb: 1 }} />
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: "italic", mb: 1 }}>
                      “{c.tweetText?.slice(0, 160)}{c.tweetText?.length > 160 ? "…" : ""}”
                    </Typography>
                    <Typography sx={{ fontSize: 16 }}>↳ {c.reply}</Typography>
                  </CardContent>
                  <CardActions sx={{ px: 2, pb: 2, gap: 1 }}>
                    <Button variant="contained" color="success" disabled={busy === c.id}
                      onClick={() => act(c.id, "post")} sx={{ borderRadius: 9999, color: "#000" }}>
                      {busy === c.id ? "…" : "Post now"}
                    </Button>
                    <Button variant="outlined" color="error" disabled={busy === c.id}
                      onClick={() => act(c.id, "skip")} sx={{ borderRadius: 9999 }}>Skip</Button>
                  </CardActions>
                </Card>
              ))}
            </Stack>

            {/* Posted */}
            {posted.length > 0 && (
              <>
                <Typography variant="overline" color="text.secondary">Posted ({posted.length})</Typography>
                <Stack spacing={1} sx={{ mt: 1 }}>
                  {posted.slice(-10).reverse().map((c) => (
                    <Box key={c.id} sx={{ borderLeft: "2px solid", borderColor: "success.main", pl: 1.5 }}>
                      <Typography variant="body2">
                        <b>@{c.handle}</b> ↳ {c.reply}{" "}
                        {c.url && <MuiLink href={c.url} target="_blank" rel="noreferrer">view</MuiLink>}
                      </Typography>
                    </Box>
                  ))}
                </Stack>
              </>
            )}
          </>
        )}
      </Container>

      <Snackbar open={!!toast} autoHideDuration={5000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        {toast && (
          <Alert severity={toast.ok ? "success" : "error"} onClose={() => setToast(null)} variant="filled">
            {toast.msg}{" "}
            {toast.url && <MuiLink href={toast.url} target="_blank" rel="noreferrer" color="inherit" sx={{ textDecoration: "underline" }}>view</MuiLink>}
          </Alert>
        )}
      </Snackbar>
    </>
  );
}
