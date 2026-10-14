# App icons

| File                            | Source          | Use                                                                                              |
| ------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `icon.svg`                      | —               | favicon, manifest (`any`), login screen; rounded corners                                         |
| `icon-192.png`, `icon-512.png`  | `icon.svg`      | manifest icons (`purpose: any`)                                                                  |
| `icon-full.svg`                 | —               | square, full-bleed artwork                                                                       |
| `apple-touch-icon.png` (180)    | `icon-full.svg` | iOS home screen — iOS applies its own rounded mask and would fill transparent corners with black |
| `icon-maskable-512.png`         | `icon-full.svg` | Android adaptive icons (`purpose: maskable`)                                                     |
| `../favicon.ico` (48, PNG data) | `icon.svg`      | legacy `/favicon.ico` requests                                                                   |

Regenerate on macOS:

```bash
cd frontend/public/icons
for s in 192 512; do sips -s format png -z $s $s icon.svg --out icon-$s.png; done
sips -s format png -z 180 180 icon-full.svg --out apple-touch-icon.png
sips -s format png -z 512 512 icon-full.svg --out icon-maskable-512.png
sips -s format png -z 48 48 icon.svg --out ../favicon.ico
cp icon.svg ../../src/app/icon.svg
```
