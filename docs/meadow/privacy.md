# Meadow Privacy Notice

Last updated: July 18, 2026.

Meadow is an independent AT Protocol client. It connects directly to the AT
Protocol services selected by the user. Those services receive requests and
handle account data under their own privacy policies.

The Meadow web release does not send product analytics, remote feature-gate
attributes, crash reports, or diagnostic telemetry unless a Meadow operator
explicitly configures a separate destination at build time. It does not use
Bluesky's analytics or error-reporting systems.

Meadow uses the Bluesky AppView and related AT Protocol services by default for
network data, account capabilities, moderation, media, and age-policy
configuration. Those services receive ordinary request metadata such as the
client IP address. Optional geolocation, live-event, and remote app-configuration
workers are disabled in the public beta build.

The multiplicity service receives the authenticated account DID and requested
public post or actor identifiers. It indexes public AT Protocol posts, likes,
reposts, and follows from Jetstream, including record URIs and timestamps, to
calculate multiplicity and custom-feed results. It does not receive account
passwords, app passwords, refresh tokens, or authority to write to an account.

The hosting provider may process ordinary connection metadata needed to deliver
and protect the service. Public index data may remain in rotating operational
backups after it disappears from the live index until those backups expire.

Do not put sensitive information in public GitHub issues. See
[Meadow Support](./support.md) for help.
