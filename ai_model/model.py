"""Mo hinh AI dung chung cho Federated Learning.

Bai toan: phan loai bat thuong tin hieu sinh ton (nhip tim / SpO2 / nhiet do).
Mo hinh nho (MLP) de FedAvg hoi tu nhanh trong pham vi do an.
"""
from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn

N_FEATURES = 5  # heart_rate, spo2, body_temp, hr_var, motion
N_CLASSES = 2   # 0 = binh thuong, 1 = bat thuong


class VitalsMLP(nn.Module):
    def __init__(self, n_features: int = N_FEATURES, hidden: int = 16, n_classes: int = N_CLASSES):
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(n_features, hidden),
            nn.ReLU(),
            nn.Linear(hidden, hidden),
            nn.ReLU(),
            nn.Linear(hidden, n_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def build_model(seed: int = 42) -> VitalsMLP:
    torch.manual_seed(seed)
    return VitalsMLP()


def get_flat_weights(model: nn.Module) -> np.ndarray:
    """Ghep toan bo tham so thanh 1 vector float64 (dung de hash + FedAvg)."""
    parts = [p.detach().cpu().numpy().ravel() for p in model.state_dict().values()]
    return np.concatenate(parts).astype(np.float64)


def set_flat_weights(model: nn.Module, flat: np.ndarray) -> None:
    sd = model.state_dict()
    offset = 0
    new_sd = {}
    for k, v in sd.items():
        n = v.numel()
        chunk = np.asarray(flat[offset:offset + n], dtype=np.float32).reshape(v.shape)
        new_sd[k] = torch.from_numpy(chunk)
        offset += n
    assert offset == len(flat), f"kich thuoc trong so khong khop: {offset} != {len(flat)}"
    model.load_state_dict(new_sd)


@torch.no_grad()
def evaluate(model: nn.Module, X: np.ndarray, y: np.ndarray) -> dict:
    model.eval()
    xb = torch.tensor(X, dtype=torch.float32)
    yb = torch.tensor(y, dtype=torch.long)
    logits = model(xb)
    loss = nn.functional.cross_entropy(logits, yb).item()
    pred = logits.argmax(1)
    acc = (pred == yb).float().mean().item()
    # F1 cho lop bat thuong (lop 1)
    tp = ((pred == 1) & (yb == 1)).sum().item()
    fp = ((pred == 1) & (yb == 0)).sum().item()
    fn = ((pred == 0) & (yb == 1)).sum().item()
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    return {"loss": loss, "acc": acc, "f1": f1}
