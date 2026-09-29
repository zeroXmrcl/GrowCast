import ssl
import unittest
from pathlib import Path

from sf_client import (
    MQTT_HOST,
    assert_read_only,
    configure_tls,
    default_ca_file,
    mqtt_ssl_context,
    topics,
)


class ReadOnlyTests(unittest.TestCase):
    def test_getdevsta_allowed(self) -> None:
        assert_read_only("getDevSta")

    def test_set_methods_forbidden(self) -> None:
        for method in ("setLight", "setFan", "setBlower", "setConfigField", "setConfigFile", ""):
            with self.subTest(method=method):
                with self.assertRaises(RuntimeError):
                    assert_read_only(method)

    def test_topics(self) -> None:
        up, down = topics("cb", "90e5b1b87088")
        self.assertEqual(up, "SF/GGS/CB/API/UP/90E5B1B87088")
        self.assertEqual(down, "SF/GGS/CB/API/DOWN/90E5B1B87088")

    def test_tls_refuses_other_hosts(self) -> None:
        class Dummy:
            def tls_set_context(self, ctx):  # noqa: ANN001
                raise AssertionError("should not set tls")

            def tls_insecure_set(self, value):  # noqa: ANN001
                raise AssertionError("should not set insecure")

        with self.assertRaises(RuntimeError):
            configure_tls(Dummy(), "example.com")  # type: ignore[arg-type]
        self.assertEqual(MQTT_HOST, "sf.mqtt.spider-farmer.com")

    def test_tls_uses_pinned_ca_not_skip_verify(self) -> None:
        pin = default_ca_file()
        self.assertTrue(pin.is_file())

        class Dummy:
            def __init__(self) -> None:
                self.ctx: ssl.SSLContext | None = None
                self.insecure: bool | None = None

            def tls_set_context(self, ctx: ssl.SSLContext) -> None:
                self.ctx = ctx

            def tls_insecure_set(self, value: bool) -> None:
                self.insecure = value

        dummy = Dummy()
        configure_tls(dummy, MQTT_HOST, ca_certs=str(pin))  # type: ignore[arg-type]
        self.assertIsNotNone(dummy.ctx)
        assert dummy.ctx is not None
        self.assertEqual(dummy.ctx.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(dummy.ctx.check_hostname)
        self.assertNotEqual(dummy.ctx.verify_mode, ssl.CERT_NONE)
        self.assertIsNone(dummy.insecure)

        ctx = mqtt_ssl_context(str(pin))
        self.assertEqual(ctx.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(ctx.check_hostname)

    def test_tls_missing_pin_raises(self) -> None:
        class Dummy:
            def tls_set_context(self, ctx):  # noqa: ANN001
                raise AssertionError("should not set tls")

        with self.assertRaises(RuntimeError):
            configure_tls(Dummy(), MQTT_HOST, ca_certs=str(Path("/no/such/mqtt-ca.pem")))  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
