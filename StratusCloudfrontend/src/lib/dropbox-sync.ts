// STUB - Original dropbox-sync removed for public release
const STRATUS_DIR = '/.stratus';
const FAVORITES_PATH = '/.stratus/favorites.json';
const LINKS_PATH = '/.stratus/links.json';

export async function syncFavoritesToDropbox(): Promise<void> {}
export async function loadFavoritesFromDropbox(): Promise<string[]> { return []; }
export async function syncLinksToDropbox(): Promise<void> {}
export async function loadLinksFromDropbox(): Promise<unknown[]> { return []; }
export async function ensureStratusDir(): Promise<void> {}
