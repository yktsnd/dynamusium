# Security Policy

## Scope

KinetiFlux is a fully client-side static web application: it has no server
component, no backend, and no data collection. Almost all realistic security
concerns are therefore about the dependency and build chain (npm packages,
the Vite/TypeScript toolchain, and the GitHub Actions used to build and
deploy the site) rather than a runtime attack surface exposed to end users.

## Supported Versions

| Version          | Supported |
| ---------------- | --------- |
| 0.1.x            | Yes       |
| `main` (latest)  | Yes       |
| Older than 0.1.x | No        |

## Reporting a Vulnerability

Please report security issues privately using **GitHub Security Advisories**:
open the "Security" tab on the repository and select **"Report a
vulnerability."** Do not open a public issue for a suspected vulnerability.

When reporting, please include:

- the KinetiFlux version or commit hash you tested,
- the browser (and version) used,
- clear reproduction steps,
- your assessment of the impact.

## Acknowledgement Process

A maintainer will acknowledge new reports within 7 days. From there, the
maintainer and reporter will work through a coordinated fix, and disclosure
will happen once a fix is available (or once a reasonable resolution has been
reached), in coordination with the reporter.
