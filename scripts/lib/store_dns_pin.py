"""Point the store hostname at an IP, for as long as the store has no working DNS.

The Python half of scripts/lib/store-dns-pin.mjs. Same variable, same spec
format, same warnings — read that file first; it carries the reasoning and this
one deliberately does not repeat it.

WHY A SECOND COPY RATHER THAN A SHARED ONE. There is nothing to share: the Node
version monkey-patches `dns.lookup`, and the only way to steer urllib is to
resolve the host ourselves and open the socket against the address while keeping
the certificate and the Host header on the real name. The contract is shared;
the mechanism cannot be.

WHY IT WAS NEEDED. normalize-product-bg.py fetched the store over plain urllib,
so after the 27 August cutover it took Vercel's answer for masterkraft.com and
died on HTTP 404 at its first request — which was misread as the WooCommerce
install being gone. It is not gone. It is the same server it always was, still
serving the whole catalogue and every product original; it lost its name, and
the Node scripts had a splint for that while the Python ones did not.

TLS IS STILL FULLY VERIFIED, exactly as in the Node version. Only the address
the socket connects to is overridden. The certificate is checked against the
real hostname through SNI and check_hostname, so a wrong or hijacked pin fails
the handshake rather than silently succeeding. Nothing here weakens that, and
nothing here should ever need to.
"""

import http.client
import os
import socket
import ssl
import sys
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent.parent


def from_env_file(name):
    if os.environ.get(name):
        return os.environ[name]
    try:
        for line in (ROOT / ".env.local").read_text().splitlines():
            eq = line.find("=")
            if eq > 0 and line[:eq].strip() == name:
                return line[eq + 1:].strip().strip('"').strip("'")
    except OSError:
        pass  # No .env.local is normal on CI. Nothing to pin.
    return None


def _build_opener(host, address):
    ctx = ssl.create_default_context()

    class PinnedHTTPSConnection(http.client.HTTPSConnection):
        """Socket goes to the address; TLS still answers to the real hostname.

        Keeping those two apart is the whole trick, and it is why the pin cannot
        be pointed somewhere hostile: server_hostname stays the real name, so a
        wrong address fails certificate verification instead of being trusted.
        """

        def connect(self):
            self.sock = socket.create_connection(
                (address, self.port), self.timeout, self.source_address
            )
            if self._tunnel_host:
                self._tunnel()
            self.sock = ctx.wrap_socket(self.sock, server_hostname=host)

    class Handler(urllib.request.HTTPSHandler):
        def https_open(self, req):
            if urlsplit(req.full_url).hostname != host:
                return super().https_open(req)

            def build(conn_host, **kwargs):
                kwargs.pop("context", None)
                # conn_host is the real hostname, which is what the Host header
                # is taken from — that server routes its vhosts by name and the
                # bare IP 404s, so it must not become the address.
                return PinnedHTTPSConnection(conn_host, **kwargs)

            return self.do_open(build, req)

    return urllib.request.build_opener(Handler)


def install():
    """Install the pin as urllib's global opener. Inert unless WC_STORE_PIN is set."""
    spec = from_env_file("WC_STORE_PIN")
    if not spec:
        return False

    host, _, address = spec.partition("=")
    host, address = host.strip(), address.strip()
    if not host or not address:
        raise ValueError(f'WC_STORE_PIN must look like "masterkraft.com=1.2.3.4", got "{spec}"')

    # A pin aimed at a host we no longer talk to is worse than no pin: it reads
    # like the store is still stranded when it is not. Say so, and do nothing.
    store_url = from_env_file("WC_STORE_URL")
    store_host = urlsplit(store_url).hostname if store_url else None
    if store_host and store_host != host:
        print(
            f"store-dns-pin: STALE. WC_STORE_PIN pins {host}, but WC_STORE_URL is now "
            f"{store_host}.\n                Nothing was pinned. Delete WC_STORE_PIN "
            "from .env.local.",
            file=sys.stderr,
        )
        return False

    urllib.request.install_opener(_build_opener(host, address))
    print(
        f"store-dns-pin: {host} -> {address} (WC_STORE_PIN). The store has no working\n"
        "                DNS name yet. Remove WC_STORE_PIN once it does.",
        file=sys.stderr,
    )
    return True
