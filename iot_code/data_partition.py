"""Sinh du lieu cam bien gia lap + chia non-IID cho cac edge node.

Moi node dai dien cho 1 benh vien/tram quan trac, phan bo lop (binh thuong /
bat thuong) lech nhau (non-IID) qua phan phoi Dirichlet.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

FEATURE_NAMES = ["heart_rate", "spo2", "body_temp", "hr_var", "motion"]


@dataclass
class NodeDataset:
    node_id: int
    X_train: np.ndarray
    y_train: np.ndarray
    X_test: np.ndarray
    y_test: np.ndarray
    X_train_raw: np.ndarray | None = None  # gia tri cam bien goc (truoc chuan hoa)

    @property
    def n_samples(self) -> int:
        return len(self.y_train)


def _sample_vitals(n: int, anomaly: bool, rng: np.random.Generator) -> np.ndarray:
    """Sinh n mau vitals. anomaly=True -> lech ra vung nguy hiem."""
    if not anomaly:
        hr = rng.normal(75, 8, n)
        spo2 = rng.normal(97, 1.2, n)
        temp = rng.normal(36.7, 0.3, n)
    else:
        # nhip nhanh/cham bat thuong, spo2 tut, sot
        hr = np.where(rng.random(n) < 0.5, rng.normal(135, 12, n), rng.normal(45, 6, n))
        spo2 = rng.normal(89, 3.0, n)
        temp = rng.normal(38.6, 0.6, n)
    hr_var = np.abs(rng.normal(0, 1, n)) * (3 if anomaly else 1)
    motion = rng.random(n)
    return np.stack([hr, spo2, temp, hr_var, motion], axis=1)


def _make_pool(n_normal: int, n_anom: int, rng: np.random.Generator):
    X = np.vstack([
        _sample_vitals(n_normal, False, rng),
        _sample_vitals(n_anom, True, rng),
    ])
    y = np.concatenate([np.zeros(n_normal, int), np.ones(n_anom, int)])
    idx = rng.permutation(len(y))
    return X[idx], y[idx]


def _standardize(X_tr: np.ndarray, X_te: np.ndarray):
    mu = X_tr.mean(0)
    sd = X_tr.std(0) + 1e-8
    return (X_tr - mu) / sd, (X_te - mu) / sd


def partition_non_iid(
    n_nodes: int = 4,
    samples_per_node: tuple[int, int] = (200, 500),
    dirichlet_alpha: float = 0.4,
    test_frac: float = 0.25,
    seed: int = 7,
) -> list[NodeDataset]:
    """Tra ve danh sach NodeDataset da chia non-IID.

    dirichlet_alpha nho  -> cang lech (non-IID manh)
    dirichlet_alpha lon  -> gan IID
    """
    rng = np.random.default_rng(seed)

    # Ti le lop bat thuong cua tung node theo Dirichlet
    anom_ratio = rng.dirichlet([dirichlet_alpha] * n_nodes)
    anom_ratio = 0.1 + 0.6 * (anom_ratio / anom_ratio.max())  # ep ve [0.1, 0.7]

    nodes: list[NodeDataset] = []
    for i in range(n_nodes):
        n_total = int(rng.integers(samples_per_node[0], samples_per_node[1] + 1))
        n_anom = max(1, int(round(n_total * anom_ratio[i])))
        n_normal = n_total - n_anom
        X, y = _make_pool(n_normal, n_anom, rng)

        n_test = max(1, int(round(n_total * test_frac)))
        X_te, y_te = X[:n_test], y[:n_test]
        X_tr_raw, y_tr = X[n_test:], y[n_test:]
        X_tr, X_te = _standardize(X_tr_raw, X_te)

        nodes.append(NodeDataset(i, X_tr, y_tr, X_te, y_te, X_train_raw=X_tr_raw))
    return nodes


def export_preview(nodes: list[NodeDataset], n_rows: int = 6) -> dict:
    """Tom tat du lieu cam bien goc cua tung node (cho dashboard)."""
    out = {"features": FEATURE_NAMES, "nodes": []}
    for nd in nodes:
        Xr, y = nd.X_train_raw, nd.y_train

        def stats(mask):
            sub = Xr[mask]
            if len(sub) == 0:
                return {f: None for f in FEATURE_NAMES}
            return {f: [round(float(sub[:, k].mean()), 2), round(float(sub[:, k].std()), 2)]
                    for k, f in enumerate(FEATURE_NAMES)}

        idx = list(np.argsort(y)[:n_rows // 2]) + list(np.argsort(-y)[:n_rows - n_rows // 2])
        rows = [{"label": int(y[j]),
                 **{f: round(float(Xr[j, k]), 2) for k, f in enumerate(FEATURE_NAMES)}}
                for j in idx]

        out["nodes"].append({
            "node_id": nd.node_id,
            "n_train": int(len(y)),
            "n_test": int(len(nd.y_test)),
            "n_normal": int((y == 0).sum()),
            "n_anomaly": int((y == 1).sum()),
            "anomaly_ratio": round(float(y.mean()), 3),
            "stats_normal": stats(y == 0),
            "stats_anomaly": stats(y == 1),
            "sample_rows": rows,
        })
    return out


def global_test_set(nodes: list[NodeDataset]):
    """Gop test set cua tat ca node -> danh gia global model."""
    X = np.vstack([n.X_test for n in nodes])
    y = np.concatenate([n.y_test for n in nodes])
    return X, y


if __name__ == "__main__":
    ds = partition_non_iid()
    for n in ds:
        ratio = n.y_train.mean()
        print(f"node {n.node_id}: {n.n_samples:4d} train | ti le bat thuong = {ratio:.2f}")
