"""Baseline tap trung: gom du lieu CA 4 node lai train 1 mo hinh duy nhat.

Day la moc so sanh kinh dien cho Federated Learning: "neu khong quan tam
rieng tu va gui het du lieu ve 1 cho de train binh thuong thi accuracy
duoc bao nhieu?". So sanh con so nay voi accuracy cua FedAvg (results.json)
cho thay FL mat/duoc bao nhieu so voi train tap trung, tren cung 1 tap
test va cung kien truc mo hinh.

Chay:
    python ai_model/baseline_centralized.py
    python ai_model/baseline_centralized.py --seed 42 --epochs 25
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))  # cho phep chay truc tiep "python ai_model/baseline_centralized.py"

from ai_model.model import build_model, evaluate  # noqa: E402
from iot_code.data_partition import global_test_set, partition_non_iid  # noqa: E402


def train_centralized(X: np.ndarray, y: np.ndarray, epochs: int, lr: float,
                       batch_size: int = 32, seed: int = 0) -> nn.Module:
    torch.manual_seed(seed)
    model = build_model()
    opt = torch.optim.SGD(model.parameters(), lr=lr, momentum=0.9)
    loss_fn = nn.CrossEntropyLoss()
    xb_all = torch.tensor(X, dtype=torch.float32)
    yb_all = torch.tensor(y, dtype=torch.long)
    n = len(y)

    model.train()
    for _ in range(epochs):
        perm = torch.randperm(n)
        for i in range(0, n, batch_size):
            idx = perm[i:i + batch_size]
            opt.zero_grad()
            loss = loss_fn(model(xb_all[idx]), yb_all[idx])
            loss.backward()
            opt.step()
    return model


def run(n_nodes: int = 4, alpha: float = 0.4, seed: int = 7,
        epochs: int = 25, lr: float = 0.05) -> dict:
    """epochs=25 de so sanh cong bang voi FedAvg mac dinh (5 round x 5 epoch
    local = 25 luot node duyet qua du lieu cua no)."""
    parts = partition_non_iid(n_nodes=n_nodes, dirichlet_alpha=alpha, seed=seed)

    # Gom het du lieu train cua tung node lai thanh 1 tap duy nhat -
    # day chinh la dieu Federated Learning co tinh tranh (khong ai duoc
    # thay du lieu tho cua node khac).
    X_all = np.concatenate([p.X_train for p in parts], axis=0)
    y_all = np.concatenate([p.y_train for p in parts], axis=0)
    Xg, yg = global_test_set(parts)

    print(f"Tong mau train gom tu {n_nodes} node: {len(y_all)} (bang dung tong so mau FedAvg dung)")

    model = train_centralized(X_all, y_all, epochs=epochs, lr=lr, seed=seed)
    metrics = evaluate(model, Xg, yg)
    print(f"Baseline tap trung ({epochs} epoch) | acc={metrics['acc']:.3f} "
          f"f1={metrics['f1']:.3f} loss={metrics['loss']:.3f}")

    out = {
        "config": {"n_nodes": n_nodes, "dirichlet_alpha": alpha, "seed": seed,
                   "epochs": epochs, "lr": lr, "n_train_total": int(len(y_all))},
        "metrics": metrics,
    }
    out_path = ROOT / "results_baseline_centralized.json"
    out_path.write_text(json.dumps(out, indent=2))
    print(f"Ket qua -> {out_path}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nodes", type=int, default=4)
    ap.add_argument("--alpha", type=float, default=0.4)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--lr", type=float, default=0.05)
    args = ap.parse_args()
    run(args.nodes, args.alpha, args.seed, args.epochs, args.lr)


if __name__ == "__main__":
    main()
