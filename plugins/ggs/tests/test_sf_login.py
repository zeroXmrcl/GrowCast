import json
import unittest
from unittest.mock import MagicMock

from sf_login import (
    LOGIN_URL,
    BrokerLogin,
    LoginError,
    decrypt_body,
    encrypt_body,
    login_systemdata,
    mail_login,
    resolve_broker_login,
    session_from_login,
)


class EncryptTests(unittest.TestCase):
    def test_roundtrip_keeps_login_method_as_int(self) -> None:
        body = {"email": "a@b.c", "loginMethod": 1, "password": "secret"}
        wire = encrypt_body(body)
        self.assertNotIn("{", wire)
        with self.assertRaises(json.JSONDecodeError):
            json.loads(wire)
        self.assertEqual(decrypt_body(wire), body)
        self.assertIsInstance(decrypt_body(wire)["loginMethod"], int)

    def test_padding_when_plaintext_is_block_aligned(self) -> None:
        body = {"email": "abcd@ef.gh", "loginMethod": 1, "password": "0123456789abcdef0123456789ab"}
        raw = json.dumps(body, separators=(",", ":")).encode()
        self.assertEqual(len(raw) % 16, 0)
        self.assertEqual(decrypt_body(encrypt_body(body)), body)


class MailLoginTests(unittest.TestCase):
    def test_posts_encrypted_ios_v2_body_and_reads_mqtt_fields(self) -> None:
        seen: dict[str, object] = {}

        def post(url, data=None, headers=None, timeout=None):  # noqa: ANN001
            seen["url"] = url
            seen["data"] = data
            seen["headers"] = headers
            seen["timeout"] = timeout
            response = MagicMock()
            response.status_code = 200
            response.text = encrypt_body(
                {
                    "code": "000",
                    "msg": "success",
                    "data": {
                        "mqttName": "a@b.c",
                        "mqttPwd": "brokerpass-22-characters",
                        "userId": 42,
                        "token": "rest-token",
                    },
                }
            )
            return response

        session = mail_login("a@b.c", "secret", post=post, now_s=1_700_000_000)
        self.assertEqual(seen["url"], LOGIN_URL)
        self.assertEqual(seen["timeout"], 20)
        headers = seen["headers"]
        assert isinstance(headers, dict)
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(headers["User-Agent"], "Dart/3.5 (dart:io)")
        system = json.loads(headers["systemdata"])
        self.assertEqual(system["appVersion"], "2.5.2")
        self.assertEqual(system["osType"], "iOS")
        self.assertEqual(system["osVersion"], "27.0")
        self.assertEqual(system["deviceType"], "iPhone")
        self.assertEqual(system["timezone"], "Europe/Berlin")
        self.assertEqual(system["timestamp"], 1_700_000_000)
        self.assertEqual(system["reqId"], 1_700_000_000_000)
        self.assertNotIn("token", system)
        self.assertEqual(login_systemdata(1_700_000_000), headers["systemdata"])
        posted = seen["data"]
        assert isinstance(posted, str)
        self.assertEqual(
            decrypt_body(posted),
            {"email": "a@b.c", "loginMethod": 1, "password": "secret"},
        )
        self.assertEqual(
            session,
            BrokerLogin(
                mqtt_name="a@b.c",
                mqtt_pwd="brokerpass-22-characters",
                user_id="42",
                via="mail",
            ),
        )

    def test_failure_code_omits_password(self) -> None:
        def post(url, data=None, headers=None, timeout=None):  # noqa: ANN001
            response = MagicMock()
            response.status_code = 200
            response.text = json.dumps(
                {"code": "100", "msg": "The password entered is incorrect.", "data": None}
            )
            return response

        with self.assertRaises(LoginError) as caught:
            mail_login("a@b.c", "secret-value", post=post, now_s=1)
        self.assertEqual(caught.exception.code, "100")
        self.assertNotIn("secret-value", str(caught.exception))

    def test_missing_mqtt_fields(self) -> None:
        with self.assertRaises(LoginError) as caught:
            session_from_login({"code": "000", "data": {"mqttName": "a@b.c"}})
        self.assertEqual(caught.exception.msg, "missing mqtt credentials")


class ResolveTests(unittest.TestCase):
    def test_email_wins_over_mqtt_env(self) -> None:
        def login(email: str, password: str) -> BrokerLogin:
            self.assertEqual(email, "a@b.c")
            self.assertEqual(password, "secret")
            return BrokerLogin("a@b.c", "from-login", "9", "mail")

        got = resolve_broker_login(
            {
                "SF_EMAIL": "a@b.c",
                "SF_PASSWORD": "secret",
                "SF_MQTT_NAME": "old",
                "SF_MQTT_PWD": "old-pwd",
                "SF_USER_ID": "1",
            },
            login,
        )
        self.assertEqual(got.mqtt_pwd, "from-login")
        self.assertEqual(got.user_id, "9")
        self.assertEqual(got.via, "mail")

    def test_mqtt_env_fallback(self) -> None:
        got = resolve_broker_login(
            {"SF_MQTT_NAME": "user", "SF_MQTT_PWD": "pwd", "SF_USER_ID": "175391"}
        )
        self.assertEqual(got, BrokerLogin("user", "pwd", "175391", "env"))

    def test_email_without_password_uses_mqtt_env(self) -> None:
        got = resolve_broker_login(
            {"SF_EMAIL": "a@b.c", "SF_MQTT_NAME": "user", "SF_MQTT_PWD": "pwd", "SF_USER_ID": "7"}
        )
        self.assertEqual(got, BrokerLogin("user", "pwd", "7", "env"))

    def test_password_without_email_is_an_error(self) -> None:
        with self.assertRaises(ValueError):
            resolve_broker_login({"SF_PASSWORD": "secret", "SF_MQTT_NAME": "user", "SF_MQTT_PWD": "pwd"})

    def test_nothing_set_is_an_error(self) -> None:
        with self.assertRaises(ValueError):
            resolve_broker_login({})


if __name__ == "__main__":
    unittest.main()
