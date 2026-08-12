class ProviderRateLimitError(RuntimeError):
    def __init__(self, retry_after=None, detail=None):
        self.retry_after = self._seconds(retry_after)
        message = detail or "API-Football rate limited (429)"
        if retry_after is not None:
            message = f"{message}; retry-after={retry_after}"
        super().__init__(message)

    @staticmethod
    def _seconds(value):
        try:
            return max(1, int(float(value)))
        except (TypeError, ValueError):
            return None
