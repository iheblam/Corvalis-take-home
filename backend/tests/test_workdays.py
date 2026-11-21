from datetime import date

from app.services.workdays import belgian_holidays, count_working_days, easter_sunday


def test_easter():
    assert easter_sunday(2026) == date(2026, 4, 5)
    assert easter_sunday(2027) == date(2027, 3, 28)


def test_ten_holidays_plus_sunday_replacement():
    hols = belgian_holidays(2026)
    assert len([h for h in hols if not h[2]]) == 10
    # All Saints' Day 2026 is a Sunday -> replaced by Monday 2 November.
    assert (date(2026, 11, 2), "All Saints' Day (replacement day)", True) in hols
    # Assumption 2026 is a Saturday: not replaced (policy only mentions Sundays).
    assert not any(h[2] and h[0] == date(2026, 8, 17) for h in hols)


def test_working_days_skip_weekends_and_holidays():
    hols = [d for d, _, _ in belgian_holidays(2026) + belgian_holidays(2027)]
    # Mon 21 Dec 2026 -> Fri 1 Jan 2027: 10 weekdays minus Christmas and New Year.
    assert count_working_days(date(2026, 12, 21), date(2027, 1, 1), hols) == 8
    assert count_working_days(date(2026, 11, 21), date(2026, 11, 22), hols) == 0  # weekend
