"""Currency helper. Twenty currency fields use { amountMicros, currencyCode };
dollars are stored as micros (dollars x 1_000_000), rounded to the nearest micro.

Centralized so every dollars->micros conversion in the migration is identical and
the reconciliation can trust a single rounding rule.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

MICROS = Decimal(1_000_000)


def to_micros(dollars) -> int:
    """Dollars (str/int/float/Decimal) -> integer micros, half-up rounding.

    Uses Decimal to avoid binary float drift (e.g. 19.99 -> 19990000, not 19989999).
    """
    if dollars is None or dollars == "":
        return 0
    cents = Decimal(str(dollars)) * MICROS
    return int(cents.quantize(Decimal(1), rounding=ROUND_HALF_UP))


def money(dollars, currency: str = "USD") -> dict:
    """Build a Twenty currency object."""
    return {"amountMicros": to_micros(dollars), "currencyCode": currency}


def micros_to_dollars(micros: int):
    """Inverse, for reconciliation reporting."""
    return (Decimal(int(micros)) / MICROS).quantize(Decimal("0.01"))
