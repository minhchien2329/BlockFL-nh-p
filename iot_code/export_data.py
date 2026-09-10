"""Xuat du lieu cam bien mo phong cua tung node ra data/nodes_preview.json.

Dung khi muon xem du lieu ma khong chay ca pipeline:
    python iot_code/export_data.py --nodes 4 --alpha 0.4
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from iot_code.data_partition import export_preview, partition_non_iid  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nodes", type=int, default=4)
    ap.add_argument("--alpha", type=float, default=0.4)
    args = ap.parse_args()

    parts = partition_non_iid(n_nodes=args.nodes, dirichlet_alpha=args.alpha)
    preview = export_preview(parts)

    out = ROOT / "data" / "nodes_preview.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(json.dumps(preview, indent=2))
    print(f"-> {out}")
    for n in preview["nodes"]:
        print(f"  node {n['node_id']}: {n['n_train']:4d} train / {n['n_test']:3d} test | "
              f"binh thuong {n['n_normal']}, bat thuong {n['n_anomaly']} "
              f"(ti le {n['anomaly_ratio']:.2f})")


if __name__ == "__main__":
    main()
