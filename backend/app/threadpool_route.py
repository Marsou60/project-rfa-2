"""
Les routes FastAPI déclarées `async def` s'exécutent sur la boucle.
Ici elles appellent SQLAlchemy / psycopg2 de façon synchrone : une requête
bloque toutes les autres. On les déplace dans le threadpool, sauf si elles
attendent vraiment (await fichier, service async).
"""
from __future__ import annotations

import ast
import asyncio
import inspect
import textwrap

from fastapi.routing import APIRoute


def _function_awaits(fn) -> bool:
    """True si le corps (hors fonctions imbriquées) contient un await."""
    try:
        source = inspect.getsource(fn)
    except (OSError, TypeError):
        return True
    try:
        tree = ast.parse(textwrap.dedent(source))
    except SyntaxError:
        return True
    func = tree.body[0]
    while isinstance(func, ast.Expr):
        return True

    class _Visitor(ast.NodeVisitor):
        def __init__(self) -> None:
            self.awaits = False

        def visit_AsyncFunctionDef(self, node):
            if node is func:
                self.generic_visit(node)

        def visit_FunctionDef(self, node):
            return

        def visit_Await(self, node):
            self.awaits = True

        def visit_AsyncFor(self, node):
            self.awaits = True

        def visit_AsyncWith(self, node):
            self.awaits = True

    visitor = _Visitor()
    visitor.visit(func)
    return visitor.awaits


def _run_sync(async_fn):
    """Exécute une coroutine sans await jusqu'à son return."""

    def sync_endpoint(*args, **kwargs):
        coro = async_fn(*args, **kwargs)
        try:
            coro.send(None)
        except StopIteration as stop:
            return stop.value
        else:
            coro.close()
            raise RuntimeError(
                f"{async_fn.__name__} a suspendu sur un await ; "
                "la route doit rester sur la boucle."
            )

    sync_endpoint.__name__ = async_fn.__name__
    sync_endpoint.__qualname__ = getattr(async_fn, "__qualname__", async_fn.__name__)
    sync_endpoint.__doc__ = async_fn.__doc__
    sync_endpoint.__module__ = async_fn.__module__
    sync_endpoint.__annotations__ = getattr(async_fn, "__annotations__", {})
    sync_endpoint.__signature__ = inspect.signature(async_fn)
    return sync_endpoint


class ThreadpoolAPIRoute(APIRoute):
    def __init__(self, path: str, endpoint, **kwargs):
        if asyncio.iscoroutinefunction(endpoint) and not _function_awaits(endpoint):
            endpoint = _run_sync(endpoint)
        super().__init__(path, endpoint, **kwargs)
