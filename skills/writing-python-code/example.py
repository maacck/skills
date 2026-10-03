"""Top-customer report from an orders CSV.

Reference module for the writing-python-code skill: `build_report` is the
orchestrator and reads as a list of steps; each step is small, typed, and
documented. IO stays at the edges (`main`, `_read_rows`). Requires Python 3.10+.

Usage:
    python example.py orders.csv rates.json --top 5 --out report.json
"""

import argparse
import csv
import json
from collections import defaultdict
from collections.abc import Iterable, Iterator, Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import TypedDict


class InvalidRowError(ValueError):
    """A CSV row has a non-numeric amount or an unknown currency."""


@dataclass(frozen=True)
class Order:
    """A paid order converted to USD.

    Attributes:
        customer_id: Customer that placed the order.
        amount_usd: Order amount in US dollars.
    """

    customer_id: str
    amount_usd: float


class CustomerTotal(TypedDict):
    """One ranked customer in the report.

    Attributes:
        customer_id: Customer identifier from the CSV.
        total_usd: Sum of the customer's paid orders in USD, rounded to cents.
    """

    customer_id: str
    total_usd: float


class Report(TypedDict):
    """Report written to the output JSON file.

    Attributes:
        top_customers: Highest-spending customers, highest first.
        rejected: Paid rows skipped for a bad amount or unknown currency.
    """

    top_customers: list[CustomerTotal]
    rejected: int


def main(argv: Sequence[str] | None = None) -> None:
    """Runs the CLI: reads the inputs, builds the report, writes it as JSON.

    Args:
        argv: Command-line arguments without the program name; `None` reads
            `sys.argv`.
    """
    args = _parse_args(argv)
    rates: dict[str, float] = json.loads(args.rates_path.read_text())
    report = build_report(_read_rows(args.csv_path), rates, args.top)
    args.out.write_text(json.dumps(report, indent=2))


def build_report(
    rows: Iterable[Mapping[str, str]], rates: Mapping[str, float], top: int
) -> Report:
    """Builds the top-customer report from raw CSV rows.

    Args:
        rows: CSV rows keyed by order_id, customer_id, amount, currency, status.
        rates: USD conversion rate per currency code.
        top: Maximum number of customers to include.

    Returns:
        The `top` customers by USD total and the number of paid rows rejected.
    """
    # Refunded and pending orders never count toward spend, so filter them
    # before validation: their bad amounts are not reported as rejected.
    paid_rows = [row for row in rows if row["status"] == "paid"]
    # Unconvertible rows are dropped but counted, so the report shows how
    # much input was ignored instead of silently shrinking totals.
    orders, rejected = _parse_orders(paid_rows, rates)
    totals = _total_by_customer(orders)
    # Rank on unrounded totals; rounding to cents is display-only.
    return {"top_customers": _rank(totals, top), "rejected": rejected}


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    """Parses command-line arguments.

    Args:
        argv: Arguments without the program name; `None` reads `sys.argv`.

    Returns:
        Namespace with `csv_path`, `rates_path`, `top`, and `out`.
    """
    parser = argparse.ArgumentParser(description="Top customers by USD order total.")
    parser.add_argument("csv_path", type=Path, help="orders CSV")
    parser.add_argument("rates_path", type=Path, help="JSON of currency -> USD rate")
    parser.add_argument("--top", type=int, default=5, help="customers to include")
    parser.add_argument("--out", type=Path, required=True, help="output JSON path")
    return parser.parse_args(argv)


def _read_rows(csv_path: Path) -> Iterator[dict[str, str]]:
    """Streams rows from an orders CSV.

    Args:
        csv_path: Path to the CSV file; the first line holds column names.

    Yields:
        One row per order, keyed by column name.
    """
    with csv_path.open(newline="") as handle:
        yield from csv.DictReader(handle)


def _parse_orders(
    rows: Iterable[Mapping[str, str]], rates: Mapping[str, float]
) -> tuple[list[Order], int]:
    """Converts rows to USD orders, counting rows that cannot be converted.

    Args:
        rows: Paid CSV rows.
        rates: USD conversion rate per currency code.

    Returns:
        The converted orders, and the number of rejected rows.
    """
    orders: list[Order] = []
    rejected = 0
    for row in rows:
        try:
            orders.append(_to_order(row, rates))
        except InvalidRowError:
            rejected += 1
    return orders, rejected


def _to_order(row: Mapping[str, str], rates: Mapping[str, float]) -> Order:
    """Converts one CSV row to a USD order.

    Args:
        row: CSV row with customer_id, amount, and currency.
        rates: USD conversion rate per currency code.

    Returns:
        The order with its amount converted to USD.

    Raises:
        InvalidRowError: If the amount is not a number or the currency has no rate.
    """
    rate = rates.get(row["currency"])
    if rate is None:
        raise InvalidRowError(f"unknown currency: {row['currency']!r}")
    try:
        amount = float(row["amount"])
    except ValueError as exc:
        raise InvalidRowError(f"non-numeric amount: {row['amount']!r}") from exc
    return Order(customer_id=row["customer_id"], amount_usd=amount * rate)


def _total_by_customer(orders: Iterable[Order]) -> dict[str, float]:
    """Sums USD amounts per customer.

    Args:
        orders: Converted orders.

    Returns:
        USD total keyed by customer ID; empty when there are no orders.
    """
    totals: defaultdict[str, float] = defaultdict(float)
    for order in orders:
        totals[order.customer_id] += order.amount_usd
    return dict(totals)


def _rank(totals: Mapping[str, float], top: int) -> list[CustomerTotal]:
    """Picks the customers with the highest totals.

    Args:
        totals: USD total keyed by customer ID.
        top: Maximum number of customers to return.

    Returns:
        Up to `top` customers, highest total first, totals rounded to cents.
    """
    # `sorted` is stable and dicts keep insertion order, so tied totals keep
    # the CSV order of each customer's first valid order: deterministic output.
    ranked = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    return [
        {"customer_id": customer_id, "total_usd": round(total, 2)}
        for customer_id, total in ranked[:top]
    ]


if __name__ == "__main__":
    main()
