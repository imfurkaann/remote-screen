"use client";

import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";

type UploadedMedia = {
  id: string;
  filename: string;
  checksum_sha256: string;
};

type PlaylistRow = {
  id: string;
  name: string;
  version: number;
  item_count: number;
  updated_at: string;
};

type DeviceRow = {
  id: string;
  hardware_id: string;
  status: string;
};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? payload.code ?? "request_failed");
  }
  return payload;
}

export default function PlaylistsPage() {
  const [media, setMedia] = useState<UploadedMedia[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);
  const [playlistName, setPlaylistName] = useState("Main Campaign");
  const [isBusy, setIsBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const sortedMedia = useMemo(() => [...media].sort((a, b) => a.filename.localeCompare(b.filename)), [media]);

  const loadPlaylists = async () => {
    const payload = await fetchJson<{ playlists?: PlaylistRow[] }>("/api/content/playlists", { cache: "no-store" });
    setPlaylists(payload.playlists ?? []);
  };

  const loadDevices = async () => {
    const payload = await fetchJson<{ devices?: DeviceRow[] }>("/api/content/devices", { cache: "no-store" });
    setDevices(payload.devices ?? []);
  };

  useEffect(() => {
    const run = async () => {
      try {
        await Promise.all([loadPlaylists(), loadDevices()]);
      } catch {
        setStatusMessage("Failed to load playlist or device data.");
      }
    };
    run().catch(() => {
      setStatusMessage("Failed to load initial data.");
    });
  }, []);

  const handleFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);

      const payload = await fetchJson<{ media?: UploadedMedia }>("/api/content/media/upload", {
        method: "POST",
        body: form
      });

      if (!payload.media) {
        throw new Error("upload_failed");
      }

      setMedia((prev) => {
        const next = prev.filter((item) => item.id !== payload.media?.id);
        next.push(payload.media as UploadedMedia);
        return next;
      });
      setStatusMessage(`Uploaded ${payload.media.filename}`);
    } catch (error) {
      setStatusMessage(`Upload failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
      event.target.value = "";
    }
  };

  const handleCreatePlaylist = async (event: FormEvent) => {
    event.preventDefault();
    if (!playlistName.trim() || selectedMediaIds.length === 0) {
      setStatusMessage("Playlist name and at least one media item are required.");
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      const items = selectedMediaIds.map((mediaId, index) => ({
        media_id: mediaId,
        duration_ms: 10_000,
        position: index
      }));

      await fetchJson<{ playlist?: { id: string } }>("/api/content/playlists", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: playlistName.trim(), items })
      });

      await loadPlaylists();
      setStatusMessage("Playlist created.");
    } catch (error) {
      setStatusMessage(`Create playlist failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  const handlePublish = async (playlistId: string) => {
    if (selectedDeviceIds.length === 0) {
      setStatusMessage("Select at least one target device before publish.");
      return;
    }

    setIsBusy(true);
    setStatusMessage(null);
    try {
      await fetchJson(`/api/content/playlists/${playlistId}/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ device_ids: selectedDeviceIds })
      });
      await loadPlaylists();
      setStatusMessage("Playlist published and SYNC_CONTENT dispatched.");
    } catch (error) {
      setStatusMessage(`Publish failed: ${(error as Error).message}`);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <section className="card grid" style={{ gap: 16 }}>
      <header>
        <h3 style={{ margin: 0 }}>Playlist Management</h3>
        <p className="muted" style={{ marginBottom: 0 }}>
          Upload media, create playlists, and publish sync payloads to selected devices.
        </p>
      </header>

      <div className="grid" style={{ gap: 8 }}>
        <label className="grid" style={{ maxWidth: 440 }}>
          Upload Media
          <input type="file" accept="image/*,video/*" onChange={handleFileUpload} disabled={isBusy} />
        </label>
        <small className="muted">Uploaded in this session: {media.length}</small>
      </div>

      <form className="grid" style={{ gap: 10 }} onSubmit={handleCreatePlaylist}>
        <label className="grid" style={{ maxWidth: 440 }}>
          Playlist Name
          <input
            name="playlistName"
            placeholder="Morning Campaign"
            value={playlistName}
            onChange={(event) => setPlaylistName(event.target.value)}
            required
          />
        </label>

        <label className="grid">
          Select Media Items
          <select
            multiple
            value={selectedMediaIds}
            onChange={(event) =>
              setSelectedMediaIds(Array.from(event.target.selectedOptions).map((option) => option.value))
            }
            style={{ minHeight: 120 }}
          >
            {sortedMedia.map((item) => (
              <option key={item.id} value={item.id}>
                {item.filename} ({item.id})
              </option>
            ))}
          </select>
        </label>

        <label className="grid">
          Publish Targets (Devices)
          <select
            multiple
            value={selectedDeviceIds}
            onChange={(event) =>
              setSelectedDeviceIds(Array.from(event.target.selectedOptions).map((option) => option.value))
            }
            style={{ minHeight: 120 }}
          >
            {devices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.hardware_id} - {device.status}
              </option>
            ))}
          </select>
        </label>

        <button disabled={isBusy} type="submit">
          Create Playlist
        </button>
      </form>

      {statusMessage ? <small className="muted">{statusMessage}</small> : null}

      <table className="table">
        <thead>
          <tr>
            <th>Playlist ID</th>
            <th>Name</th>
            <th>Items</th>
            <th>Version</th>
            <th>Updated</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {playlists.map((playlist) => (
            <tr key={playlist.id}>
              <td>{playlist.id}</td>
              <td>{playlist.name}</td>
              <td>{playlist.item_count}</td>
              <td>{playlist.version}</td>
              <td>{new Date(playlist.updated_at).toLocaleString()}</td>
              <td className="row">
                <button className="secondary" type="button" onClick={() => handlePublish(playlist.id)}>
                  Publish SYNC
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
