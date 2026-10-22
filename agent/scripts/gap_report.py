"""Print the knowledge gap report for the operations team.

    python scripts/gap_report.py              raw list grouped by reason
    python scripts/gap_report.py --summarize  themes + documents to write (one Haiku call)
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from novamart import gaps  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--summarize", action="store_true", help="Cluster gaps into themes with a small model")
    args = parser.parse_args()

    entries = gaps.load_gaps()
    print(gaps.report(entries))
    if args.summarize and entries:
        import anthropic

        print("\n== Themes and suggested documents ==\n")
        print(gaps.summarize(entries, anthropic.Anthropic()))


if __name__ == "__main__":
    main()
