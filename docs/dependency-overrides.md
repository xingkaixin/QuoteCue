# Dependency overrides

The scoped entries live in `pnpm-workspace.yaml`, apply only to WXT's local browser runner, and are not bundled into the extension.

| Override                        | Reason                                                                                       | Removal condition                                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `fx-runner>shell-quote@1.10.0`  | `fx-runner@1.4.0` pins a version affected by GHSA-w7jw-789q-3m8p and GHSA-395f-4hp3-45gv.    | Remove when WXT's `web-ext-run` path resolves `shell-quote` to a non-vulnerable version without an override. |
| `web-ext-run>tmp@0.2.7`         | `web-ext-run@0.2.4` pins a version affected by GHSA-ph9p-34f9-6g65.                          | Remove when `web-ext-run` depends on `tmp >=0.2.6`.                                                          |
| `firefox-profile>adm-zip@0.6.0` | `firefox-profile@4.7.0` allows only the vulnerable 0.5 line affected by GHSA-xcpc-8h2w-3j85. | Remove when `firefox-profile` supports `adm-zip >=0.6.0` upstream.                                           |

When changing these entries, run the high-severity audit gate, WXT checks and zip builds, and exercise the Firefox profile API before committing the new lockfile.
