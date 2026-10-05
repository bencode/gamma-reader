"""Summarize a week of morning bird counts.

The same numbers as Observation log.csv, so this script reads like the
spreadsheet: one count per morning, from Monday to Sunday.
"""

from statistics import mean

COUNTS = {
    "Mon": 12,
    "Tue": 17,
    "Wed": 9,
    "Thu": 5,
    "Fri": 21,
    "Sat": 14,
    "Sun": 11,
}


def quietest(counts: dict[str, int]) -> str:
    """The morning with the fewest birds."""
    return min(counts, key=counts.__getitem__)


def rises(counts: dict[str, int]) -> int:
    """How many mornings were busier than the one before."""
    values = list(counts.values())
    return sum(later > earlier for earlier, later in zip(values, values[1:]))


if __name__ == "__main__":
    print(f"Average: {mean(COUNTS.values()):.1f} birds a morning")
    print(f"Quietest: {quietest(COUNTS)}")
    print(f"Busier than the day before: {rises(COUNTS)} mornings")
