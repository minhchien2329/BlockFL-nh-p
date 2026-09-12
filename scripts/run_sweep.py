"""Quet nhieu seed de tra loi cau hoi: ket qua co on dinh khong, hay an may?

Moi seed = MOT lan chia du lieu non-IID khac han (ti le bat thuong tung node,
so mau tung node, gia tri cam bien deu doi). Chay Federated Learning tren tung
lan chia do roi bao cao trung binh + do lech chuan.

Chay KHONG dung blockchain (--no-chain ben trong): cau hoi o day la ve chat
luong mo hinh, khong phai ve chuoi. Nho vay no cung khong dung toi on-chain
state hay results.json cua lan chay chinh.

Dung:
    python scripts/run_sweep.py                  # 10 seed mac dinh
    python scripts/run_sweep.py --seeds 1 2 3 4 5 6 7 8
    python scripts/run_sweep.py --rounds 3 --seeds 7 42
"""
from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from run_demo import run  # noqa: E402

DEFAULT_SEEDS = [7, 13, 42, 99, 2024, 1, 5, 88, 123, 777]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, nargs="+", default=DEFAULT_SEEDS)
    ap.add_argument("--rounds", type=int, default=5)
    ap.add_argument("--nodes", type=int, default=4)
    ap.add_argument("--alpha", type=float, default=0.4)
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--lr", type=float, default=0.05)
    args = ap.parse_args()

    print(f"Quet {len(args.seeds)} seed x {args.rounds} round — moi seed la mot lan chia du lieu khac\n")
    runs = []
    t_all = time.perf_counter()

    for i, seed in enumerate(args.seeds, 1):
        t0 = time.perf_counter()
        out = run(args.rounds, args.nodes, args.alpha, args.epochs, args.lr,
                  use_chain=False, network="localhost", seed=seed,
                  write_files=False, quiet=True)
        last = out["history"][-1]
        # local_acc = tung node tu train mot minh, cham tren tap test chung
        locals_ = [n["local_acc"] for n in last["nodes"]]
        runs.append({
            "seed": seed,
            "acc": last["acc"],
            "f1": last["f1"],
            "loss": last["loss"],
            "baseline_acc": out["baseline"]["acc"],
            "best_local_acc": max(locals_),
            "worst_local_acc": min(locals_),
            "beats_every_local": last["acc"] > max(locals_),
            "history_acc": [h["acc"] for h in out["history"]],
            "seconds": round(time.perf_counter() - t0, 1),
        })
        r = runs[-1]
        print(f"  [{i}/{len(args.seeds)}] seed {seed:>4} | global {r['acc']*100:5.1f}% "
              f"| node tot nhat tu train {r['best_local_acc']*100:5.1f}% "
              f"| {'FedAvg thang' if r['beats_every_local'] else 'FedAvg KHONG thang'} "
              f"| {r['seconds']}s")

    accs = [r["acc"] for r in runs]
    f1s = [r["f1"] for r in runs]
    gaps = [r["acc"] - r["best_local_acc"] for r in runs]
    sd = (lambda xs: statistics.stdev(xs) if len(xs) > 1 else 0.0)

    summary = {
        "n_runs": len(runs),
        "rounds": args.rounds,
        "acc_mean": statistics.fmean(accs), "acc_std": sd(accs),
        "acc_min": min(accs), "acc_max": max(accs),
        "f1_mean": statistics.fmean(f1s), "f1_std": sd(f1s),
        "gap_mean": statistics.fmean(gaps), "gap_min": min(gaps), "gap_max": max(gaps),
        "wins": sum(r["beats_every_local"] for r in runs),
    }

    out_path = ROOT / "results_sweep.json"
    out_path.write_text(json.dumps({
        "config": {"seeds": args.seeds, "rounds": args.rounds, "n_nodes": args.nodes,
                   "dirichlet_alpha": args.alpha, "epochs": args.epochs, "lr": args.lr},
        "summary": summary,
        "runs": runs,
    }, indent=2))

    print(f"\n=== Tong ket {len(runs)} lan chia du lieu ===")
    print(f"  Accuracy  : {summary['acc_mean']*100:.1f}% ± {summary['acc_std']*100:.1f} "
          f"(thap nhat {summary['acc_min']*100:.1f}%, cao nhat {summary['acc_max']*100:.1f}%)")
    print(f"  F1        : {summary['f1_mean']*100:.1f}% ± {summary['f1_std']*100:.1f}")
    print(f"  FedAvg thang MOI node tu train: {summary['wins']}/{len(runs)} lan")
    print(f"  Cach biet so voi node tot nhat: trung binh +{summary['gap_mean']*100:.1f} diem %")
    print(f"\nKet qua -> {out_path}   ({round(time.perf_counter() - t_all, 1)}s)")


if __name__ == "__main__":
    main()
