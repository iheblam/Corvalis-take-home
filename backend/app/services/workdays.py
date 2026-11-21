"""Belgian public holidays and working-day arithmetic. Pure functions, no database access."""

from collections.abc import Iterable, Iterator
from datetime import date, timedelta


def today() -> date:
    """Single source of 'today', so tests can monkeypatch it."""
    return date.today()


def easter_sunday(year: int) -> date:
    """Gregorian Easter (anonymous Gregorian algorithm)."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    l = (32 + 2 * e + 2 * i - h - k) % 7  # noqa: E741
    m = (a + 11 * h + 22 * l) // 451
    month, day = divmod(h + l - 7 * m + 114, 31)
    return date(year, month, day + 1)


def belgian_holidays(year: int) -> list[tuple[date, str, bool]]:
    """The ten Belgian public holidays, plus a replacement day for each one falling on a Sunday.

    Policy (leave.md): "A public holiday falling on a Sunday is replaced by another day chosen
    by the company." We choose the next working day. Returns (date, name, is_replacement_day).
    """
    easter = easter_sunday(year)
    fixed = [
        (date(year, 1, 1), "New Year's Day"),
        (easter + timedelta(days=1), "Easter Monday"),
        (date(year, 5, 1), "Labour Day"),
        (easter + timedelta(days=39), "Ascension Day"),
        (easter + timedelta(days=50), "Whit Monday"),
        (date(year, 7, 21), "Belgian National Day"),
        (date(year, 8, 15), "Assumption Day"),
        (date(year, 11, 1), "All Saints' Day"),
        (date(year, 11, 11), "Armistice Day"),
        (date(year, 12, 25), "Christmas Day"),
    ]
    taken = {d for d, _ in fixed}
    result = [(d, name, False) for d, name in fixed]
    for d, name in fixed:
        if d.weekday() == 6:  # Sunday
            replacement = d + timedelta(days=1)
            while replacement.weekday() >= 5 or replacement in taken:
                replacement += timedelta(days=1)
            taken.add(replacement)
            result.append((replacement, f"{name} (replacement day)", True))
    return sorted(result)


def daterange(start: date, end: date) -> Iterator[date]:
    d = start
    while d <= end:
        yield d
        d += timedelta(days=1)


def is_working_day(d: date, holidays: set[date]) -> bool:
    return d.weekday() < 5 and d not in holidays


def working_days(start: date, end: date, holidays: Iterable[date]) -> list[date]:
    """Working days in [start, end], both inclusive."""
    hol = set(holidays)
    return [d for d in daterange(start, end) if is_working_day(d, hol)]


def count_working_days(start: date, end: date, holidays: Iterable[date]) -> int:
    return len(working_days(start, end, holidays))
