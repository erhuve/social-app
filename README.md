# Meadow

Meadow is an independent AT Protocol client that makes repeated likes, reposts,
and follows visible as multiplicity. It is not operated by or affiliated with
Bluesky Social PBC.

The public-beta web client uses the Bluesky AppView and related AT Protocol
services for network data, account capabilities, moderation, media, and other
provider-owned behavior. Meadow's companion multiplicity service indexes public
Jetstream records and serves aggregate counts and viewer-owned record URIs.

## Development

The client is a React Native and React Native Web application written in
TypeScript, with Go servers under `bskyweb/`. It is based on Bluesky's MIT-licensed
[`social-app`](https://github.com/bluesky-social/social-app) and uses the open
[`atproto`](https://github.com/bluesky-social/atproto) packages and `app.bsky.*`
lexicons.

See [`docs/build.md`](./docs/build.md) for upstream build instructions. Meadow's
release-specific gates are:

```bash
pnpm check-fork-hygiene
pnpm check-meadow-config
pnpm lint
pnpm typecheck
pnpm test
pnpm build-web
pnpm check-fork-hygiene web-build
```

Native Meadow releases are deliberately disabled until fork-owned signing, app
groups, push identity, update infrastructure, and store records are configured.

Web builds from `main` are published as durable GitHub Releases keyed by the full
commit SHA. On the Zo deployment, activate or roll back a verified release with:

```bash
scripts/activate_web_release.sh <full-commit-sha>
scripts/rollback_web_release.sh
```

Activation verifies GitHub's signed build provenance, the exact main-branch commit,
the checksum, the manifest, and referenced assets before installing into `releases/`
and atomically switching `current`. Rollback swaps `current` with `previous`; an
on-disk switch journal makes interrupted activation or rollback recoverable on the
next command. The SPA server should use `--directory current
--fallback-directory previous` so clients loading across a switch can still fetch
the prior release's hashed assets.

## Support and policies

- [Support](./docs/meadow/support.md)
- [Privacy notice](./docs/meadow/privacy.md)
- [Public beta terms](./docs/meadow/terms.md)
- [Community guidelines](./docs/meadow/community-guidelines.md)
- [Copyright notice](./docs/meadow/copyright.md)
- [Security policy](./SECURITY.md)

Do not include credentials, private messages, email addresses, personal data, or
vulnerability details in public issues. Account access, moderation, takedowns,
and hosted-content reports belong with the relevant AT Protocol provider.

## License and attribution

See [`LICENSE`](./LICENSE). Meadow retains the upstream project's license and
attribution. Bluesky Social PBC is not responsible for this fork or its support.
