"""FedAvg (Federated Averaging - McMahan et al. 2017) + tien ich hash trong so.

Trong so THAT duoc tinh trung binh o day (off-chain) va luu file;
on-chain chi giu keccak256(hash) de truy vet.
"""
from __future__ import annotations

import hashlib
from pathlib import Path

import numpy as np

try:  # dung keccak256 giong Solidity neu co web3
    from web3 import Web3

    def keccak_hex(buf: bytes) -> str:
        return Web3.keccak(buf).hex()
except Exception:  # fallback: sha256 (van du de demo tinh toan ven du lieu)
    def keccak_hex(buf: bytes) -> str:
        return "0x" + hashlib.sha256(buf).hexdigest()


def weights_hash(flat: np.ndarray) -> str:
    """Hash 1 vector trong so. Lam tron 6 chu so de on dinh giua cac lan chay."""
    canonical = np.round(np.asarray(flat, dtype=np.float64), 6)
    return keccak_hex(canonical.tobytes())


def fedavg(local_flats: list[np.ndarray], n_samples: list[int]) -> np.ndarray:
    """Trung binh co trong so theo so mau moi node."""
    assert len(local_flats) == len(n_samples) and local_flats
    total = float(sum(n_samples))
    acc = np.zeros_like(local_flats[0], dtype=np.float64)
    for w, n in zip(local_flats, n_samples):
        acc += (n / total) * np.asarray(w, dtype=np.float64)
    return acc


def save_weights(flat: np.ndarray, path: str | Path) -> str:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    np.save(path, np.asarray(flat, dtype=np.float64))
    return str(path)


def load_weights(path: str | Path) -> np.ndarray:
    return np.load(Path(path))
