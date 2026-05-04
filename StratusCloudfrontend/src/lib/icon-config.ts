// Icon configuration for the file system navigator
// Icons are sourced from a GitHub repository via jsDelivr CDN

export const CDN = "https://cdn.jsdelivr.net/gh/Ransomliome360/mcuplfold@main";

// Map specific folder names to their icon files
export const folderIconMap: Record<string, string> = {
  Applications: "Applications.png",
  Desktop: "Desktop.png",
  Documents: "Documents.png",
  Downloads: "Downloads.png",
  Home: "Home Directory.png",
  Library: "Library.png",
  Movies: "Movies.png",
  Music: "Music.png",
  Pictures: "Pictures.png",
  Sites: "Sites.png",
  System: "System.png",
  Users: "Users.png",
  Utilities: "Utilities.png",
};

// Get folder icon URL
export const getFolderIcon = (name: string): string => {
  const iconName = folderIconMap[name] || "Generic Folder.png";
  return `${CDN}/${iconName}`;
};

// For Google Drive folders, use generic folder icon
export const getGoogleDriveFolderIcon = (): string => {
  return `${CDN}/Generic Folder.png`;
};
