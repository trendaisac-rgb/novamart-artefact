"""Paths and settings. Everything that may change between environments lives here."""

import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

REPO_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = REPO_ROOT / "data"
POLICIES_DIR = DATA_DIR / "policies"
ORDERS_FILE = DATA_DIR / "orders.json"
GAPS_FILE = DATA_DIR / "knowledge_gaps.jsonl"
TICKETS_FILE = DATA_DIR / "tickets.jsonl"
EVAL_RESULTS_DIR = REPO_ROOT / "evals" / "results"

# Model used by the agent. Sonnet is the balance of quality, speed and cost for an
# internal assistant. Haiku is used for cheap side jobs (eval judge, gap clustering).
AGENT_MODEL = os.getenv("NOVAMART_AGENT_MODEL", "claude-sonnet-5-5")
SMALL_MODEL = os.getenv("NOVAMART_SMALL_MODEL", "claude-haiku-5-5")

# Retrieval
SEARCH_TOP_K = int(os.getenv("NOVAMART_SEARCH_TOP_K", "5"))

# Agent loop guard. A normal question takes 2 to 4 steps (search, maybe a tool, respond).
MAX_AGENT_STEPS = int(os.getenv("NOVAMART_MAX_STEPS", "8"))
MAX_TOKENS = 1500
