"""Gia lap 1 Edge Node bien.

Moi node:
  - giu dataset cuc bo (non-IID)
  - nhan global weights, huan luyen cuc bo (FedAvg local step)
  - tinh hash trong so Delta w de nop len smart contract
"""
from __future__ import annotations

import numpy as np

from ai_model.fedavg import weights_hash
from ai_model.local_train import local_update
from iot_code.data_partition import NodeDataset


class EdgeNode:
    def __init__(self, dataset: NodeDataset, address: str | None = None,
                 epochs: int = 5, lr: float = 0.05):
        self.ds = dataset
        self.address = address
        self.epochs = epochs
        self.lr = lr
        self.last_local_flat: np.ndarray | None = None

    @property
    def node_id(self) -> int:
        return self.ds.node_id

    @property
    def n_samples(self) -> int:
        return self.ds.n_samples

    def train_round(self, global_flat: np.ndarray, rnd: int) -> dict:
        local_flat, before = local_update(
            global_flat, self.ds.X_train, self.ds.y_train,
            epochs=self.epochs, lr=self.lr, seed=1000 * rnd + self.node_id,
        )
        self.last_local_flat = local_flat
        return {
            "node_id": self.node_id,
            "address": self.address,
            "n_samples": self.n_samples,
            "local_flat": local_flat,
            "weights_hash": weights_hash(local_flat),
            "acc_before": before["acc"],
        }
