# Licensing and responsible marketing

This is an engineering summary, not legal advice. Obtain counsel before a
public source release or commercial launch.

## What may be changed

Most Twenty core code is governed by AGPLv3 plus Twenty's Application
Exception. You may modify and operate that code. If users interact with the
modified program over a network, they must receive a prominent, no-charge way
to obtain the exact Corresponding Source used by the service, including your
core modifications and build material.

The Twenty SDK, CLI, UI package, and `packages/twenty-apps` are generally MIT
licensed. A separately built Streetlight app can therefore remain under its
chosen license when it stays within the Application Exception. Changes made
inside AGPL core remain subject to AGPL obligations.

Some source files carry an Enterprise license header. Do not publicly
redistribute, sublicense, or market those components as Streetlight-owned
software without confirming the governing commercial rights. Keep this fork
private until a file-level license inventory and legal review settle that
boundary.

## Ethical product positioning

- Use the distinct name **Streetlight CRM** and original branding.
- Accurately describe it as “built on Twenty” or “a fork of Twenty.”
- Preserve copyright, license, and attribution notices.
- Do not imply endorsement, partnership, or origin by Twenty.
- Publish a clear list of Streetlight changes and their dates.
- Give every hosted customer an easy source-code link for the exact running
  build and plain-language information about support, updates, backups, data
  export, and service termination.
- Market service, implementation, nonprofit workflows, support, migrations,
  training, and managed operations—never exclusivity over upstream code you do
  not own.

Before launch, review `LICENSE`, `.github/TRADEMARK.md`, every Enterprise-marked
file included in the distribution, dependency notices, and the final product
name/logo with qualified counsel.
