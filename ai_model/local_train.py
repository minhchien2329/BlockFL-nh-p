"""Huan luyen cuc bo tai 1 edge node (vai epoch) roi tra ve trong so moi."""
from __future__ import annotations

import numpy as np
import torch
import torch.nn as nn

from ai_model.model import build_model, get_flat_weights, set_flat_weights, evaluate


def local_update(
    global_flat: np.ndarray,
    X: np.ndarray,
    y: np.ndarray,
    epochs: int = 5,
    lr: float = 0.05,
    batch_size: int = 32,
    seed: int = 0,
) -> tuple[np.ndarray, dict]:
    """Nhan global weights -> train local -> tra ve (local_flat, metrics_truoc_train)."""
    torch.manual_seed(seed)
    model = build_model()
    set_flat_weights(model, global_flat)

    before = evaluate(model, X, y)

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

    return get_flat_weights(model), before
