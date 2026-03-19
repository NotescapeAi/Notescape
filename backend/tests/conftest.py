import asyncio
import inspect
import sys

import pytest

_session_loop: asyncio.AbstractEventLoop | None = None


def pytest_sessionstart(session):
    global _session_loop
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    _session_loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_session_loop)


def pytest_sessionfinish(session, exitstatus):
    global _session_loop
    if _session_loop is None:
        return
    try:
        from app.core.db import close_pool
        asyncio.set_event_loop(_session_loop)
        _session_loop.run_until_complete(close_pool())
    except Exception:
        pass
    try:
        asyncio.set_event_loop(_session_loop)
        pending = asyncio.all_tasks(_session_loop)
        for t in pending:
            t.cancel()
        if pending:
            _session_loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
    except Exception:
        pass
    if not _session_loop.is_closed():
        _session_loop.close()
    _session_loop = None


@pytest.fixture(scope="session")
def event_loop():
    global _session_loop
    if _session_loop is None or _session_loop.is_closed():
        pytest_sessionstart(None)
    assert _session_loop is not None
    yield _session_loop


@pytest.fixture(autouse=True)
def _restore_event_loop(event_loop):
    asyncio.set_event_loop(event_loop)
    yield
    asyncio.set_event_loop(event_loop)


def pytest_configure(config):
    config.addinivalue_line("markers", "asyncio: run test in asyncio event loop")


@pytest.hookimpl(tryfirst=True)
def pytest_pyfunc_call(pyfuncitem):
    testfunction = pyfuncitem.obj
    if not inspect.iscoroutinefunction(testfunction):
        return None
    loop = _session_loop or pyfuncitem.funcargs.get("event_loop")
    if loop is None:
        pytest_sessionstart(None)
        loop = _session_loop
    assert loop is not None
    asyncio.set_event_loop(loop)
    funcargs = {name: pyfuncitem.funcargs[name] for name in pyfuncitem._fixtureinfo.argnames}
    loop.run_until_complete(testfunction(**funcargs))
    return True
