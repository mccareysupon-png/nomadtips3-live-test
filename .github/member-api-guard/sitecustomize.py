import os
import threading
import time
import urllib.error
import urllib.request

API_HOST = 'football.api-sports.io'
SAFETY = max(1.0, float(os.environ.get('MEMBER_API_RATE_SAFETY', '1.10')))
DEFAULT_LIMIT_PER_MINUTE = max(1.0, float(os.environ.get('MEMBER_API_DEFAULT_LIMIT_PER_MINUTE', '10')))
RATE_LIMIT_PAUSE_SECONDS = max(5.0, float(os.environ.get('MEMBER_API_429_PAUSE_SECONDS', '65')))

_original_urlopen = urllib.request.urlopen
_lock = threading.Lock()
_next_api_at = 0.0
_blocked_until = 0.0
_limit_per_minute = DEFAULT_LIMIT_PER_MINUTE


def _request_url(request):
    return str(getattr(request, 'full_url', None) or request or '')


def _header_number(response, name):
    try:
        value = response.headers.get(name)
        return float(value) if value is not None else None
    except Exception:
        return None


def _retry_after_seconds(error):
    try:
        raw = error.headers.get('Retry-After')
        value = float(raw)
        if value > 0:
            return value
    except Exception:
        pass
    return RATE_LIMIT_PAUSE_SECONDS


def _minimum_gap_seconds():
    return max(0.20, (60.0 / max(1.0, _limit_per_minute)) * SAFETY)


def guarded_urlopen(request, *args, **kwargs):
    global _next_api_at, _blocked_until, _limit_per_minute
    if API_HOST not in _request_url(request):
        return _original_urlopen(request, *args, **kwargs)

    # Serialize API-Football request starts so ThreadPool workers cannot burst
    # through the subscription's per-minute allowance.
    with _lock:
        now = time.monotonic()
        wait_for = max(_next_api_at - now, _blocked_until - now, 0.0)
        if wait_for > 0:
            time.sleep(wait_for)

        try:
            response = _original_urlopen(request, *args, **kwargs)
        except urllib.error.HTTPError as error:
            if int(getattr(error, 'code', 0) or 0) == 429:
                pause = _retry_after_seconds(error)
                _blocked_until = max(_blocked_until, time.monotonic() + pause)
                _next_api_at = _blocked_until
            raise

        learned_limit = _header_number(response, 'X-RateLimit-Limit')
        if learned_limit is not None and learned_limit > 0:
            _limit_per_minute = learned_limit

        remaining = _header_number(response, 'X-RateLimit-Remaining')
        gap = _minimum_gap_seconds()
        if remaining is not None and remaining <= 1:
            gap = max(gap, 60.0 / max(1.0, _limit_per_minute) * 2.0)
        _next_api_at = time.monotonic() + gap
        return response


urllib.request.urlopen = guarded_urlopen
