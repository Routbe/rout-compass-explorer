/**
 * Message contract between the UI thread and the cryptographic enclave worker.
 * Types only: importing this file never pulls crypto code into the main bundle.
 *
 * Secrets that must come from the user (a typed Master Key, a handoff code, a
 * passkey PRF output) cross into the worker once; keys never come back out.
 * Typed arrays are sent as transferables, so the sender's copy is detached.
 */
import type { SealedBlob } from "@/lib/e2ee/crypto";
import type { PrivateEnvelope } from "@/lib/ledger/crypto";

/** Public metadata of a decrypted handoff; the full config stays inside the worker. */
export type VaultSummary = { name: string; slug?: string; description?: string };
export type SealedForUser = { encrypted: SealedBlob; keyId: string };
export type LedgerDraft = { keyId: string; publicKey: JsonWebKey; recoveryCode: string; envelopes: PrivateEnvelope[] };

export interface EnclaveOps {
  /** Import the ephemeral secret (then wipe it), derive the claim proof and keep the vault key. */
  "vault.prepare": { req: { secret: string }; res: { handle: string; claimProof: string } };
  /** Decrypt + validate the vault payload; plaintext stays in the worker until reseal/discard/expiry. */
  "vault.decrypt": { req: { handle: string; vaultId: string; blob: string; expiresAt: string }; res: VaultSummary };
  /** Re-encrypt the held plaintext with the member's device key, then wipe it. */
  "vault.reseal": { req: { handle: string; userId: string }; res: SealedForUser };
  "vault.discard": { req: { handle: string }; res: null };

  "deviceKey.status": { req: { userId: string }; res: { keyId: string } | null };
  /** New 24-word Master Key; entropy stays in the worker, only the words are shown to the human. */
  "masterKey.generate": { req: Record<string, never>; res: { handle: string; mnemonic: string } };
  "masterKey.commitPending": { req: { handle: string; userId: string }; res: { keyId: string } };
  "masterKey.discardPending": { req: { handle: string }; res: null };
  "masterKey.unlock": { req: { userId: string; mnemonic: string }; res: { keyId: string } };

  /** Generic E2EE: UI hands plaintext in (transferred), gets ciphertext back. */
  "data.seal": { req: { userId: string; aad: string; plaintext: Uint8Array }; res: SealedForUser };
  "data.open": { req: { userId: string; aad: string; blob: string }; res: { plaintext: Uint8Array } };

  /** Encrypted activity ledger (RSA-OAEP + AES-GCM). Private keys live only in the worker. */
  "ledger.generate": { req: { prf?: Uint8Array }; res: LedgerDraft };
  "ledger.activate": { req: { keyId: string }; res: null };
  "ledger.discardPending": { req: { keyId: string }; res: null };
  "ledger.unlock": { req: { keyId: string; envelope: PrivateEnvelope; recoveryCode?: string; prf?: Uint8Array }; res: null };
  "ledger.decrypt": { req: { keyId: string; items: { id: string; payload: string }[] }; res: Record<string, string> };
  "ledger.lock": { req: { keyId?: string }; res: null };

  "hash.sha256Hex": { req: { text: string }; res: string };
}

export type EnclaveOp = keyof EnclaveOps;
export type EnclaveArgs<K extends EnclaveOp> = EnclaveOps[K]["req"];
export type EnclaveResult<K extends EnclaveOp> = EnclaveOps[K]["res"];

export type EnclaveRequest = { [K in EnclaveOp]: { id: number; op: K; args: EnclaveArgs<K> } }[EnclaveOp];

export type EnclaveErrorCode =
  | "enclave_unavailable"
  | "enclave_crashed"
  | "timeout"
  | "invalid_input"
  | "unknown_handle"
  | "decrypt_failed"
  | "invalid_config"
  | "invalid_mnemonic"
  | "no_device_key"
  | "internal";

export type EnclaveResponse =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; code: EnclaveErrorCode };
