import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getVaultRoutePath } from '@/lib/app-mode';
import { Vault, listVaults, setVaultCache, addVaultToCache, removeVaultFromCache, setActiveVaultId, getActiveVaultId, saveVaultAccess } from '@/lib/vault-manager';
import { measurePasswordStrength } from '@/lib/crypto';
import { Lock, Unlock, Plus, Trash2, Key, Eye, EyeOff, X, AlertCircle, ChevronLeft, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logActivity } from '@/lib/activity-logger';
import { loadVaultsFromDropbox, saveVaultsToDropbox, loadVaultAuditFromDropbox, saveVaultAuditToDropbox, saveVaultEmergencyBackupToDropbox, loadVaultEmergencyBackupFromDropbox, listFolder, downloadFile, createFolder } from '@/services/dropbox-service';
import { uploadFileOverwrite } from '@/services/uploadService';
// Disabled on request: integrity anchor reset kept as reference only.
// import { clearVaultIntegrityAnchor } from '@/lib/vault-integrity';

interface VaultDialogProps {
  open: boolean;
  onClose: () => void;
  onVaultUnlocked: (vaultId: string) => void;
}

type VaultView = 'list' | 'create' | 'unlock' | 'recovery' | 'recoverAccess' | 'changePassword' | 'restoreBackup';

export const VaultDialog: React.FC<VaultDialogProps> = ({ open, onClose, onVaultUnlocked }) => {
  const navigate = useNavigate();
  const [reencryptProgress, setReencryptProgress] = useState<{ current: number; total: number; currentPath: string; phase: string } | null>(null);
  const { pathname } = useLocation();
  const vaultRoutePath = getVaultRoutePath(pathname);
  const [view, setView] = useState<VaultView>('list');
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loadingVaults, setLoadingVaults] = useState(false);
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null);
  const [newName, setNewName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [nextConfirmPassword, setNextConfirmPassword] = useState('');
  const [vaultFormat, setVaultFormat] = useState<3 | 4 | 5 | 7 | 8 | 9>(7);
  const [v8CipherAlg, setV8CipherAlg] = useState<'aes-256-gcm-siv' | 'xchacha20-poly1305'>('aes-256-gcm-siv');
  const [passwordHint, setPasswordHint] = useState('');
  const [backupPassphrase, setBackupPassphrase] = useState('');
  const [confirmBackupPassphrase, setConfirmBackupPassphrase] = useState('');
  const [backupRestorePassphrase, setBackupRestorePassphrase] = useState('');
  const [importedBackupContent, setImportedBackupContent] = useState<string | null>(null);
  const [importedBackupName, setImportedBackupName] = useState<string>('');
  const [showPass, setShowPass] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryKitData, setRecoveryKitData] = useState<{ vaultId: string; vaultName: string; createdAt: number; cryptoVersion: number; recoveryKey: string; passwordHint?: string } | null>(null);
  const [emergencyBackupSaved, setEmergencyBackupSaved] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<null | 'create' | 'unlock' | 'recovery' | 'restore' | 'changePassword'>(null);

  React.useEffect(() => {
    if (!open) return;
    setView('list');
    setError('');
    // Show cached vaults immediately while we reload from Dropbox
    setVaults(listVaults());
    setLoadingVaults(true);
    loadVaultsFromDropbox().then(loaded => {
      const asVaults = loaded as Vault[];
      setVaultCache(asVaults);
      setVaults(asVaults);
    }).catch(() => {
      // fallback: use whatever is in cache
      setVaults(listVaults());
    }).finally(() => setLoadingVaults(false));
  }, [open]);

  if (!open) return null;

  const strength = measurePasswordStrength(password);
  const strengthBars = [0, 1, 2, 3].map(i => i < strength.score);

  const reset = () => {
    setPassword('');
    setConfirmPassword('');
    setNewName('');
    setUnlockPassword('');
    setRecoveryInput('');
    setNextPassword('');
    setNextConfirmPassword('');
    setVaultFormat(7); // default to v7 on reset
    setPasswordHint('');
    setBackupPassphrase('');
    setConfirmBackupPassphrase('');
    setBackupRestorePassphrase('');
    setImportedBackupContent(null);
    setImportedBackupName('');
    setRecoveryKey('');
    setRecoveryKitData(null);
    setEmergencyBackupSaved(false);
    setShowPass(false);
    setError('');
    setActionLoading(null);
  };

  const persistVaultRecord = async (updatedVault: Vault) => {
    addVaultToCache(updatedVault);
    await saveVaultsToDropbox(listVaults());
    setVaults(listVaults());
    if (selectedVault?.id === updatedVault.id) setSelectedVault(updatedVault);
  };

  const randomSalt = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));

  const listVaultBlobPaths = async (rootPath: string): Promise<string[]> => {
    const entries = await listFolder(rootPath);
    const nested = await Promise.all(entries.filter(e => e.isFolder).map(e => listVaultBlobPaths(e.path)));
    return [
      ...entries.filter(e => !e.isFolder && e.path.toLowerCase().endsWith('.vault')).map(e => e.path),
      ...nested.flat(),
    ];
  };

  const resolveVaultKeySalt = async (vault: Vault, knownPaths?: string[]): Promise<{ salt: string; filePaths: string[] }> => {
    const filePaths = knownPaths ?? await listVaultBlobPaths(vault.dropboxFolder);
    if (vault.keySalt) return { salt: vault.keySalt, filePaths };
    if (filePaths.length > 0) {
      try {
        const blob = await downloadFile(filePaths[0]);
        const meta = JSON.parse(await blob.text()) as { salt?: string };
        if (typeof meta.salt === 'string' && meta.salt) return { salt: meta.salt, filePaths };
      } catch { /* ignore and fall back */ }
    }
    return { salt: randomSalt(), filePaths };
  };

  const reencryptV3Vault = async (
    vault: Vault,
    oldMasterBytes: Uint8Array,
    newPasswordValue: string,
    onProgress?: (update: { current: number; total: number; currentPath: string; phase: string }) => void
  ): Promise<{ updatedVault: Vault; masterBytes: Uint8Array; recoveryKey: string }> => {
    const { decryptVaultFile, encryptFileV3 } = await import('@/lib/crypto');
    const { getOrDeriveArgon2Batch, createPasswordPacket, createRecoveryPacket, decryptAuditLog, createEmptyAuditLog, appendAuditEntry } = await import('@/lib/vault-crypto-advanced');

    const filePaths = await listVaultBlobPaths(vault.dropboxFolder);
    const overwritten: Array<{ path: string; blob: Blob }> = [];
    const newSalt = randomSalt();
    const newMasterBytes = await getOrDeriveArgon2Batch(newPasswordValue, newSalt, vault.id);

    try {
      for (let index = 0; index < filePaths.length; index++) {
        const path = filePaths[index];
        onProgress?.({ current: index + 1, total: filePaths.length, currentPath: path, phase: 're-encrypting files' });
        const oldBlob = await downloadFile(path);
        const { data, originalName } = await decryptVaultFile(oldBlob, oldMasterBytes, vault.id);
        const plainFile = new File([data], originalName, { type: 'application/octet-stream' });
        const newBlob = await encryptFileV3(plainFile, newMasterBytes, vault.id, newSalt);
        const fileName = path.split('/').pop() || 'file.vault';
        let overwriteError: string | null = null;
        await uploadFileOverwrite(new File([newBlob], fileName, { type: 'application/octet-stream' }), path, {
          onError: msg => { overwriteError = msg; },
        });
        if (overwriteError) throw new Error(`Failed on ${fileName}: ${overwriteError}`);
        overwritten.push({ path, blob: oldBlob });
      }
    } catch (err) {
      for (const item of overwritten.reverse()) {
        try {
          const fileName = item.path.split('/').pop() || 'file.vault';
          await uploadFileOverwrite(new File([item.blob], fileName, { type: 'application/octet-stream' }), item.path);
        } catch { /* best-effort rollback */ }
      }
      throw err;
    }

    onProgress?.({ current: filePaths.length, total: filePaths.length, currentPath: '', phase: 'finalizing vault metadata' });
    const passwordPacket = await createPasswordPacket(newMasterBytes, newPasswordValue);
    const { packet, recoveryKey } = await createRecoveryPacket(newMasterBytes, newSalt);
    const updatedVault: Vault = {
      ...vault,
      cryptoVersion: 3,
      keySalt: newSalt,
      recoveryKeyHash: JSON.stringify(packet),
      recoveryPacket: JSON.stringify(packet),
      passwordPacket: JSON.stringify(passwordPacket),
    };

    try {
      const rawLog = await loadVaultAuditFromDropbox(vault.id);
      const oldEntries = await decryptAuditLog(rawLog as never, oldMasterBytes, vault.id);
      let rewrittenLog = createEmptyAuditLog(vault.id);
      for (const entry of oldEntries) {
        rewrittenLog = await appendAuditEntry(rewrittenLog, {
          action: entry.action,
          timestamp: entry.timestamp,
          details: entry.details,
          path: entry.path,
          device: entry.device,
          ipHash: entry.ipHash,
        }, newMasterBytes, vault.id);
      }
      await saveVaultAuditToDropbox(vault.id, rewrittenLog);
    } catch { /* non-fatal */ }

    await persistVaultRecord(updatedVault);
    return { updatedVault, masterBytes: newMasterBytes, recoveryKey };
  };

  const downloadRecoveryKit = () => {
    if (!recoveryKitData) return;
    const payload = {
      vaultName: recoveryKitData.vaultName,
      vaultId: recoveryKitData.vaultId,
      createdAt: new Date(recoveryKitData.createdAt).toISOString(),
      cryptoVersion: recoveryKitData.cryptoVersion,
      recoveryKey: recoveryKitData.recoveryKey,
      passwordHint: recoveryKitData.passwordHint || '',
      notes: [
        'Store this Recovery Kit in at least two safe places.',
        'Recommended: password manager secure note and offline printed copy or encrypted USB.',
        'If you lose both your password and recovery key, the vault may be unrecoverable.',
      ],
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${recoveryKitData.vaultName.replace(/[^a-z0-9-_]+/gi, '_')}-recovery-kit.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.success('Recovery Kit downloaded');
  };

  const handleCreate = async () => {
    if (actionLoading) return;
    if (!newName.trim()) { setError('Vault name is required'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    if ((backupPassphrase || confirmBackupPassphrase) && backupPassphrase.length < 8) { setError('Backup passphrase must be at least 8 characters'); return; }
    if (backupPassphrase !== confirmBackupPassphrase) { setError('Backup passphrases do not match'); return; }

    setActionLoading('create');
    try {
      const { verifyEntropy, createPasswordPacket, createRecoveryPacket, createEncryptedVaultEmergencyBackup, getOrDeriveArgon2Batch, createEmptyAuditLog, appendAuditEntry } = await import('@/lib/vault-crypto-advanced');

      const entropy = verifyEntropy();
      if (!entropy.ok) {
        setError(`RNG error: ${entropy.reason}`);
        return; // finally still runs — setActionLoading(null) called correctly
      }

      const vaultId = crypto.randomUUID();
      const createdAt = Date.now();
      const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      const trimmedHint = passwordHint.trim() || undefined;

      const masterBytes = await getOrDeriveArgon2Batch(password, salt, vaultId);

      const passwordPacket = await createPasswordPacket(masterBytes, password);
      const { packet, recoveryKey: recKey } = await createRecoveryPacket(masterBytes, salt);

      // v8/v9: generate per-vault hybrid PQ keypair (ML-KEM-1024 + P-256)
      // Private keys wrapped by Argon2id master key — generation may fail if WASM not loaded
      let generatedV8Keypair: Vault['v8Keypair'] = undefined;
      let selectedCipherAlg: Vault['v8CipherAlg'] = undefined;
      if (vaultFormat === 8 || vaultFormat === 9) {
        try {
          const { generateV8VaultKeypair, generateV8VaultSignKeypair } = await import('@/lib/crypto');
          generatedV8Keypair = await generateV8VaultKeypair(masterBytes, vaultId);
          // Also generate signing keypair (ML-DSA-87 + Ed25519) — best-effort
          try {
            const signKp = await generateV8VaultSignKeypair(masterBytes, vaultId);
            // Store signing keypair as proper v8SignKeypair field on vault
            (generatedV8Keypair as typeof generatedV8Keypair & { _signKeypair?: typeof signKp })._signKeypair = signKp;
          } catch { /* signing keypair is optional — vault still works without it */ }
          // Use the cipher the user picked in the sub-picker UI
          selectedCipherAlg = v8CipherAlg;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Show a clear, actionable error for missing Rust WASM
          if (msg.includes('Rust WASM') || msg.includes('WASM_NOT_LOADED') || msg.includes('WASM crypto engine')) {
            setError('⚠️ Rust WASM crypto engine is required for v8/v9 vaults. Please build the WASM module (npm run wasm:build) and reload the page. v7 vaults work without WASM.');
          } else {
            setError(`Failed to generate post-quantum keypair: ${msg}`);
          }
          return;
        }
      }

      const vault: Vault = {
        id: vaultId,
        name: newName.trim(),
        createdAt,
        recoveryKeyHash: JSON.stringify(packet),
        recoveryPacket: JSON.stringify(packet),
        passwordPacket: JSON.stringify(passwordPacket),
        cryptoVersion: vaultFormat,
        keySalt: salt,
        passwordHint: trimmedHint,
        dropboxFolder: `/Vault/${newName.trim()}`,
        ...(generatedV8Keypair ? {
          v8Keypair: (() => {
            // Extract _signKeypair before storing — keep v8Keypair clean
            const { _signKeypair, ...kp } = generatedV8Keypair as typeof generatedV8Keypair & { _signKeypair?: import('@/lib/vault-manager').Vault['v8SignKeypair'] };
            return kp;
          })(),
          v8CipherAlg: selectedCipherAlg,
          v8SignKeypair: (() => {
            const { _signKeypair } = generatedV8Keypair as typeof generatedV8Keypair & { _signKeypair?: import('@/lib/vault-manager').Vault['v8SignKeypair'] };
            return _signKeypair;
          })(),
        } : {}),
      };

      // Save to Dropbox registry
      addVaultToCache(vault);
      try {
        await saveVaultsToDropbox(listVaults());
      } catch {
        toast.error('Failed to save vault registry to Dropbox');
        removeVaultFromCache(vaultId);
        return; // finally still runs — setActionLoading(null) called correctly
      }

      // Disabled on request:
      // clearVaultIntegrityAnchor(vaultId);
      try {
        await createFolder(vault.dropboxFolder, true);
      } catch {
        // Folder bootstrap is best-effort; VaultPage can still recover if needed.
      }

      let backupSaved = false;
      if (backupPassphrase) {
        try {
          const backupPayload = await createEncryptedVaultEmergencyBackup({
            vaultId,
            vaultName: vault.name,
            createdAt,
            cryptoVersion: vaultFormat,
            recoveryKey: recKey,
            passwordHint: trimmedHint,
          }, backupPassphrase);
          await saveVaultEmergencyBackupToDropbox(vaultId, backupPayload);
          backupSaved = true;
        } catch {
          toast.error('Vault created, but encrypted Dropbox emergency backup could not be saved');
        }
      }

      setRecoveryKey(recKey);
      setRecoveryKitData({ vaultId, vaultName: vault.name, createdAt, cryptoVersion: vaultFormat, recoveryKey: recKey, passwordHint: trimmedHint });
      setEmergencyBackupSaved(backupSaved);
      setActiveVaultId(vaultId);
      saveVaultAccess(vaultId, password, masterBytes);

      // Init encrypted audit log — save to Dropbox
      try {
        const emptyLog = createEmptyAuditLog(vaultId);
        const logWithEntry = await appendAuditEntry(emptyLog, {
          action: 'vault_unlocked',
          timestamp: Date.now(),
          details: 'Vault created',
        }, masterBytes, vaultId);
        await saveVaultAuditToDropbox(vaultId, logWithEntry);
      } catch { /* non-fatal */ }

      setVaults(listVaults());
      setView('recovery');
      toast.success(`Vault created in v${vaultFormat} mode! Save your recovery key, then enter the vault.`);
      logActivity('vault_create', { name: newName.trim(), path: `/Vault/${newName.trim()}`, success: true });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create vault');
    } finally {
      setActionLoading(null);
    }
  };

  const handleUnlock = async () => {
    if (actionLoading) return;
    if (!selectedVault) return;
    if (!unlockPassword) { setError('Enter your vault password'); return; }

    setActionLoading('unlock');
    try {
      const { getOrDeriveArgon2Batch, unlockMasterKeyWithPassword, createPasswordPacket, appendAuditEntry } = await import('@/lib/vault-crypto-advanced');
      const vault = selectedVault;
      const { salt: keySalt } = await resolveVaultKeySalt(vault);
      let masterBytes: Uint8Array;
      let updatedVault: Vault | null = null;

      if (vault.passwordPacket) {
        masterBytes = await unlockMasterKeyWithPassword(JSON.parse(vault.passwordPacket), unlockPassword);
        if (vault.keySalt !== keySalt) {
          updatedVault = { ...vault, keySalt };
        }
      } else {
        masterBytes = await getOrDeriveArgon2Batch(unlockPassword, keySalt, vault.id);
        const passwordPacket = await createPasswordPacket(masterBytes, unlockPassword);
        updatedVault = {
          ...vault,
          cryptoVersion: vault.cryptoVersion ?? 4,
          keySalt,
          recoveryPacket: vault.recoveryPacket || vault.recoveryKeyHash,
          passwordPacket: JSON.stringify(passwordPacket),
        };
      }

      if (updatedVault) {
        await persistVaultRecord(updatedVault);
      }

      try {
        const log = await loadVaultAuditFromDropbox(vault.id);
        const updated = await appendAuditEntry(log, { action: 'vault_unlocked', timestamp: Date.now() }, masterBytes, vault.id);
        await saveVaultAuditToDropbox(vault.id, updated);
      } catch { /* non-fatal */ }

      saveVaultAccess(vault.id, unlockPassword, masterBytes);
      setActiveVaultId(vault.id);
      onVaultUnlocked(vault.id);
      toast.success(updatedVault && !vault.passwordPacket ? `Vault "${vault.name}" unlocked and refreshed` : `Vault "${vault.name}" unlocked`);
      logActivity('vault_unlock', { name: vault.name, path: vault.dropboxFolder, success: true });
      onClose();
      navigate(vaultRoutePath);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to unlock vault');
    } finally {
      setActionLoading(null);
    }
  };

  const finishRecoveryBasedAccess = async (resolvedRecoveryKey: string, sourceLabel: 'recovery key' | 'encrypted backup') => {
    if (!selectedVault) return;
    const { recoverMasterKey, createPasswordPacket, appendAuditEntry } = await import('@/lib/vault-crypto-advanced');
    let packet;
    try {
      const raw = selectedVault.recoveryPacket || selectedVault.recoveryKeyHash;
      if (!raw) throw new Error('No recovery packet found');
      packet = JSON.parse(raw);
      if (!packet || typeof packet !== 'object') throw new Error('Malformed recovery packet');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'No recovery packet found');
      return;
    }
    const masterBytes = await recoverMasterKey(packet, resolvedRecoveryKey);

    if (selectedVault.cryptoVersion === 3 && (nextPassword || nextConfirmPassword)) {
      if (nextPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
      if (nextPassword !== nextConfirmPassword) { setError('New passwords do not match'); return; }
      const toastId = toast.loading(`Re-encrypting v3 vault "${selectedVault.name}"...`, { duration: Infinity });
      setReencryptProgress({ current: 0, total: 0, currentPath: '', phase: 'preparing migration' });
      try {
        const { updatedVault, masterBytes: newMasterBytes, recoveryKey: newRecoveryKey } = await reencryptV3Vault(selectedVault, masterBytes, nextPassword, setReencryptProgress);
        try {
          const log = await loadVaultAuditFromDropbox(selectedVault.id);
          const updated = await appendAuditEntry(log, { action: 'password_changed', timestamp: Date.now(), details: `Recovered with ${sourceLabel} and re-encrypted v3 vault` }, newMasterBytes, selectedVault.id);
          await saveVaultAuditToDropbox(selectedVault.id, updated);
        } catch { /* non-fatal */ }
        setRecoveryKey(newRecoveryKey);
        setRecoveryKitData({ vaultId: updatedVault.id, vaultName: updatedVault.name, createdAt: updatedVault.createdAt, cryptoVersion: 3, recoveryKey: newRecoveryKey, passwordHint: updatedVault.passwordHint });
        setEmergencyBackupSaved(false);
        saveVaultAccess(updatedVault.id, nextPassword, newMasterBytes);
        setActiveVaultId(updatedVault.id);
        onVaultUnlocked(updatedVault.id);
        toast.success(`v3 vault "${selectedVault.name}" re-encrypted and password reset`, { id: toastId });
        setView('recovery');
        return;
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Failed to re-encrypt v3 vault', { id: toastId });
        setError(e instanceof Error ? e.message : 'Failed to re-encrypt v3 vault');
        return;
      } finally {
        setReencryptProgress(null);
      }
    }

    let updatedVault: Vault | null = null;
    if (nextPassword || nextConfirmPassword) {
      if (nextPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
      if (nextPassword !== nextConfirmPassword) { setError('New passwords do not match'); return; }
      const passwordPacket = await createPasswordPacket(masterBytes, nextPassword);
      updatedVault = {
        ...selectedVault,
        cryptoVersion: selectedVault.cryptoVersion ?? 4,
        keySalt: selectedVault.keySalt,
        recoveryPacket: selectedVault.recoveryPacket || selectedVault.recoveryKeyHash,
        passwordPacket: JSON.stringify(passwordPacket),
      };
    } else {
      const { salt: keySalt } = await resolveVaultKeySalt(selectedVault);
      if (!selectedVault.recoveryPacket || selectedVault.keySalt !== keySalt) {
        updatedVault = {
          ...selectedVault,
          cryptoVersion: selectedVault.cryptoVersion ?? 4,
          keySalt,
          recoveryPacket: selectedVault.recoveryPacket || selectedVault.recoveryKeyHash,
        };
      }
    }

    if (updatedVault) {
      await persistVaultRecord(updatedVault);
    }

    try {
      const log = await loadVaultAuditFromDropbox(selectedVault.id);
      const updated = await appendAuditEntry(
        log,
        { action: nextPassword ? 'password_changed' : 'recovery_used', timestamp: Date.now(), details: `Unlocked using ${sourceLabel}` },
        masterBytes,
        selectedVault.id,
      );
      await saveVaultAuditToDropbox(selectedVault.id, updated);
    } catch { /* non-fatal */ }

    saveVaultAccess(selectedVault.id, nextPassword || null, masterBytes);
    setActiveVaultId(selectedVault.id);
    onVaultUnlocked(selectedVault.id);
    toast.success(nextPassword ? `Password reset for vault "${selectedVault.name}"` : `Vault "${selectedVault.name}" unlocked with ${sourceLabel}`);
    onClose();
    navigate(vaultRoutePath);
  };

  const handleRecoveryUnlock = async () => {
    if (actionLoading) return;
    if (!selectedVault || !recoveryInput) { setError('Enter your recovery key'); return; }
    setActionLoading('recovery');
    try {
      await finishRecoveryBasedAccess(recoveryInput, 'recovery key');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid recovery key');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreFromBackup = async () => {
    if (actionLoading) return;
    if (!selectedVault) return;
    if (!backupRestorePassphrase) { setError('Enter your encrypted backup passphrase'); return; }
    setActionLoading('restore');
    try {
      const backupJson = importedBackupContent ?? await loadVaultEmergencyBackupFromDropbox(selectedVault.id);
      if (!backupJson) {
        setError('No encrypted backup found in Dropbox and no local backup file was selected');
        return;
      }
      const { decryptEncryptedVaultEmergencyBackup } = await import('@/lib/vault-crypto-advanced');
      const payload = await decryptEncryptedVaultEmergencyBackup(backupJson, backupRestorePassphrase);
      if (payload.vaultId !== selectedVault.id) {
        setError('This encrypted backup belongs to a different vault');
        return;
      }
      await finishRecoveryBasedAccess(payload.recoveryKey, 'encrypted backup');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to restore from encrypted backup');
    } finally {
      setActionLoading(null);
    }
  };

  const handleChangePassword = async () => {
    if (actionLoading) return;
    if (!selectedVault) return;
    if (!unlockPassword) { setError('Enter your current password'); return; }
    if (nextPassword.length < 8) { setError('New password must be at least 8 characters'); return; }
    if (nextPassword !== nextConfirmPassword) { setError('New passwords do not match'); return; }
    setActionLoading('changePassword');
    try {
      const { getOrDeriveArgon2Batch, unlockMasterKeyWithPassword, createPasswordPacket, appendAuditEntry } = await import('@/lib/vault-crypto-advanced');
      const { salt: keySalt } = await resolveVaultKeySalt(selectedVault);
      let masterBytes: Uint8Array;
      if (selectedVault.passwordPacket) {
        masterBytes = await unlockMasterKeyWithPassword(JSON.parse(selectedVault.passwordPacket), unlockPassword);
      } else {
        masterBytes = await getOrDeriveArgon2Batch(unlockPassword, keySalt, selectedVault.id);
      }

      if (selectedVault.cryptoVersion === 3) {
        const toastId = toast.loading(`Re-encrypting v3 vault "${selectedVault.name}"...`, { duration: Infinity });
        setReencryptProgress({ current: 0, total: 0, currentPath: '', phase: 'preparing migration' });
        try {
          const { updatedVault, masterBytes: newMasterBytes, recoveryKey: newRecoveryKey } = await reencryptV3Vault(selectedVault, masterBytes, nextPassword, setReencryptProgress);
          try {
            const log = await loadVaultAuditFromDropbox(selectedVault.id);
            const updated = await appendAuditEntry(log, { action: 'password_changed', timestamp: Date.now(), details: 'v3 vault re-encrypted after password change' }, newMasterBytes, selectedVault.id);
            await saveVaultAuditToDropbox(selectedVault.id, updated);
          } catch { /* non-fatal */ }
          setRecoveryKey(newRecoveryKey);
          setRecoveryKitData({ vaultId: updatedVault.id, vaultName: updatedVault.name, createdAt: updatedVault.createdAt, cryptoVersion: 3, recoveryKey: newRecoveryKey, passwordHint: updatedVault.passwordHint });
          setEmergencyBackupSaved(false);
          saveVaultAccess(updatedVault.id, nextPassword, newMasterBytes);
          setActiveVaultId(updatedVault.id);
          onVaultUnlocked(updatedVault.id);
          toast.success(`v3 vault "${selectedVault.name}" re-encrypted with new password`, { id: toastId });
          setView('recovery');
          return;
        } catch (e: unknown) {
          toast.error(e instanceof Error ? e.message : 'Failed to re-encrypt v3 vault', { id: toastId });
          setError(e instanceof Error ? e.message : 'Failed to re-encrypt v3 vault');
          return;
        } finally {
          setReencryptProgress(null);
        }
      }

      const passwordPacket = await createPasswordPacket(masterBytes, nextPassword);
      const updatedVault: Vault = {
        ...selectedVault,
        cryptoVersion: selectedVault.cryptoVersion ?? 4,
        keySalt,
        recoveryPacket: selectedVault.recoveryPacket || selectedVault.recoveryKeyHash,
        passwordPacket: JSON.stringify(passwordPacket),
      };
      await persistVaultRecord(updatedVault);
      try {
        const log = await loadVaultAuditFromDropbox(selectedVault.id);
        const updated = await appendAuditEntry(log, { action: 'password_changed', timestamp: Date.now() }, masterBytes, selectedVault.id);
        await saveVaultAuditToDropbox(selectedVault.id, updated);
      } catch { /* non-fatal */ }
      saveVaultAccess(selectedVault.id, nextPassword, masterBytes);
      setActiveVaultId(selectedVault.id);
      onVaultUnlocked(selectedVault.id);
      toast.success(`Password updated for vault "${selectedVault.name}"`);
      onClose();
      navigate(vaultRoutePath);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to change password');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (vault: Vault) => {
    if (!confirm(`Delete vault "${vault.name}"? Files on Dropbox won't be deleted.`)) return;
    removeVaultFromCache(vault.id);
    try {
      await saveVaultsToDropbox(listVaults());
      setVaults(listVaults());
      toast.success(`Vault "${vault.name}" removed`);
      logActivity('vault_delete', { name: vault.name, path: vault.dropboxFolder, success: true });
    } catch {
      // Rollback
      addVaultToCache(vault);
      setVaults(listVaults());
      toast.error('Failed to delete vault from Dropbox registry');
    }
  };

  const activeId = getActiveVaultId();
  const actionLabel = actionLoading === 'create'
    ? 'Creating vault…'
    : actionLoading === 'unlock'
      ? 'Unlocking vault…'
      : actionLoading === 'recovery'
        ? 'Recovering access…'
        : actionLoading === 'restore'
          ? 'Restoring backup…'
          : actionLoading === 'changePassword'
            ? 'Updating vault password…'
            : null;

  const titles: Record<VaultView, string> = {
    list: 'Vault Manager',
    create: 'New Vault',
    unlock: selectedVault ? `Unlock "${selectedVault.name}"` : 'Unlock',
    recovery: 'Recovery Key',
    recoverAccess: selectedVault ? `Recovery for "${selectedVault.name}"` : 'Recovery',
    restoreBackup: selectedVault ? `Restore Backup for "${selectedVault.name}"` : 'Restore Backup',
    changePassword: selectedVault ? `Change Password for "${selectedVault.name}"` : 'Change Password',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xl" onClick={() => { if (!reencryptProgress) onClose(); }} />

      {/* Dialog — liquid glass, no colour */}
      <div className="relative bg-card border border-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-hidden animate-scale-in flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/8 shrink-0">
          <div className="flex items-center gap-2.5">
            {view !== 'list' && (
              <button
                onClick={() => { if (!reencryptProgress) { setView('list'); reset(); } }}
                className="bg-secondary rounded-xl p-2 transition-all duration-200 hover:brightness-110 hover:scale-105 hover:shadow-md active:scale-[0.96] mr-1"
              >
                <ChevronLeft className="w-4 h-4 text-foreground" />
              </button>
            )}
            <Lock className="w-4 h-4 text-foreground/60" />
            <span className="font-semibold text-sm text-foreground">{titles[view]}</span>
          </div>
          <button
            onClick={() => { if (!reencryptProgress) onClose(); }}
            className="bg-secondary rounded-xl p-2 transition-all duration-200 hover:brightness-110 hover:scale-105 hover:shadow-md active:scale-[0.96]"
          >
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* Body */}
        <div className="vault-dialog-scroll px-5 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">

          {/* LIST */}
          {view === 'list' && (
            <>
              {loadingVaults ? (
                <div className="flex items-center justify-center py-8 gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Loading vaults...</span>
                </div>
              ) : vaults.length === 0 ? (
                <div className="text-center py-8">
                  <Lock className="w-10 h-10 mx-auto mb-3 text-foreground/20" />
                  <p className="text-sm text-muted-foreground">No vaults yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Create one to encrypt files before upload.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {vaults.map(vault => (
                    <div key={vault.id} className="bg-secondary rounded-xl px-4 py-3 flex items-center gap-3">
                      <Lock className="w-4 h-4 text-foreground/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{vault.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{vault.dropboxFolder} · v{vault.cryptoVersion ?? 5}</p>
                      </div>
                      {activeId === vault.id && (
                        <span className="text-[10px] font-semibold text-foreground/50 border border-foreground/20 rounded-full px-2 py-0.5">Active</span>
                      )}
                      <button
                        onClick={() => { setSelectedVault(vault); setView('unlock'); reset(); }}
                        className="bg-secondary rounded-lg px-2.5 py-1.5 text-xs font-semibold text-foreground transition-all hover:brightness-110 active:scale-95 flex items-center gap-1"
                      >
                        <Unlock className="w-3 h-3" /> Unlock
                      </button>
                      <button
                        onClick={() => handleDelete(vault)}
                        className="bg-secondary rounded-lg p-1.5 transition-all hover:brightness-110 active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-foreground/40" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => { setView('create'); reset(); }}
                className="w-full bg-secondary rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground transition-all hover:brightness-110 active:scale-95"
              >
                <Plus className="w-4 h-4" /> Create New Vault
              </button>
            </>
          )}

          {/* CREATE */}
          {view === 'create' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Vault Name</label>
                <input
                  autoFocus
                  placeholder="My Vault"
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Strong password…"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    className="w-full bg-secondary rounded-xl px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {password && (
                  <div className="flex gap-1 mt-1">
                    {strengthBars.map((filled, i) => (
                      <div key={i} className={`flex-1 h-1 rounded-full transition-all duration-300 ${filled ? 'bg-foreground/60' : 'bg-foreground/10'}`} />
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Confirm Password</label>
                <input
                  type="password"
                  placeholder="Confirm password…"
                  value={confirmPassword}
                  onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Vault Format</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setVaultFormat(7)} className={`bg-secondary rounded-xl px-3 py-3 text-left transition-all ${vaultFormat === 7 ? 'ring-2 ring-violet-400/50' : ''}`}>
                    <p className="text-sm font-semibold text-foreground">v7 ✨ New</p>
                    <p className="text-[11px] text-muted-foreground mt-1">XChaCha20-Poly1305 · WASM-native · 24-byte nonces · strongest cipher.</p>
                  </button>
                  <button type="button" onClick={() => { setVaultFormat(8); setV8CipherAlg('aes-256-gcm-siv'); }} className={`bg-secondary rounded-xl px-3 py-3 text-left transition-all ${vaultFormat === 8 ? 'ring-2 ring-violet-400/50' : ''}`}>
                    <p className="text-sm font-semibold text-foreground">v8 🔒 Post-Quantum</p>
                    <p className="text-[11px] text-muted-foreground mt-1">ML-KEM-1024 + P-256 hybrid KEM · ML-DSA-87 + Ed25519 · AES-GCM-SIV or XChaCha20 (user picks).</p>
                  </button>
                  <button type="button" onClick={() => { setVaultFormat(9); }} className={`bg-secondary rounded-xl px-3 py-3 text-left transition-all ${vaultFormat === 9 ? 'ring-2 ring-violet-400/50' : ''}`}>
                    <p className="text-sm font-semibold text-foreground">v9 🛡️ Ultra-Conservative</p>
                    <p className="text-[11px] text-muted-foreground mt-1">Same KEM as v8 · SLH-DSA (SPHINCS+) + Ed25519 · Deoxys-II-256 cipher · hash-based sigs survive lattice breaks.</p>
                  </button>
                  {/* v8 cipher sub-picker — AES-GCM-SIV or XChaCha20 */}
                  {vaultFormat === 8 && (
                    <div className="col-span-2 mt-1 space-y-1.5">
                      <label className="text-[11px] font-semibold text-foreground/50 uppercase tracking-wide">Cipher for v8</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setV8CipherAlg('aes-256-gcm-siv')} className={`bg-secondary rounded-lg px-3 py-2.5 text-left transition-all ${v8CipherAlg === 'aes-256-gcm-siv' ? 'ring-2 ring-violet-400/50' : ''}`}>
                          <p className="text-xs font-semibold text-foreground">AES-256-GCM-SIV ✅</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">Nonce-misuse resistant · IETF RFC 8452 · safe even on nonce reuse.</p>
                        </button>
                        <button type="button" onClick={() => setV8CipherAlg('xchacha20-poly1305')} className={`bg-secondary rounded-lg px-3 py-2.5 text-left transition-all ${v8CipherAlg === 'xchacha20-poly1305' ? 'ring-2 ring-violet-400/50' : ''}`}>
                          <p className="text-xs font-semibold text-foreground">XChaCha20-Poly1305</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">24-byte nonces · same as v7 · software-timing resistant.</p>
                        </button>
                      </div>
                    </div>
                  )}
                  {/* v9 cipher — fixed: Deoxys-II-256 only, no choice */}
                  {vaultFormat === 9 && (
                    <div className="col-span-2 mt-1 space-y-1.5">
                      <label className="text-[11px] font-semibold text-foreground/50 uppercase tracking-wide">Cipher for v9</label>
                      <div className="bg-secondary rounded-lg px-3 py-2.5 ring-2 ring-violet-400/50">
                        <p className="text-xs font-semibold text-foreground">Deoxys-II-256 🛡️ <span className="text-[9px] font-normal text-violet-400/80">fixed — no choice</span></p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">CAESAR competition winner · nonce-misuse resistant · tweakable block cipher · distinct from v8 · falls back to AES-256-GCM-SIV if WASM unavailable.</p>
                      </div>
                    </div>
                  )}
                  <button type="button" onClick={() => setVaultFormat(5)} className={`bg-secondary rounded-xl px-3 py-3 text-left transition-all ${vaultFormat === 5 ? 'ring-2 ring-violet-400/50' : ''}`}>
                    <p className="text-sm font-semibold text-foreground">v5 Stable</p>
                    <p className="text-[11px] text-muted-foreground mt-1">AES-256-GCM · wrapped-key model · padded size buckets.</p>
                  </button>
                  <button type="button" onClick={() => setVaultFormat(4)} className={`bg-secondary rounded-xl px-3 py-3 text-left transition-all ${vaultFormat === 4 ? 'ring-2 ring-violet-400/50' : ''}`}>
                    <p className="text-sm font-semibold text-foreground">v4 Legacy</p>
                    <p className="text-[11px] text-muted-foreground mt-1">AES-256-GCM · wrapped-key model · smoother recovery & password reset.</p>
                  </button>
                  <button type="button" onClick={() => setVaultFormat(3)} className={`bg-secondary rounded-xl px-3 py-3 text-left transition-all ${vaultFormat === 3 ? 'ring-2 ring-violet-400/50' : ''}`}>
                    <p className="text-sm font-semibold text-foreground">v3 Legacy</p>
                    <p className="text-[11px] text-muted-foreground mt-1">AES-256-GCM · compatibility mode for older vault workflows.</p>
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Password Reminder (optional)</label>
                <input
                  placeholder="E.g. where you stored the hint, not the password itself…"
                  value={passwordHint}
                  onChange={e => { setPasswordHint(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Encrypted Dropbox Backup Passphrase (optional)</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Optional separate passphrase for hidden backup…"
                  value={backupPassphrase}
                  onChange={e => { setBackupPassphrase(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Confirm Backup Passphrase</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Confirm backup passphrase…"
                  value={confirmBackupPassphrase}
                  onChange={e => { setConfirmBackupPassphrase(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="bg-secondary rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  If you lose both your vault password and recovery key, your vault cannot be recovered.
                </p>
                <div className="text-[11px] text-muted-foreground/80 pl-5 space-y-1">
                  <p>• Store the recovery key in at least 2 safe places</p>
                  <p>• Use a password manager secure note</p>
                  <p>• Keep an offline printed copy or encrypted USB backup</p>
                  <p>• Never keep the only copy inside the same vault</p>
                </div>
              </div>
              {error && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
                </p>
              )}
              <button
                onClick={handleCreate}
                disabled={!!actionLoading}
                className="w-full bg-secondary rounded-xl py-3 text-sm font-semibold text-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-60 disabled:pointer-events-none flex items-center justify-center gap-2"
              >
                {actionLoading === 'create' ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating vault…</> : 'Create Vault'}
              </button>
            </>
          )}

          {/* UNLOCK */}
          {view === 'unlock' && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Password</label>
                <div className="relative">
                  <input
                    autoFocus
                    type={showPass ? 'text' : 'password'}
                    placeholder="Enter vault password…"
                    value={unlockPassword}
                    onChange={e => { setUnlockPassword(e.target.value); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handleUnlock()}
                    className="w-full bg-secondary rounded-xl px-4 py-2.5 pr-10 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-foreground transition-colors"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              {actionLabel && (
                <div className="bg-secondary rounded-xl px-4 py-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span>{actionLabel}</span>
                </div>
              )}
              {reencryptProgress && (
                <div className="bg-secondary rounded-2xl px-4 py-3 space-y-2 border border-violet-500/20 shadow-[0_10px_24px_rgba(124,58,237,0.12)]">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground/85">Re-encrypting v3 vault</span>
                    <span>{reencryptProgress.total > 0 ? Math.round((reencryptProgress.current / reencryptProgress.total) * 100) : 0}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-all duration-300" style={{ width: `${reencryptProgress.total > 0 ? Math.round((reencryptProgress.current / reencryptProgress.total) * 100) : 8}%` }} />
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground">
                    <span>{reencryptProgress.phase}</span>
                    <span>{reencryptProgress.current}/{reencryptProgress.total || '—'} files</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[11px] text-foreground/70">
                    <span className="truncate">{reencryptProgress.currentPath ? reencryptProgress.currentPath.split('/').pop() : 'Preparing…'}</span>
                    <span>{Math.max((reencryptProgress.total || 0) - reencryptProgress.current, 0)} remaining</span>
                  </div>
                  <p className="text-[11px] text-amber-500">Vault actions are temporarily locked during migration.</p>
                </div>
              )}
              {error && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />{error}
                </p>
              )}
              <button
                onClick={handleUnlock}
                disabled={!!actionLoading}
                className="w-full bg-secondary rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
              >
                {actionLoading === 'unlock' ? <><Loader2 className="w-4 h-4 animate-spin" /> Unlocking vault…</> : <><Unlock className="w-4 h-4" /> Unlock</>}
              </button>
              <button
                onClick={() => { setView('recoverAccess'); setError(''); setRecoveryInput(''); setNextPassword(''); setNextConfirmPassword(''); }}
                className="w-full bg-secondary rounded-xl py-2 text-xs text-foreground/50 transition-all hover:brightness-110 active:scale-95"
              >
                <Key className="w-3 h-3 inline mr-1" /> Recovery Access
              </button>
              <button
                onClick={() => { setView('restoreBackup'); setError(''); setBackupRestorePassphrase(''); setImportedBackupContent(null); setImportedBackupName(''); setNextPassword(''); setNextConfirmPassword(''); }}
                className="w-full bg-secondary rounded-xl py-2 text-xs text-foreground/50 transition-all hover:brightness-110 active:scale-95"
              >
                <Key className="w-3 h-3 inline mr-1" /> Restore Encrypted Backup
              </button>
              <button
                onClick={() => { setView('changePassword'); setError(''); setNextPassword(''); setNextConfirmPassword(''); }}
                className="w-full bg-secondary rounded-xl py-2 text-xs text-foreground/50 transition-all hover:brightness-110 active:scale-95"
              >
                <Lock className="w-3 h-3 inline mr-1" /> Change Password
              </button>
            </>
          )}

          {/* VERIFY RECOVERY KEY */}
          {view === 'recoverAccess' && (
            <>
              <div className="bg-secondary rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Use your recovery key to unlock the vault, and optionally set a new password at the same time.
                </p>
                <div className="text-[11px] text-muted-foreground/80 pl-5 space-y-1">
                  <p>• Recovery key can unlock vault access without the old password</p>
                  <p>• Enter a new password below if you want to reset it now</p>
                  <p>• Legacy vaults are upgraded automatically during this flow</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Recovery Key</label>
                <input
                  autoFocus
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter recovery key…"
                  value={recoveryInput}
                  onChange={e => { setRecoveryInput(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleRecoveryUnlock()}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">New Password (optional reset)</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Leave blank to unlock only…"
                  value={nextPassword}
                  onChange={e => { setNextPassword(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Confirm New Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Confirm new password…"
                  value={nextConfirmPassword}
                  onChange={e => { setNextConfirmPassword(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              {error && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}
                </p>
              )}
              <button
                onClick={handleRecoveryUnlock}
                disabled={!!actionLoading}
                className="w-full bg-secondary rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
              >
                {actionLoading === 'recovery'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Recovering access…</>
                  : <><Key className="w-4 h-4" /> {nextPassword ? 'Reset Password & Unlock' : 'Continue with Recovery Key'}</>}
              </button>
            </>
          )}

          {/* RESTORE ENCRYPTED BACKUP */}
          {view === 'restoreBackup' && (
            <>
              <div className="bg-secondary rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Restore access from the hidden encrypted Dropbox backup, or import a downloaded encrypted backup file and unlock with its separate backup passphrase.
                </p>
                <div className="text-[11px] text-muted-foreground/80 pl-5 space-y-1">
                  <p>• If you do nothing else, the app will try the hidden <span className="font-mono">/.stratus/</span> encrypted backup</p>
                  <p>• You can also import a local encrypted backup JSON file</p>
                  <p>• Optionally set a new password below while restoring access</p>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Encrypted Backup Passphrase</label>
                <input
                  autoFocus
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter backup passphrase…"
                  value={backupRestorePassphrase}
                  onChange={e => { setBackupRestorePassphrase(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Import Local Encrypted Backup (optional)</label>
                <input
                  type="file"
                  accept="application/json,.json"
                  onChange={async e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setImportedBackupName(file.name);
                    setImportedBackupContent(await file.text());
                    setError('');
                  }}
                  className="w-full text-xs text-muted-foreground"
                />
                {importedBackupName && (
                  <p className="text-[11px] text-muted-foreground">Using imported backup file: {importedBackupName}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">New Password (optional reset)</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Leave blank to unlock only…"
                  value={nextPassword}
                  onChange={e => { setNextPassword(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Confirm New Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Confirm new password…"
                  value={nextConfirmPassword}
                  onChange={e => { setNextConfirmPassword(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleRestoreFromBackup()}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              {error && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}
                </p>
              )}
              <button
                onClick={handleRestoreFromBackup}
                disabled={!!actionLoading}
                className="w-full bg-secondary rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
              >
                {actionLoading === 'restore'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Restoring backup…</>
                  : <><Key className="w-4 h-4" /> {nextPassword ? 'Restore Backup, Reset Password & Unlock' : 'Restore from Encrypted Backup'}</>}
              </button>
            </>
          )}

          {/* CHANGE PASSWORD */}
          {view === 'changePassword' && (
            <>
              <div className="bg-secondary rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {selectedVault?.cryptoVersion === 3
                    ? 'Change your v3 vault password by re-encrypting every vault file with a new master key. Old password access will stop working after completion.'
                    : 'Change your vault password without re-encrypting files. This updates the wrapped master key used for future unlocks.'}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Current Password</label>
                <input
                  autoFocus
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter current password…"
                  value={unlockPassword}
                  onChange={e => { setUnlockPassword(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">New Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Enter new password…"
                  value={nextPassword}
                  onChange={e => { setNextPassword(e.target.value); setError(''); }}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wide">Confirm New Password</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  placeholder="Confirm new password…"
                  value={nextConfirmPassword}
                  onChange={e => { setNextConfirmPassword(e.target.value); setError(''); }}
                  onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                  className="w-full bg-secondary rounded-xl px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground bg-transparent border-none outline-none"
                />
              </div>
              {error && (
                <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{error}
                </p>
              )}
              <button
                onClick={handleChangePassword}
                disabled={!!actionLoading}
                className="w-full bg-secondary rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground transition-all hover:brightness-110 active:scale-95 disabled:opacity-60 disabled:pointer-events-none"
              >
                {actionLoading === 'changePassword'
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Updating vault password…</>
                  : <><Lock className="w-4 h-4" /> Update Password</>}
              </button>
            </>
          )}

          {/* RECOVERY KEY */}
          {view === 'recovery' && (
            <>
              <div className="bg-secondary rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs text-muted-foreground flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Save this recovery key — it cannot be shown again.
                </p>
                <div className="text-[11px] text-muted-foreground/80 pl-5 space-y-1">
                  <p>• Save it in at least 2 safe places</p>
                  <p>• Password manager secure note</p>
                  <p>• Offline printed copy or encrypted USB</p>
                  <p>• Never keep the only copy inside the same vault</p>
                  <p>• If both password and recovery key are lost, the vault is unrecoverable</p>
                </div>
              </div>
              <div className="bg-secondary rounded-xl px-4 py-4 font-mono text-sm break-all text-center text-foreground/80 tracking-widest select-all">
                {recoveryKey}
              </div>
              {recoveryKitData && (
                <button
                  onClick={downloadRecoveryKit}
                  className="w-full bg-secondary rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground transition-all hover:brightness-110 active:scale-95"
                >
                  <Plus className="w-4 h-4" /> Download Recovery Kit
                </button>
              )}
              <button
                onClick={() => { navigator.clipboard.writeText(recoveryKey); toast.success('Copied!'); }}
                className="w-full bg-secondary rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-semibold text-foreground transition-all hover:brightness-110 active:scale-95"
              >
                <Key className="w-4 h-4" /> Copy Recovery Key
              </button>
              {emergencyBackupSaved && (
                <div className="bg-secondary rounded-xl px-4 py-3">
                  <p className="text-xs text-muted-foreground">Encrypted emergency backup saved to hidden Dropbox path <span className="font-mono text-foreground/70">/.stratus/</span>.</p>
                </div>
              )}
              <button
                onClick={() => { onClose(); navigate('/vault'); }}
                className="w-full bg-secondary rounded-xl py-3 text-sm font-medium text-foreground/60 transition-all hover:brightness-110 active:scale-95"
              >
                I've saved it — Enter Vault
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
