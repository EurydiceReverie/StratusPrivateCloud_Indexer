import { getFolderIcon } from "@/lib/icon-config";

export interface FSItem {
  name: string;
  type: "folder" | "file";
  icon?: string;
  size?: string;
  modified?: string;
  items?: FSItem[];
}

export const fileSystem: FSItem[] = [
  {
    name: "Applications",
    type: "folder",
    icon: getFolderIcon("Applications"),
    modified: "Jan 15, 2026",
    items: [
      { name: "Safari.app", type: "file", size: "142 MB", modified: "Dec 10, 2025" },
      { name: "Mail.app", type: "file", size: "89 MB", modified: "Nov 22, 2025" },
      { name: "Xcode.app", type: "file", size: "12.4 GB", modified: "Jan 8, 2026" },
      { name: "Terminal.app", type: "file", size: "24 MB", modified: "Oct 5, 2025" },
    ],
  },
  {
    name: "Desktop",
    type: "folder",
    icon: getFolderIcon("Desktop"),
    modified: "Feb 18, 2026",
    items: [
      { name: "project-brief.pdf", type: "file", size: "2.4 MB", modified: "Feb 17, 2026" },
      { name: "screenshot.png", type: "file", size: "1.1 MB", modified: "Feb 18, 2026" },
    ],
  },
  {
    name: "Documents",
    type: "folder",
    icon: getFolderIcon("Documents"),
    modified: "Feb 16, 2026",
    items: [
      { name: "Resume.docx", type: "file", size: "48 KB", modified: "Feb 1, 2026" },
      { name: "Finances.xlsx", type: "file", size: "1.2 MB", modified: "Jan 30, 2026" },
      { name: "Notes.txt", type: "file", size: "12 KB", modified: "Feb 14, 2026" },
    ],
  },
  {
    name: "Downloads",
    type: "folder",
    icon: getFolderIcon("Downloads"),
    modified: "Feb 18, 2026",
    items: [
      { name: "installer.dmg", type: "file", size: "450 MB", modified: "Feb 18, 2026" },
      { name: "archive.zip", type: "file", size: "89 MB", modified: "Feb 15, 2026" },
    ],
  },
  {
    name: "Library",
    type: "folder",
    icon: getFolderIcon("Library"),
    modified: "Feb 10, 2026",
    items: [],
  },
  {
    name: "Movies",
    type: "folder",
    icon: getFolderIcon("Movies"),
    modified: "Jan 28, 2026",
    items: [
      { name: "vacation-2025.mp4", type: "file", size: "2.8 GB", modified: "Jan 20, 2026" },
    ],
  },
  {
    name: "Music",
    type: "folder",
    icon: getFolderIcon("Music"),
    modified: "Feb 5, 2026",
    items: [
      { name: "playlist.m3u", type: "file", size: "4 KB", modified: "Feb 5, 2026" },
    ],
  },
  {
    name: "Pictures",
    type: "folder",
    icon: getFolderIcon("Pictures"),
    modified: "Feb 12, 2026",
    items: [
      { name: "photo-001.heic", type: "file", size: "3.2 MB", modified: "Feb 12, 2026" },
      { name: "photo-002.heic", type: "file", size: "2.8 MB", modified: "Feb 11, 2026" },
      { name: "wallpaper.jpg", type: "file", size: "5.6 MB", modified: "Jan 15, 2026" },
    ],
  },
  {
    name: "Sites",
    type: "folder",
    icon: getFolderIcon("Sites"),
    modified: "Dec 20, 2025",
    items: [],
  },
  {
    name: "System",
    type: "folder",
    icon: getFolderIcon("System"),
    modified: "Feb 1, 2026",
    items: [],
  },
  {
    name: "Utilities",
    type: "folder",
    icon: getFolderIcon("Utilities"),
    modified: "Nov 30, 2025",
    items: [],
  },
];

export const storageData = {
  total: "50 GB",
  used: "32.4 GB",
  percentage: 64.8,
  breakdown: [
    { label: "Photos", size: "12.2 GB", percentage: 24.4, color: "hsl(35, 100%, 55%)" },
    { label: "Apps", size: "8.6 GB", percentage: 17.2, color: "hsl(280, 70%, 55%)" },
    { label: "Documents", size: "6.1 GB", percentage: 12.2, color: "hsl(211, 100%, 50%)" },
    { label: "Other", size: "5.5 GB", percentage: 11, color: "hsl(0, 0%, 65%)" },
  ],
};
