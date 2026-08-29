"use client";

import { useEffect, useRef, useState } from "react";
import {
  Container, Box, Card, CardContent, CardActions, Button, Typography, Chip,
  Snackbar, Alert, Stack, CircularProgress, TextField, IconButton, Tooltip, LinearProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import MovieCreationIcon from "@mui/icons-material/MovieCreation";
import UploadIcon from "@mui/icons-material/Upload";
import NavBar from "../NavBar";

export default function Media() {
  const [media, setMedia] = useState(null);
  const [label, setLabel] = useState("");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(null);
  const [toast, setToast] = useState(null);
  const fileRef = useRef(null);

  async function load() {
    const res = await fetch("/api/media", { cache: "no-store" });
    const data = await res.json();
    setMedia(data.media || []);
  }
  useEffect(() => { load(); }, []);

  // Surface the X re-auth result (redirected back with ?xauth=ok|noscope).
  useEffect(() => {
    const x = new URLSearchParams(window.location.search).get("xauth");
    if (x === "ok") setToast({ ok: true, msg: "X reconnected — video posting enabled ✓" });
    else if (x === "noscope") setToast({ ok: false, msg: "Reconnected, but media.write wasn't granted — re-approve all scopes." });
    if (x) window.history.replaceState({}, "", "/media");
  }, []);

  async function upload(files) {
    if (!files || !files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const fd = new FormData();
        fd.append("file", file);
        if (label) fd.append("label", label);
        const res = await fetch("/api/media", { method: "POST", body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
      }
      setLabel("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
      setToast({ ok: true, msg: `Uploaded ${files.length} image${files.length > 1 ? "s" : ""}` });
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    } finally {
      setUploading(false);
    }
  }

  async function postNow(id) {
    setBusy(id);
    try {
      const res = await fetch(`/api/media/${id}/post`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setToast({ ok: true, msg: "Video posted ✓", url: data.url });
      await load();
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    } finally {
      setBusy(null);
    }
  }

  // Render a preview clip (no post). The result is saved and shown inline.
  async function renderPreview(id) {
    setBusy(id);
    try {
      const res = await fetch(`/api/media/${id}/render`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setToast({ ok: true, msg: "Preview rendered ✓" });
      await load();
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    } finally {
      setBusy(null);
    }
  }

  // Text -> mascot video. The bgd0x mascot art is always the visual reference.
  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch("/api/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: prompt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPrompt("");
      await load();
      setToast({ ok: true, msg: "Mascot clip generated ✓" });
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    } finally {
      setGenerating(false);
    }
  }

  // Queue / unqueue a clip for the weekly post.
  async function toggleQueue(id, queued) {
    setBusy(id);
    try {
      const res = await fetch(`/api/media/${id}/queue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queued }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      await load();
      setToast({ ok: true, msg: queued ? "Queued for the weekly post ✓" : "Removed from weekly queue" });
    } catch (err) {
      setToast({ ok: false, msg: err.message });
    } finally {
      setBusy(null);
    }
  }

  async function remove(id) {
    setBusy(id);
    try {
      await fetch(`/api/media/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <NavBar />
      <Container maxWidth="md" sx={{ py: { xs: 3, sm: 5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
          <Typography variant="h5">Media</Typography>
          <Button size="small" variant="text" href="/api/auth/x/start" sx={{ borderRadius: 9999 }}>
            Reconnect X
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Describe a scene and the bgd0x mascot animates it (FLUX 3 i2v) — the mascot art is always
          the reference, so every clip is on-brand. Queue a clip for the weekly X post, or let the
          weekly job auto-generate one. You can also upload your own image to animate. (First video
          post? Click <b>Reconnect X</b> once to grant media-posting permission.)
        </Typography>

        {/* Generate from text (mascot always the reference) */}
        <Card elevation={0} sx={{ border: "1px solid", borderColor: "divider", mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Generate a mascot clip</Typography>
            <TextField
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the scene, e.g. 'bull shrugs off a red candle and keeps stacking'"
              fullWidth size="small" multiline minRows={2} sx={{ mb: 2 }}
              disabled={generating}
            />
            <Button
              variant="contained" startIcon={<MovieCreationIcon />}
              disabled={generating}
              onClick={generate}
              sx={{ borderRadius: 9999, px: 3 }}
            >
              {generating ? "Generating…" : "Generate mascot clip"}
            </Button>
            {generating && <LinearProgress sx={{ mt: 2, borderRadius: 2 }} />}
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
              ~$0.85 per 5s clip · nothing is posted until you queue it (or the weekly job runs)
            </Typography>
          </CardContent>
        </Card>

        {/* Upload your own image */}
        <Card elevation={0} sx={{ border: "1px dashed", borderColor: "divider", mb: 4 }}>
          <CardContent>
            <TextField
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Optional vibe/context for the caption (e.g. 'bull run', 'WBT to $500')"
              fullWidth size="small" sx={{ mb: 2 }}
            />
            <input
              ref={fileRef}
              type="file" accept="image/*" multiple hidden
              onChange={(e) => upload(Array.from(e.target.files || []))}
            />
            <Button
              variant="outlined" startIcon={<UploadIcon />}
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              sx={{ borderRadius: 9999, px: 3 }}
            >
              {uploading ? "Uploading…" : "Upload image"}
            </Button>
            {uploading && <LinearProgress sx={{ mt: 2, borderRadius: 2 }} />}
          </CardContent>
        </Card>

        {media === null && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}><CircularProgress /></Box>
        )}

        {media !== null && media.length === 0 && (
          <Alert severity="info" variant="outlined">No images yet. Upload a few to feed the video autoposter.</Alert>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" }, gap: 2 }}>
          {(media || []).map((m) => (
            <Card key={m.id} elevation={0} sx={{ border: "1px solid", borderColor: "divider", overflow: "hidden" }}>
              <Box sx={{ position: "relative", aspectRatio: "1 / 1", bgcolor: "action.hover" }}>
                {m.videoKey ? (
                  <video
                    src={`/api/media/${m.id}/video`}
                    poster={`/api/media/${m.id}/image`}
                    controls loop muted playsInline
                    style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000" }}
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/media/${m.id}/image`} alt={m.label || m.id}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
                <Chip
                  label={m.status === "used" ? "posted" : m.status === "queued" ? "queued" : m.status === "preview" ? "preview" : "pending"}
                  size="small"
                  color={m.status === "used" ? "default" : m.status === "queued" ? "primary" : m.status === "preview" ? "warning" : "success"}
                  sx={{ position: "absolute", top: 8, left: 8 }}
                />
              </Box>
              <CardContent sx={{ py: 1 }}>
                {m.caption && <Typography variant="body2" sx={{ mb: 0.5 }}>{m.caption}</Typography>}
                {m.label && <Typography variant="caption" color="text.secondary" display="block" noWrap>{m.label}</Typography>}
                {m.videoUrl && (
                  <Typography variant="caption" color="primary" component="a" href={m.videoUrl} target="_blank" rel="noreferrer">
                    view post ↗
                  </Typography>
                )}
              </CardContent>
              <CardActions sx={{ px: 1.5, pb: 1.5, pt: 0, gap: 1, flexWrap: "wrap" }}>
                <Button
                  size="small" variant="outlined"
                  disabled={busy === m.id}
                  onClick={() => renderPreview(m.id)}
                  sx={{ borderRadius: 9999 }}
                >
                  {busy === m.id ? "Rendering…" : m.videoKey ? "Re-render" : "Preview"}
                </Button>
                {m.videoKey && m.status !== "used" && (
                  <Button
                    size="small"
                    variant={m.status === "queued" ? "contained" : "outlined"}
                    color="primary"
                    disabled={busy === m.id}
                    onClick={() => toggleQueue(m.id, m.status !== "queued")}
                    sx={{ borderRadius: 9999, flexGrow: 1 }}
                  >
                    {m.status === "queued" ? "Queued ✓" : "Queue for weekly"}
                  </Button>
                )}
                <Tooltip title="Render + post to X right now (bypasses the weekly schedule)">
                  <span>
                    <IconButton
                      size="small" color="default"
                      disabled={busy === m.id || m.status === "used"}
                      onClick={() => postNow(m.id)}
                    >
                      <MovieCreationIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title="Delete">
                  <span>
                    <IconButton size="small" color="error" disabled={busy === m.id} onClick={() => remove(m.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </CardActions>
            </Card>
          ))}
        </Box>
      </Container>

      <Snackbar
        open={!!toast} autoHideDuration={6000} onClose={() => setToast(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        {toast && (
          <Alert severity={toast.ok ? "success" : "error"} onClose={() => setToast(null)} variant="filled">
            {toast.msg}{" "}
            {toast.url && (
              <a href={toast.url} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "underline" }}>view</a>
            )}
          </Alert>
        )}
      </Snackbar>
    </>
  );
}
