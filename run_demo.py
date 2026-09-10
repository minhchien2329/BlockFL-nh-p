"""Orchestrator demo BlockFL end-to-end.

Che do:
  --no-chain : chi chay Federated Learning (khong can Hardhat) - de kiem tra nhanh
  (mac dinh) : chay day du, node nop hash len smart contract, owner aggregate +
               phat token thuong qua Web3.py

Chuan bi cho che do co chain:
  1) terminal A:  npx hardhat node
  2) terminal B:  npx hardhat run scripts/deploy.js --network localhost
  3) terminal B:  python run_demo.py --rounds 5
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from ai_model.fedavg import fedavg, save_weights, weights_hash
from ai_model.model import build_model, evaluate, get_flat_weights
from iot_code.data_partition import export_preview, global_test_set, partition_non_iid
from iot_code.edge_node import EdgeNode

ROOT = Path(__file__).resolve().parent


def build_nodes(n_nodes: int, alpha: float, epochs: int, lr: float):
    parts = partition_non_iid(n_nodes=n_nodes, dirichlet_alpha=alpha)
    nodes = [EdgeNode(p, epochs=epochs, lr=lr) for p in parts]
    return nodes, parts


def run(rounds: int, n_nodes: int, alpha: float, epochs: int, lr: float,
        use_chain: bool, network: str):
    chain = None
    if use_chain:
        from scripts.web3_interface import ChainClient

        chain = ChainClient(network)
        n_nodes = len(chain.nodes)
        print(f"[chain] network={chain.info['network']} minNodes={chain.info['minNodes']} "
              f"nodes={n_nodes}")

    nodes, parts = build_nodes(n_nodes, alpha, epochs, lr)
    if chain:
        for nd, addr in zip(nodes, chain.nodes):
            nd.address = addr

    prev_path = ROOT / "data" / "nodes_preview.json"
    prev_path.parent.mkdir(exist_ok=True)
    prev_path.write_text(json.dumps(export_preview(parts), indent=2))
    print(f"Du lieu mo phong tung node -> {prev_path}")

    Xg, yg = global_test_set(parts)
    gmodel = build_model()
    global_flat = get_flat_weights(gmodel)

    print("\n=== Cau hinh node (non-IID) ===")
    for nd in nodes:
        print(f"  node {nd.node_id}: {nd.n_samples:4d} mau | ti le bat thuong = "
              f"{nd.ds.y_train.mean():.2f}")

    base = evaluate(gmodel, Xg, yg)
    print(f"\nGlobal model khoi tao : acc={base['acc']:.3f} f1={base['f1']:.3f}")

    history = []
    for r in range(1, rounds + 1):
        onchain_round = chain.current_round() if chain else r
        updates = [nd.train_round(global_flat, r) for nd in nodes]

        local_flats = [u["local_flat"] for u in updates]
        n_samples = [u["n_samples"] for u in updates]

        if chain:
            for u in updates:
                chain.submit_weights(u["address"], u["weights_hash"], u["n_samples"], onchain_round)
            print(f"[chain] round {onchain_round}: {len(updates)} node da submit hash")

        # FedAvg off-chain
        new_global = fedavg(local_flats, n_samples)
        gpath = save_weights(new_global, ROOT / "ai_model" / "weights" / f"global_round_{r}.npy")
        ghash = weights_hash(new_global)

        if chain:
            chain.aggregate(onchain_round, ghash)
            chain.distribute_reward(onchain_round)
            chain.advance_round()
            rd = chain.get_round(onchain_round)
            print(f"[chain] ModelAggregated round {onchain_round}: "
                  f"totalSamples={rd['totalSamples']} hash={ghash[:14]}...")

        global_flat = new_global
        from ai_model.model import set_flat_weights
        set_flat_weights(gmodel, global_flat)
        m = evaluate(gmodel, Xg, yg)
        row = {"round": r, "acc": m["acc"], "f1": m["f1"], "loss": m["loss"],
               "global_hash": ghash, "weights_file": gpath}
        history.append(row)
        print(f"Round {r:2d} | global acc={m['acc']:.3f} f1={m['f1']:.3f} loss={m['loss']:.3f}")

    if chain:
        print("\n=== So du token thuong (BFL) ===")
        for addr, bal in chain.token_balances().items():
            print(f"  {addr}  {bal:.4f} BFL")

    out = {
        "config": {"rounds": rounds, "n_nodes": n_nodes, "dirichlet_alpha": alpha,
                   "epochs": epochs, "lr": lr, "chain": bool(chain), "network": network},
        "baseline": base,
        "history": history,
    }
    res_path = ROOT / "results.json"
    res_path.write_text(json.dumps(out, indent=2))
    print(f"\nKet qua -> {res_path}")
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rounds", type=int, default=5)
    ap.add_argument("--nodes", type=int, default=4, help="chi dung khi --no-chain")
    ap.add_argument("--alpha", type=float, default=0.4, help="Dirichlet alpha, nho = non-IID manh")
    ap.add_argument("--epochs", type=int, default=5)
    ap.add_argument("--lr", type=float, default=0.05)
    ap.add_argument("--no-chain", action="store_true", help="chi chay FL, khong dung blockchain")
    ap.add_argument("--network", default="localhost")
    args = ap.parse_args()

    run(args.rounds, args.nodes, args.alpha, args.epochs, args.lr,
        use_chain=not args.no_chain, network=args.network)


if __name__ == "__main__":
    main()
