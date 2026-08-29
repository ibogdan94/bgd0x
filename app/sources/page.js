"use client";

import { useEffect, useState } from "react";
import {
  Container, Box, Card, CardContent, CardActions, Button, Typography, Chip,
  Snackbar, Alert, Link as MuiLink, Stack, CircularProgress, TextField,
  ToggleButton, ToggleButtonGroup, IconButton, Tooltip,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/Delete";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import NavBar from "../NavBar";

export default function Sources() {
  const [sources, setSources] = useState(null);
  const [type, setType] = useState("rss");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);

  async function load() {
    const res = await fetch("/api/sources", { cache: "no-store" });
    const data = await res.json();
    setSources(data.sources || []);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!value.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, value, label }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setValue(""); setLabel("");
      await load();
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    } finally {
      setAdding(false);
    }
  }

  async function generate(id) {
    setBusy(id);
    try {
      const res = await fetch(`/api/sources/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 5 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setToast({
        ok: true,
        msg: data.added > 0 ? `Cooked ${data.added} degen draft${data.added > 1 ? "s" : ""} → Queue` : "Nothing new to riff on",
        queued: data.added > 0,
      });
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id) {
    setBusy(id);
    try {
      await fetch(`/api/sources/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <NavBar />
      <Container maxWidth="sm" sx={{ py: { xs: 3, sm: 5 } }}>
        <Typography variant="h5" sx={{ mb: 1 }}>Sources</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Where bgd0x pulls signal from. Hit <b>Generate</b> to cook fresh degen takes
          into the <MuiLink href="/drafts" color="primary">Queue</MuiLink>.
        </Typography>

        {/* Add source */}
        <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", mb: 4 }}>
          <CardContent>
            <ToggleButtonGroup
              value={type} exclusive size="small"
              onChange={(_, v) => v && setType(v)}
              sx={{ mb: 2 }}
            >
              <ToggleButton value="rss">RSS / news feed</ToggleButton>
              <ToggleButton value="topic">Topic</ToggleButton>
            </ToggleButtonGroup>

            <TextField
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={type === "rss" ? "https://example.com/feed.xml" : "e.g. memecoin season, ETH ETF, airdrop farming"}
              fullWidth size="small" sx={{ mb: 1.5 }}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <TextField
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              fullWidth size="small" sx={{ mb: 2 }}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <Button
              variant="contained" onClick={add}
              disabled={adding || !value.trim()}
              sx={{ borderRadius: 9999, px: 3 }}
            >
              {adding ? "Adding…" : "Add source"}
            </Button>
          </CardContent>
        </Card>

        {sources === null && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
        )}

        {sources !== null && sources.length === 0 && (
          <Alert severity="info" variant="outlined">
            No sources yet. Add an RSS feed (e.g. a crypto news site&apos;s <code>/feed</code>)
            or a topic to riff on.
          </Alert>
        )}

        <Stack spacing={2}>
          {(sources || []).map((s) => (
            <Card key={s.id} elevation={0} sx={{ border: "1px solid", borderColor: "divider" }}>
              <CardContent sx={{ pb: 1 }}>
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <Chip
                    label={s.type === "rss" ? "rss" : "topic"}
                    size="small" variant="outlined"
                    color={s.type === "rss" ? "warning" : "success"}
                  />
                </Stack>
                <Typography sx={{ fontSize: 16, fontWeight: 600 }}>{s.label}</Typography>
                {s.label !== s.value && (
                  <Typography variant="body2" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                    {s.value}
                  </Typography>
                )}
              </CardContent>
              <CardActions sx={{ px: 2, pb: 2, gap: 1 }}>
                <Button
                  variant="contained" startIcon={busy === s.id ? null : <AutoAwesomeIcon />}
                  disabled={busy === s.id}
                  onClick={() => generate(s.id)}
                  sx={{ borderRadius: 9999 }}
                >
                  {busy === s.id ? "Cooking…" : "Generate"}
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                <Tooltip title="Remove source">
                  <span>
                    <IconButton color="error" disabled={busy === s.id} onClick={() => remove(s.id)}>
                      <DeleteOutlineIcon />
                    </IconButton>
                  </span>
                </Tooltip>
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
            {toast.queued && (
              <MuiLink href="/drafts" color="inherit" sx={{ textDecoration: "underline" }}>
                review
              </MuiLink>
            )}
          </Alert>
        )}
      </Snackbar>
    </>
  );
}
