#!/usr/bin/env python3
"""
cred-setup.py — store the smail login (full address + password) into macOS Keychain.

Runs interactively in your Terminal. The password is entered through the macOS
`security` hidden prompt (`-w` as the last option reads from the controlling
terminal with echo disabled), so it is never shown, never written to shell
history / logs / code / chat, and never passed through argv.

If webmail "secure login" is enabled, enter the client-specific password
(客户端专用密码) here instead of the mailbox password.

    npm run cred:setup
"""
import json
import os
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
settings = json.loads((ROOT / "config" / "settings.example.json").read_text(encoding="utf-8"))
SERVICE = settings["keychain"]["service"]


def fail(msg):
    sys.stderr.write(f"cred-setup failed: {msg}\n")
    sys.exit(1)


def main():
    if not sys.stdin.isatty():
        fail("must be run interactively in a Terminal window")

    account = input("smail address (예: xxxxxxxx@smail.nju.edu.cn): ").strip()
    if not account or "@" not in account:
        fail("full smail address is required")

    cmd = [
        "/usr/bin/security",
        "add-generic-password",
        "-U",
        "-s", SERVICE,
        "-a", account,
        "-T", "/usr/bin/security",
    ]
    for node in ("/opt/homebrew/bin/node", "/usr/bin/node", "/usr/local/bin/node"):
        if os.path.exists(node):
            cmd += ["-T", node]
    cmd += ["-w"]  # last option -> macOS asks for the password with echo disabled

    sys.stderr.write(
        "\nmacOS가 비밀번호를 숨김 프롬프트로 물어봅니다 (화면에 입력이 표시되지 않습니다).\n"
        "보안 로그인이 켜져 있으면 메일함 비밀번호 대신 클라이언트 전용 비밀번호를 입력하세요.\n\n"
    )
    sys.stderr.flush()
    rc = subprocess.call(cmd)
    if rc != 0:
        fail(f"security add-generic-password returned {rc}")

    check = subprocess.run(
        ["/usr/bin/security", "find-generic-password", "-s", SERVICE],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if check.returncode != 0:
        fail("item was not found after adding")

    sys.stdout.write(
        f"\nSaved to macOS Keychain (service={SERVICE}, account={'*' * len(account)}).\n"
    )
    sys.stdout.write("Credential is never written to disk / code / chat.\n")
    sys.stdout.write("Next: npm run mail:cred-verify\n")


if __name__ == "__main__":
    main()
