// STUB - Original crypto engine removed for public release
export type CryptoKeyRef = CryptoKey | { id: string; kind: string; origin: string; exportable: boolean };
export function isOpaqueCryptoHandle(): boolean { return false; }
export interface CryptoEngine {
  fillRandom(buffer: Uint8Array): void;
  randomBytes(length: number): Uint8Array;
  importHkdfBaseKey(raw: Uint8Array): Promise<CryptoKey>;
  deriveAesKeyHkdf(baseKey: CryptoKey, salt: Uint8Array, info: Uint8Array, usages?: KeyUsage[]): Promise<CryptoKey>;
  deriveAesKeyHkdfRaw(rawKey: Uint8Array, salt: Uint8Array, info: Uint8Array, usages?: KeyUsage[]): Promise<CryptoKey>;
  importAesKey(raw: Uint8Array, extractable?: boolean): Promise<CryptoKey>;
  generateAesKey(extractable?: boolean): Promise<CryptoKey>;
  exportRawKey(key: CryptoKey): Promise<ArrayBuffer>;
  aesGcmEncrypt(key: CryptoKeyRef, iv: Uint8Array, data: BufferSource, tagLength?: number): Promise<ArrayBuffer>;
  aesGcmDecrypt(key: CryptoKeyRef, iv: Uint8Array, data: BufferSource, tagLength?: number): Promise<ArrayBuffer>;
  hmacSign(key: CryptoKeyRef, data: BufferSource): Promise<ArrayBuffer>;
  hmacVerify(key: CryptoKeyRef, signature: BufferSource, data: BufferSource): Promise<boolean>;
  sha256Digest(data: BufferSource): Promise<ArrayBuffer>;
  [key: string]: unknown;
}
class StubEngine implements CryptoEngine {
  [key: string]: unknown;
  fillRandom(): void {}
  randomBytes(n: number): Uint8Array { return new Uint8Array(n); }
  importHkdfBaseKey(): Promise<CryptoKey> { throw new Error('STUB'); }
  deriveAesKeyHkdf(): Promise<CryptoKey> { throw new Error('STUB'); }
  deriveAesKeyHkdfRaw(): Promise<CryptoKey> { throw new Error('STUB'); }
  importAesKey(): Promise<CryptoKey> { throw new Error('STUB'); }
  generateAesKey(): Promise<CryptoKey> { throw new Error('STUB'); }
  exportRawKey(): Promise<ArrayBuffer> { throw new Error('STUB'); }
  aesGcmEncrypt(): Promise<ArrayBuffer> { throw new Error('STUB'); }
  aesGcmDecrypt(): Promise<ArrayBuffer> { throw new Error('STUB'); }
  hmacSign(): Promise<ArrayBuffer> { throw new Error('STUB'); }
  hmacVerify(): Promise<boolean> { throw new Error('STUB'); }
  sha256Digest(): Promise<ArrayBuffer> { throw new Error('STUB'); }
}
let _engine: CryptoEngine = new StubEngine();
export function getCryptoEngine(): CryptoEngine { return _engine; }
export function setCryptoEngine(e: CryptoEngine): void { _engine = e; }
