"""Tests for the ScraperCity Python SDK. Run: python -m unittest discover -s tests (from python/).

A local HTTP server stands in for app.scrapercity.com; the client, LangChain and the OpenAI Agents SDK
are the real libraries. No request leaves the machine.
"""
import asyncio
import inspect
import json
import os
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import scrapercity  # noqa: E402
from scrapercity import ScraperCity, ScraperCityError  # noqa: E402
from scrapercity._catalog import ENDPOINT_BY_TOOL, TOOLS  # noqa: E402

CALLS = []


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _reply(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(n) if n else b""
        u = urlparse(self.path)
        CALLS.append({
            "method": self.command, "path": u.path, "query": parse_qs(u.query),
            "auth": self.headers.get("Authorization"), "ua": self.headers.get("User-Agent"),
            "body": json.loads(body) if body else None,
        })
        if u.path.endswith("/fail"):
            self.send_response(402)
            self.end_headers()
            self.wfile.write(json.dumps({"error": "Not enough credits"}).encode())
            return
        if u.path.startswith("/api/downloads/") or "format=csv" in u.query:
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"name,email\na,b@c.com\n")
            return
        self.send_response(200)
        self.end_headers()
        self.wfile.write(json.dumps({"ok": True, "status": "SUCCEEDED", "runId": "r1"}).encode())

    do_GET = do_POST = _reply


class SDKTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = f"http://127.0.0.1:{cls.srv.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()

    def setUp(self):
        CALLS.clear()
        self.sc = ScraperCity("k", base_url=self.base)

    def test_auth_user_agent_and_wallet(self):
        self.sc.wallet()
        c = CALLS[0]
        self.assertEqual((c["method"], c["path"], c["auth"]), ("GET", "/api/v1/wallet", "Bearer k"))
        self.assertEqual(c["ua"], f"scrapercity-python/{scrapercity.__version__}")

    def test_key_from_env(self):
        os.environ["SCRAPERCITY_API_KEY"] = "envkey"
        try:
            ScraperCity(base_url=self.base).wallet()
        finally:
            del os.environ["SCRAPERCITY_API_KEY"]
        self.assertEqual(CALLS[0]["auth"], "Bearer envkey")

    def test_every_tool_dispatches(self):
        names = [t["name"] for t in TOOLS]
        self.assertEqual(len(names), len(set(names)))
        with tempfile.TemporaryDirectory() as d:
            for name in names:
                args = {"runId": "r1", "id": "j1", "query": "dentists", "domains": ["a.com"], "outputPath": os.path.join(d, name + ".csv")}
                if name in ENDPOINT_BY_TOOL:
                    args = {"x": 1}
                self.sc.call_tool(name, args)
        self.assertEqual(len(CALLS), len(names))
        for name, c in zip(names, CALLS):
            if name in ENDPOINT_BY_TOOL:
                self.assertEqual((c["method"], c["path"], c["body"]), ("POST", ENDPOINT_BY_TOOL[name], {"x": 1}))
        with self.assertRaises(ValueError):
            self.sc.call_tool("no_such_tool", {})

    def test_database_booleans_and_cursor(self):
        self.sc.call_tool("query_lead_database", {"title": "CEO", "hasEmail": True, "hasPhone": False, "excludeDelivered": False, "after": 0, "country": ["United States", "Canada"]})
        c = CALLS[0]
        self.assertEqual((c["method"], c["path"]), ("GET", "/api/v1/database/leads"))
        q = c["query"]
        self.assertEqual(q["hasEmail"], ["true"])
        self.assertNotIn("hasPhone", q)
        self.assertNotIn("excludeDelivered", q)
        self.assertEqual(q["after"], ["0"])
        self.assertEqual(q["country"], ["United States", "Canada"])

    def test_long_search_goes_as_post(self):
        self.sc.query_leads(url="https://app.apollo.io/#/people?" + "x" * 7000, limit=5)
        c = CALLS[0]
        self.assertEqual((c["method"], c["path"]), ("POST", "/api/v1/database/leads"))
        self.assertEqual(c["body"]["limit"], 5)

    def test_error_carries_status_and_message(self):
        with self.assertRaises(ScraperCityError) as e:
            self.sc._post("/api/v1/fail", {})
        self.assertEqual(e.exception.status, 402)
        self.assertEqual(str(e.exception), "Not enough credits")
        self.assertIsInstance(e.exception, RuntimeError)

    def test_download_and_lookalike_csv(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "o.csv")
            self.assertEqual(self.sc.download("r1", p)["bytes"], 21)
            self.assertEqual(open(p).read().splitlines()[0], "name,email")
            r = self.sc.call_tool("download_lookalike_csv", {"id": "j1", "outputPath": os.path.join(d, "l.csv")})
            self.assertTrue(r["success"])
        self.assertEqual(CALLS[-1]["query"], {"id": ["j1"], "format": ["csv"]})

    def test_snake_case_args_still_work(self):
        self.sc.call_tool("check_run_status", {"run_id": "abc"})
        self.assertEqual(CALLS[0]["path"], "/api/v1/scrape/status/abc")

    def test_old_methods_keep_their_signatures(self):
        old_dir = os.environ.get("SC_OLD_PACKAGE")
        if not old_dir:
            self.skipTest("SC_OLD_PACKAGE not set")
        import importlib.util
        spec = importlib.util.spec_from_file_location("old_sc_client", os.path.join(old_dir, "scrapercity", "client.py"))
        old = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(old)
        for name, fn in inspect.getmembers(old.ScraperCity, inspect.isfunction):
            if name.startswith("_"):
                continue
            new_fn = getattr(ScraperCity, name, None)
            self.assertIsNotNone(new_fn, f"method {name} removed")
            old_params = [(p.name, p.kind, p.default) for p in inspect.signature(fn).parameters.values()]
            new_params = [(p.name, p.kind, p.default) for p in inspect.signature(new_fn).parameters.values()]
            self.assertEqual(new_params[:len(old_params)], old_params, name)

    def test_openai_definitions_and_handler(self):
        from scrapercity import openai_tools
        openai_tools._client = self.sc
        defs = openai_tools.get_function_definitions()
        self.assertEqual([d["function"]["name"] for d in defs], [t["name"] for t in TOOLS])
        self.assertEqual(len(openai_tools.get_response_tools()), len(TOOLS))
        out = json.loads(openai_tools.handle_tool_call("check_wallet", "{}"))
        self.assertTrue(out["ok"])
        err = json.loads(openai_tools.handle_tool_call("nope", {}))
        self.assertIn("Unknown tool", err["error"])

    def test_langchain_tools(self):
        try:
            import langchain_core  # noqa: F401
        except ImportError:
            self.skipTest("langchain-core not installed")
        os.environ["SCRAPERCITY_BASE_URL"] = self.base
        try:
            tools = scrapercity.langchain_tools("k")
            again = scrapercity.langchain_tools("k", include=["check_wallet"])
        finally:
            del os.environ["SCRAPERCITY_BASE_URL"]
        self.assertEqual([t.name for t in tools], [t["name"] for t in TOOLS])
        self.assertEqual([t.name for t in again], ["check_wallet"])
        by = {t.name: t for t in tools}
        json.loads(by["query_lead_database"].invoke({"title": "CEO", "hasEmail": True, "limit": 1}))
        self.assertEqual(CALLS[-1]["query"]["hasEmail"], ["true"])
        json.loads(by["validate_emails"].invoke({"emails": ["a@b.com"]}))
        self.assertEqual(CALLS[-1]["body"], {"emails": ["a@b.com"]})
        bad = json.loads(by["check_run_status"].invoke({"runId": "fail"}))
        self.assertEqual(CALLS[-1]["path"], "/api/v1/scrape/status/fail")
        self.assertEqual(bad, {"error": "Not enough credits"})

    def test_openai_agents_function_tools(self):
        try:
            from agents import FunctionTool  # noqa: F401
            from agents.tool_context import ToolContext  # noqa: F401
        except ImportError:
            self.skipTest("openai-agents not installed")
        from scrapercity import openai_tools
        openai_tools._client = self.sc
        tools = openai_tools.get_tools()
        self.assertEqual([t.name for t in tools], [t["name"] for t in TOOLS])
        by = {t.name: t for t in tools}
        out = asyncio.run(by["plan_search"].on_invoke_tool(None, json.dumps({"query": "dentists in Austin"})))
        self.assertTrue(json.loads(out)["ok"])
        self.assertEqual(CALLS[-1]["body"], {"query": "dentists in Austin"})


if __name__ == "__main__":
    unittest.main()
