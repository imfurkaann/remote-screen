export type ScreenStatus = "online" | "offline";

export type Screen = {
  id: string;
  name: string;
  location: string;
  status: ScreenStatus;
  lastSeenAt: string;
};

export type Playlist = {
  id: string;
  name: string;
  itemCount: number;
  updatedAt: string;
};

export const MOCK_SCREENS: Screen[] = [
  {
    id: "device-01",
    name: "Front Desk TV",
    location: "Istanbul HQ",
    status: "online",
    lastSeenAt: "2026-04-01T11:20:00Z"
  },
  {
    id: "device-02",
    name: "Cafe Menu",
    location: "Ankara Branch",
    status: "offline",
    lastSeenAt: "2026-04-01T09:02:00Z"
  },
  {
    id: "device-03",
    name: "Waiting Area",
    location: "Izmir Office",
    status: "online",
    lastSeenAt: "2026-04-01T11:18:30Z"
  }
];

export const MOCK_PLAYLISTS: Playlist[] = [
  {
    id: "pl-01",
    name: "Main Promotion Loop",
    itemCount: 6,
    updatedAt: "2026-04-01T10:05:00Z"
  },
  {
    id: "pl-02",
    name: "Corporate Info",
    itemCount: 4,
    updatedAt: "2026-04-01T08:42:00Z"
  }
];

export const REMOTE_COMMANDS = [
  "REBOOT_APP",
  "SCREENSHOT",
  "SET_VOLUME",
  "FORCE_REFRESH"
] as const;

export type RemoteCommand = (typeof REMOTE_COMMANDS)[number];
