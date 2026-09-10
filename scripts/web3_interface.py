"""Cau noi Web3.py <-> Smart Contract FederatedAggregator.

Doc file deployments/<network>.json (do scripts/deploy.js sinh ra) de lay
address + ABI, cung cap cac ham tien ich cho pipeline Federated Learning.
"""
from __future__ import annotations

import json
from pathlib import Path

from web3 import Web3

ROOT = Path(__file__).resolve().parents[1]
DEPLOY_DIR = ROOT / "deployments"


class ChainClient:
    def __init__(self, network: str = "localhost"):
        info_path = DEPLOY_DIR / f"{network}.json"
        if not info_path.exists():
            raise FileNotFoundError(
                f"Chua co {info_path}. Hay chay: npx hardhat run scripts/deploy.js --network {network}"
            )
        self.info = json.loads(info_path.read_text())
        self.w3 = Web3(Web3.HTTPProvider(self.info["rpcUrl"]))
        if not self.w3.is_connected():
            raise ConnectionError(f"Khong ket noi duoc RPC {self.info['rpcUrl']}")

        self.token = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.info["token"]["address"]),
            abi=self.info["token"]["abi"],
        )
        self.agg = self.w3.eth.contract(
            address=Web3.to_checksum_address(self.info["aggregator"]["address"]),
            abi=self.info["aggregator"]["abi"],
        )
        self.owner = Web3.to_checksum_address(self.info["owner"])
        self.nodes = [Web3.to_checksum_address(a) for a in self.info["nodes"]]

    # ---- helpers ---------------------------------------------------------
    def _send(self, func, sender: str):
        tx_hash = func.transact({"from": sender})
        return self.w3.eth.wait_for_transaction_receipt(tx_hash)

    @staticmethod
    def to_bytes32(hexstr: str) -> bytes:
        h = hexstr[2:] if hexstr.startswith("0x") else hexstr
        return bytes.fromhex(h.rjust(64, "0"))[:32]

    # ---- workflow ------------------------------------------------------
    def current_round(self) -> int:
        return self.agg.functions.currentRound().call()

    def submit_weights(self, node: str, weights_hash: str, n_samples: int, rnd: int):
        node = Web3.to_checksum_address(node)
        return self._send(
            self.agg.functions.submitWeights(self.to_bytes32(weights_hash), n_samples, rnd),
            node,
        )

    def aggregate(self, rnd: int, global_hash: str):
        return self._send(
            self.agg.functions.aggregate(rnd, self.to_bytes32(global_hash)), self.owner
        )

    def distribute_reward(self, rnd: int):
        return self._send(self.agg.functions.distributeReward(rnd), self.owner)

    def advance_round(self):
        return self._send(self.agg.functions.advanceRound(), self.owner)

    def get_round(self, rnd: int) -> dict:
        g, total, cnt, done, subs = self.agg.functions.getRound(rnd).call()
        return {
            "globalModelHash": g.hex() if isinstance(g, (bytes, bytearray)) else g,
            "totalSamples": total,
            "submissionCount": cnt,
            "aggregated": done,
            "submitters": subs,
        }

    def token_balances(self) -> dict[str, float]:
        out = {}
        for a in self.nodes:
            bal = self.token.functions.balanceOf(a).call()
            out[a] = bal / 1e18
        return out
