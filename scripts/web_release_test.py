import hashlib
import io
import json
import os
import subprocess
import tarfile
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
ACTIVATE = ROOT / "scripts" / "activate_web_release.sh"
PUBLISH = ROOT / "scripts" / "publish_web_release.sh"
ROLLBACK = ROOT / "scripts" / "rollback_web_release.sh"
LINT_WORKFLOW = ROOT / ".github" / "workflows" / "lint.yml"
RELEASE_WORKFLOW = ROOT / ".github" / "workflows" / "meadow-web-release.yml"


class WebReleaseTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.sources = self.root / "sources"
        self.releases = self.root / "releases"
        self.current = self.root / "current"
        self.previous = self.root / "previous"
        self.sources.mkdir()
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        self.mock_gh = self.bin_dir / "gh"
        self.mock_gh.write_text(
            """#!/usr/bin/env python3
import os
import shutil
import sys
from pathlib import Path

args = sys.argv[1:]
if args[0] == "api":
    print(f'{args[1].rsplit("-", 1)[-1]} commit')
elif args[:2] == ["release", "download"]:
    commit = args[2].rsplit("-", 1)[-1]
    destination = Path(args[args.index("--dir") + 1])
    destination.mkdir(parents=True, exist_ok=True)
    source = Path(os.environ["MOCK_ARTIFACT_DIR"])
    for suffix in (".tar.gz", ".tar.gz.sha256"):
        name = f"meadow-web-{commit}{suffix}"
        shutil.copy2(source / name, destination / name)
elif args[:2] == ["attestation", "verify"]:
    pass
elif args[:2] == ["release", "view"]:
    commit = args[2].rsplit("-", 1)[-1]
    print(
        '{"isDraft":true,"tagName":"meadow-web-%s","targetCommitish":"%s"}'
        % (commit, commit)
    )
elif args[:2] == ["release", "edit"]:
    Path(os.environ["MOCK_PUBLISHED_MARKER"]).touch()
elif args[:2] == ["release", "upload"]:
    Path(os.environ["MOCK_REPAIRED_MARKER"]).touch()
else:
    raise SystemExit(f"unexpected gh invocation: {args}")
"""
        )
        self.mock_gh.chmod(0o755)

    def tearDown(self):
        self.temp.cleanup()

    def env(self):
        return {
            **os.environ,
            "MEADOW_RELEASE_ROOT": str(self.releases),
            "MEADOW_CURRENT_LINK": str(self.current),
            "MEADOW_PREVIOUS_LINK": str(self.previous),
            "MOCK_ARTIFACT_DIR": str(self.sources),
            "PATH": f"{self.bin_dir}:{os.environ['PATH']}",
        }

    def create_release(self, commit, body=None):
        archive = self.sources / f"meadow-web-{commit}.tar.gz"
        files = {
            "index.html": body or commit,
            "release.json": json.dumps({"commit": commit, "product": "Meadow"}),
        }
        with tarfile.open(archive, "w:gz") as output:
            for name, value in files.items():
                data = value.encode()
                info = tarfile.TarInfo(name)
                info.size = len(data)
                output.addfile(info, io.BytesIO(data))
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        archive.with_suffix(archive.suffix + ".sha256").write_text(
            f"{digest}  {archive.name}\n"
        )
        return archive

    def test_release_build_requires_successful_quality_workflow(self):
        release = RELEASE_WORKFLOW.read_text()
        lint = LINT_WORKFLOW.read_text()
        build = release.split("\n  build:\n", 1)[1].split("\n  attest:\n", 1)[0]

        self.assertIn("  workflow_call:\n", lint)
        self.assertNotIn("  push:\n", lint.split("concurrency:", 1)[0])
        self.assertIn("group: 'lint-${{ github.workflow }}-", lint)
        self.assertIn("    uses: ./.github/workflows/lint.yml\n", release)
        self.assertIn("    needs: quality\n", build)
        self.assertIn("needs.quality.result == 'success'", build)

    def activate(self, commit, check=True, extra_env=None):
        env = self.env()
        env.update(extra_env or {})
        result = subprocess.run(
            [str(ACTIVATE), commit],
            env=env,
            check=False,
            text=True,
            capture_output=True,
        )
        if check and result.returncode != 0:
            self.fail(
                f"activation failed for {commit}\n"
                f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}"
            )
        return result

    def test_activate_and_rollback_swap_verified_releases(self):
        first = "1" * 40
        second = "2" * 40
        self.create_release(first)
        self.create_release(second)

        self.activate(first)
        self.activate(second)
        self.assertEqual(self.current.resolve().name, second)
        self.assertEqual(self.previous.resolve().name, first)
        for release in (first, second):
            self.assertEqual((self.releases / release).stat().st_mode & 0o222, 0)

        result = subprocess.run(
            [str(ROLLBACK)],
            env=self.env(),
            check=True,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.stdout.strip(), first)
        self.assertEqual(self.current.resolve().name, first)
        self.assertEqual(self.previous.resolve().name, second)

    def test_corrupt_checksum_cannot_change_current(self):
        first = "3" * 40
        corrupt = "4" * 40
        self.create_release(first)
        archive = self.create_release(corrupt)
        archive.write_bytes(archive.read_bytes() + b"corrupt")

        self.activate(first)
        result = self.activate(corrupt, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.current.resolve().name, first)

    def test_existing_symlink_release_cannot_be_activated(self):
        first = "9" * 40
        linked = "a" * 40
        self.create_release(first)
        self.create_release(linked)
        self.activate(first)
        outside = self.root / "outside"
        outside.mkdir()
        (self.releases / linked).symlink_to(outside, target_is_directory=True)

        result = self.activate(linked, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.current.resolve().name, first)

    def test_interrupted_rollback_recovers_without_double_swapping(self):
        first = "b" * 40
        second = "c" * 40
        self.create_release(first)
        self.create_release(second)
        self.activate(first)
        self.activate(second)

        interrupted = subprocess.run(
            [str(ROLLBACK)],
            env={**self.env(), "MEADOW_RELEASE_FAIL_BEFORE_CURRENT": "1"},
            check=False,
            text=True,
            capture_output=True,
        )
        self.assertNotEqual(interrupted.returncode, 0)
        recovered = subprocess.run(
            [str(ROLLBACK)],
            env=self.env(),
            check=True,
            text=True,
            capture_output=True,
        )
        self.assertEqual(recovered.stdout.strip(), first)
        self.assertEqual(self.current.resolve().name, first)
        self.assertEqual(self.previous.resolve().name, second)
        self.assertFalse((self.releases / ".switch-journal").exists())

    def test_packaged_build_artifact_can_be_activated(self):
        artifact_dir = os.environ.get("MEADOW_TEST_PACKAGED_ARTIFACT")
        if not artifact_dir:
            self.skipTest("packaged build artifact was not provided")
        commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
        source = Path(artifact_dir)
        for suffix in (".tar.gz", ".tar.gz.sha256"):
            name = f"meadow-web-{commit}{suffix}"
            (self.sources / name).write_bytes((source / name).read_bytes())

        self.activate(commit)
        self.assertTrue((self.current.resolve() / "index.html").is_file())
        self.assertTrue((self.current.resolve() / "release.json").is_file())

    def test_rollback_after_interrupted_activation_returns_to_old_release(self):
        first = "d" * 40
        second = "e" * 40
        self.create_release(first)
        self.create_release(second)
        self.activate(first)

        interrupted = self.activate(
            second,
            check=False,
            extra_env={"MEADOW_RELEASE_FAIL_BEFORE_CURRENT": "1"},
        )
        self.assertNotEqual(interrupted.returncode, 0)
        self.assertEqual(self.current.resolve().name, first)

        result = subprocess.run(
            [str(ROLLBACK)],
            env=self.env(),
            check=True,
            text=True,
            capture_output=True,
        )
        self.assertEqual(result.stdout.strip(), first)
        self.assertEqual(self.current.resolve().name, first)
        self.assertEqual(self.previous.resolve().name, second)

    def test_activation_after_interrupted_activation_honors_requested_release(self):
        first = "1a" * 20
        interrupted_commit = "2b" * 20
        requested = "3c" * 20
        for commit in (first, interrupted_commit, requested):
            self.create_release(commit)
        self.activate(first)

        interrupted = self.activate(
            interrupted_commit,
            check=False,
            extra_env={"MEADOW_RELEASE_FAIL_BEFORE_CURRENT": "1"},
        )
        self.assertNotEqual(interrupted.returncode, 0)

        result = self.activate(requested)
        self.assertEqual(result.stdout.strip(), requested)
        self.assertEqual(self.current.resolve().name, requested)
        self.assertEqual(self.previous.resolve().name, interrupted_commit)

    def test_publish_recovers_verified_draft(self):
        commit = subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=ROOT, text=True
        ).strip()
        self.create_release(commit)
        marker = self.root / "published"
        repaired = self.root / "repaired"
        env = {
            **os.environ,
            "PATH": f"{self.bin_dir}:{os.environ['PATH']}",
            "ARTIFACT_DIR": str(self.sources),
            "MOCK_ARTIFACT_DIR": str(self.sources),
            "MOCK_PUBLISHED_MARKER": str(marker),
            "MOCK_REPAIRED_MARKER": str(repaired),
        }

        result = subprocess.run(
            [str(PUBLISH), commit],
            cwd=ROOT,
            env=env,
            check=True,
            text=True,
            capture_output=True,
        )
        self.assertTrue(marker.is_file())
        self.assertTrue(repaired.is_file())
        self.assertIn("Recovered and published verified draft", result.stdout)

    def test_unsafe_archive_cannot_escape_or_change_current(self):
        first = "5" * 40
        unsafe = "6" * 40
        self.create_release(first)
        self.activate(first)

        archive = self.sources / f"meadow-web-{unsafe}.tar.gz"
        with tarfile.open(archive, "w:gz") as output:
            data = b"escape"
            info = tarfile.TarInfo("../escape")
            info.size = len(data)
            output.addfile(info, io.BytesIO(data))
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        archive.with_suffix(archive.suffix + ".sha256").write_text(
            f"{digest}  {archive.name}\n"
        )

        result = self.activate(unsafe, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse((self.root / "escape").exists())
        self.assertEqual(self.current.resolve().name, first)

    def test_checksum_must_cover_the_named_release_archive(self):
        first = "7" * 40
        unchecked = "8" * 40
        self.create_release(first)
        archive = self.create_release(unchecked)
        hosts = Path("/etc/hosts")
        digest = hashlib.sha256(hosts.read_bytes()).hexdigest()
        archive.with_suffix(archive.suffix + ".sha256").write_text(
            f"{digest}  {hosts}\n"
        )

        self.activate(first)
        result = self.activate(unchecked, check=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.current.resolve().name, first)


if __name__ == "__main__":
    unittest.main()
